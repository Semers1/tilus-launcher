//! Tilus Launcher additions: the hardware probe behind autotune, and the Windows
//! per-application GPU preference that makes Java start on the high-performance GPU.

use serde::Serialize;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind};

#[derive(Serialize, Debug, Clone)]
pub struct GpuInfo {
    pub name: String,
    pub vendor_id: u32,
    pub dedicated_memory_mb: u64,
    /// Integrated GPUs live on the CPU and borrow system memory; Windows reports
    /// only a small (or no) dedicated video memory for them.
    pub integrated: bool,
}

#[derive(Serialize, Debug, Clone)]
pub struct HardwareInfo {
    pub cpu_name: String,
    pub cpu_threads: usize,
    pub cpu_cores: Option<usize>,
    pub total_memory_mb: u64,
    pub gpus: Vec<GpuInfo>,
}

const MIB: u64 = 1024 * 1024;

#[tracing::instrument]
pub fn hardware_info() -> HardwareInfo {
    let system = sysinfo::System::new_with_specifics(
        RefreshKind::nothing()
            .with_memory(MemoryRefreshKind::nothing().with_ram())
            .with_cpu(CpuRefreshKind::nothing()),
    );
    let cpus = system.cpus();

    HardwareInfo {
        cpu_name: cpus
            .first()
            .map(|cpu| cpu.brand().trim().to_string())
            .unwrap_or_default(),
        cpu_threads: cpus.len(),
        cpu_cores: sysinfo::System::physical_core_count(),
        total_memory_mb: system.total_memory() / MIB,
        gpus: gpus(),
    }
}

#[cfg(windows)]
fn gpus() -> Vec<GpuInfo> {
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE, IDXGIFactory1,
    };

    let mut gpus = Vec::new();
    let Ok(factory) = (unsafe { CreateDXGIFactory1::<IDXGIFactory1>() })
    else {
        return gpus;
    };

    let mut index = 0;
    while let Ok(adapter) = unsafe { factory.EnumAdapters1(index) } {
        index += 1;
        let Ok(desc) = (unsafe { adapter.GetDesc1() }) else {
            continue;
        };
        let dedicated_memory_mb = desc.DedicatedVideoMemory as u64 / MIB;
        // Software rasterizers and virtual display adapters have no video memory of their own
        if desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0
            || (dedicated_memory_mb == 0 && desc.SharedSystemMemory == 0)
        {
            continue;
        }
        let name = String::from_utf16_lossy(&desc.Description)
            .trim_end_matches('\0')
            .trim()
            .to_string();
        if gpus.iter().any(|gpu: &GpuInfo| gpu.name == name) {
            continue;
        }

        gpus.push(GpuInfo {
            name,
            vendor_id: desc.VendorId,
            dedicated_memory_mb,
            integrated: dedicated_memory_mb < 1024,
        });
    }
    gpus
}

#[cfg(not(windows))]
fn gpus() -> Vec<GpuInfo> {
    Vec::new()
}

/// Asks Windows to run every Java the launcher knows about on the high-performance GPU,
/// the same as choosing "High performance" for it in Settings → Display → Graphics.
/// Returns the executables that were set.
#[cfg(windows)]
#[tracing::instrument]
pub async fn prefer_high_performance_gpu() -> crate::Result<Vec<String>> {
    use std::path::PathBuf;
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;

    let state = crate::State::get().await?;
    let mut executables: Vec<PathBuf> = Vec::new();

    let mut add_java_home = |home: PathBuf| {
        for exe in ["javaw.exe", "java.exe"] {
            let path = home.join("bin").join(exe);
            if path.is_file() && !executables.contains(&path) {
                executables.push(path);
            }
        }
    };

    if let Ok(mut entries) =
        tokio::fs::read_dir(state.directories.java_versions_dir()).await
    {
        while let Ok(Some(entry)) = entries.next_entry().await {
            add_java_home(entry.path());
        }
    }
    for java in crate::state::JavaVersion::get_all(&state.pool).await? {
        let path = PathBuf::from(&java.1.path);
        if let Some(home) = path.parent().and_then(|bin| bin.parent()) {
            add_java_home(home.to_path_buf());
        }
    }

    let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey("Software\\Microsoft\\DirectX\\UserGpuPreferences")
        .map_err(|error| {
            crate::ErrorKind::OtherError(format!(
                "Could not open the Windows GPU preferences: {error}"
            ))
        })?;

    let mut set = Vec::new();
    for executable in executables {
        let path = executable.to_string_lossy().into_owned();
        match key.set_value(&path, &"GpuPreference=2;") {
            Ok(()) => set.push(path),
            Err(error) => tracing::warn!(
                "Could not set the GPU preference for {path}: {error}"
            ),
        }
    }
    Ok(set)
}

#[cfg(not(windows))]
pub async fn prefer_high_performance_gpu() -> crate::Result<Vec<String>> {
    Ok(Vec::new())
}

/// Writes raw `options.txt` values into an instance, such as render distance, which Modrinth keeps
/// per instance even when the other game settings are synced. Creates the file (with the game's data
/// version) when Minecraft has not been started yet, so the first launch already uses the values.
#[tracing::instrument]
pub async fn set_instance_game_options(
    instance_id: &str,
    values: Vec<(String, String)>,
) -> crate::Result<()> {
    crate::api::instance::apply_game_options_launcher_overrides(
        instance_id,
        &values,
    )
    .await
}

/// Reads raw values from an instance's `options.txt`; keys that are missing (or a missing file) are left out.
#[tracing::instrument]
pub async fn get_instance_game_options(
    instance_id: &str,
    keys: Vec<String>,
) -> crate::Result<std::collections::HashMap<String, String>> {
    let path = crate::api::instance::get_full_path(instance_id)
        .await?
        .join("options.txt");
    let Ok(contents) = tokio::fs::read_to_string(&path).await else {
        return Ok(std::collections::HashMap::new());
    };
    Ok(contents
        .lines()
        .filter_map(|line| line.split_once(':'))
        .filter(|(key, _)| keys.iter().any(|wanted| wanted == key))
        .map(|(key, value)| {
            (key.to_string(), value.trim().trim_matches('"').to_string())
        })
        .collect())
}
