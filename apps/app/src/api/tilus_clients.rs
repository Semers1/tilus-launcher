//! Вкладка «Клиенты»: лаунчеры сторонних клиентов (Lunar, Dawn, LabyMod, Badlion) и перенос из `.minecraft`.
//!
//! Установщик клиента качается с официального адреса в папку лаунчера и запускается как обычно. Ярлыки, которые он
//! кладёт на рабочий стол, переезжают в `clients/<клиент>` — оттуда клиент и запускается кнопкой в лаунчере.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::Runtime;
use tauri_plugin_opener::OpenerExt;
use theseus::prelude::DirectoryInfo;

use crate::api::Result;

struct Known {
    id: &'static str,
    keywords: &'static [&'static str],
    download: Option<&'static str>,
}

const KNOWN: &[Known] = &[
    Known {
        id: "lunar",
        keywords: &["lunar"],
        download: Some("https://api.lunarclientprod.com/site/download?os=windows"),
    },
    Known {
        id: "dawn",
        keywords: &["dawn", "feather"],
        download: Some("https://dawn.gg/api/launcher/download?platform=windows-amd64"),
    },
    Known {
        id: "labymod",
        keywords: &["labymod", "laby launcher"],
        download: Some(
            "https://releases.r2.labymod.net/launcher/stable/win32/x64/LabyModLauncherSetup-latest.exe",
        ),
    },
    Known {
        id: "badlion",
        keywords: &["badlion"],
        download: None,
    },
];

/// Сколько после начала установки лаунчер переносит новые ярлыки клиента с рабочего стола.
const SWEEP_WINDOW: Duration = Duration::from_secs(60 * 60);

#[derive(Serialize)]
pub struct ExternalClient {
    id: String,
    installed: bool,
    managed: bool,
    downloadable: bool,
}

#[derive(Serialize)]
pub struct DotMinecraft {
    path: String,
    options: bool,
    servers: bool,
    resourcepacks: usize,
    shaderpacks: usize,
    saves: usize,
    screenshots: usize,
}

#[derive(Serialize, Default)]
pub struct ImportReport {
    copied: usize,
    skipped: usize,
}

fn io_err(message: impl Into<String>) -> std::io::Error {
    std::io::Error::other(message.into())
}

fn known(id: &str) -> Result<&'static Known> {
    Ok(KNOWN
        .iter()
        .find(|k| k.id == id)
        .ok_or_else(|| io_err(format!("Неизвестный клиент: {id}")))?)
}

fn clients_dir() -> Result<PathBuf> {
    let dirs = DirectoryInfo::global_handle_if_ready().ok_or_else(|| io_err("Лаунчер ещё не готов"))?;
    Ok(dirs.config_dir.join("clients"))
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn write_started(dir: &Path) -> std::io::Result<()> {
    std::fs::write(dir.join("install-started"), now_secs().to_string())
}

fn read_started(dir: &Path) -> Option<SystemTime> {
    let secs: u64 = std::fs::read_to_string(dir.join("install-started")).ok()?.trim().parse().ok()?;
    Some(UNIX_EPOCH + Duration::from_secs(secs))
}

fn desktops() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(desktop) = dirs::desktop_dir() {
        out.push(desktop);
    }
    if let Ok(public) = std::env::var("PUBLIC") {
        out.push(PathBuf::from(public).join("Desktop"));
    }
    out
}

fn shortcut_of(name: &str, keywords: &[&str]) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".lnk") && keywords.iter().any(|k| lower.contains(k))
}

/// Переносит в папку клиента его ярлыки, появившиеся на рабочем столе после начала установки через лаунчер.
fn sweep(known: &Known, dir: &Path) {
    let Some(started) = read_started(dir) else {
        return;
    };
    if SystemTime::now().duration_since(started).map_or(true, |d| d > SWEEP_WINDOW) {
        return;
    }
    for desktop in desktops() {
        let Ok(entries) = std::fs::read_dir(&desktop) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !shortcut_of(&name, known.keywords) {
                continue;
            }
            let appeared = entry.metadata().and_then(|m| m.created().or_else(|_| m.modified())).ok();
            if appeared.map_or(true, |t| t + Duration::from_secs(5) < started) {
                continue;
            }
            let target = dir.join(&name);
            if std::fs::rename(entry.path(), &target).is_err()
                && std::fs::copy(entry.path(), &target).is_ok()
            {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}

fn first_shortcut(dir: &Path) -> Option<PathBuf> {
    let mut found: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("lnk")))
        .collect();
    found.sort();
    found.into_iter().next()
}

/// Установленный без лаунчера клиент: папка с его именем в обычных местах установки, в ней — его exe.
fn installed_exe(known: &Known) -> Option<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(&local).join("Programs"));
        roots.push(PathBuf::from(local));
    }
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(p) = std::env::var(var) {
            roots.push(PathBuf::from(p));
        }
    }
    for root in roots {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let dir_name = entry.file_name().to_string_lossy().to_lowercase();
            if !known.keywords.iter().any(|k| dir_name.contains(k)) || !entry.path().is_dir() {
                continue;
            }
            let Ok(files) = std::fs::read_dir(entry.path()) else {
                continue;
            };
            for file in files.flatten() {
                let name = file.file_name().to_string_lossy().to_lowercase();
                if name.ends_with(".exe")
                    && !name.contains("uninstall")
                    && known.keywords.iter().any(|k| name.contains(k))
                {
                    return Some(file.path());
                }
            }
        }
    }
    None
}

/// Состояние всех сторонних клиентов для вкладки «Клиенты».
#[tauri::command]
pub async fn tilus_external_scan() -> Result<Vec<ExternalClient>> {
    let base = clients_dir()?;
    Ok(KNOWN
        .iter()
        .map(|k| {
            let dir = base.join(k.id);
            sweep(k, &dir);
            let managed = first_shortcut(&dir).is_some();
            ExternalClient {
                id: k.id.to_owned(),
                installed: managed || installed_exe(k).is_some(),
                managed,
                downloadable: k.download.is_some(),
            }
        })
        .collect())
}

/// Качает официальный установщик в папку лаунчера и запускает его; ярлыки с рабочего стола уезжают в папку клиента.
#[tauri::command]
pub async fn tilus_external_install<R: Runtime>(app: tauri::AppHandle<R>, id: String) -> Result<()> {
    let known = known(&id)?;
    let url = known.download.ok_or_else(|| io_err("Этот клиент ставится только с его сайта"))?;
    let base = clients_dir()?;
    let dir = base.join(known.id);
    let installers = base.join("installers");
    tokio::fs::create_dir_all(&dir).await?;
    tokio::fs::create_dir_all(&installers).await?;

    let client = tauri_plugin_http::reqwest::Client::builder()
        .user_agent("TilusLauncher")
        .build()
        .map_err(|e| io_err(e.to_string()))?;
    let response = client
        .get(url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| io_err(format!("Не удалось скачать установщик: {e}")))?;
    let file_name = response
        .url()
        .path_segments()
        .and_then(|mut s| s.next_back().map(str::to_owned))
        .map(|s| urlencoding::decode(&s).map(|d| d.into_owned()).unwrap_or(s))
        .filter(|s| s.to_lowercase().ends_with(".exe"))
        .unwrap_or_else(|| format!("{}-installer.exe", known.id));
    let bytes = response.bytes().await.map_err(|e| io_err(format!("Не удалось скачать установщик: {e}")))?;
    let installer = installers.join(file_name);
    tokio::fs::write(&installer, &bytes).await?;

    write_started(&dir)?;
    app.opener()
        .open_path(installer.to_string_lossy(), None::<&str>)
        .map_err(|e| io_err(format!("Не удалось запустить установщик: {e}")))?;

    tauri::async_runtime::spawn(async move {
        for _ in 0..300 {
            tokio::time::sleep(Duration::from_secs(3)).await;
            sweep(known, &dir);
        }
    });
    Ok(())
}

/// Запускает сторонний клиент: ярлык из папки лаунчера или найденный exe.
#[tauri::command]
pub async fn tilus_external_launch<R: Runtime>(app: tauri::AppHandle<R>, id: String) -> Result<()> {
    let known = known(&id)?;
    let dir = clients_dir()?.join(known.id);
    sweep(known, &dir);
    let target = first_shortcut(&dir)
        .or_else(|| installed_exe(known))
        .ok_or_else(|| io_err("Клиент не установлен"))?;
    app.opener()
        .open_path(target.to_string_lossy(), None::<&str>)
        .map_err(|e| io_err(format!("Не удалось запустить клиент: {e}")))?;
    Ok(())
}

fn dot_minecraft() -> Option<PathBuf> {
    let path = PathBuf::from(std::env::var("APPDATA").ok()?).join(".minecraft");
    path.is_dir().then_some(path)
}

fn count_entries(dir: &Path) -> usize {
    std::fs::read_dir(dir).map(|e| e.flatten().count()).unwrap_or(0)
}

/// Что есть в `.minecraft` официального лаунчера и TLauncher.
#[tauri::command]
pub async fn tilus_dotminecraft_info() -> Result<Option<DotMinecraft>> {
    Ok(dot_minecraft().map(|root| DotMinecraft {
        path: root.to_string_lossy().into_owned(),
        options: root.join("options.txt").is_file(),
        servers: root.join("servers.dat").is_file(),
        resourcepacks: count_entries(&root.join("resourcepacks")),
        shaderpacks: count_entries(&root.join("shaderpacks")),
        saves: count_entries(&root.join("saves")),
        screenshots: count_entries(&root.join("screenshots")),
    }))
}

/// Файл с заменой: прежний остаётся рядом как `.bak`.
fn copy_replacing(from: &Path, to: &Path, report: &mut ImportReport) {
    if !from.is_file() {
        return;
    }
    if to.is_file() {
        let mut backup = to.as_os_str().to_owned();
        backup.push(".bak");
        let _ = std::fs::copy(to, PathBuf::from(backup));
    }
    match std::fs::copy(from, to) {
        Ok(_) => report.copied += 1,
        Err(_) => report.skipped += 1,
    }
}

/// Папка без замены: то, что уже есть в сборке, не трогается.
fn copy_tree(from: &Path, to: &Path, report: &mut ImportReport) {
    let Ok(entries) = std::fs::read_dir(from) else {
        return;
    };
    let _ = std::fs::create_dir_all(to);
    for entry in entries.flatten() {
        let source = entry.path();
        let target = to.join(entry.file_name());
        if source.is_dir() {
            copy_tree(&source, &target, report);
        } else if target.exists() {
            report.skipped += 1;
        } else if std::fs::copy(&source, &target).is_ok() {
            report.copied += 1;
        } else {
            report.skipped += 1;
        }
    }
}

/// Переносит из `.minecraft` в сборку выбранное: настройки и клавиши, серверы, ресурспаки, шейдеры, миры, скриншоты.
#[tauri::command]
pub async fn tilus_import_dotminecraft(instance_path: String, parts: Vec<String>) -> Result<ImportReport> {
    let root = dot_minecraft().ok_or_else(|| io_err("Папка .minecraft не найдена"))?;
    let dest = PathBuf::from(instance_path);
    if !dest.is_dir() {
        return Err(io_err("Сборка не найдена").into());
    }
    let report = tauri::async_runtime::spawn_blocking(move || {
        let mut report = ImportReport::default();
        for part in parts {
            match part.as_str() {
                "options" => {
                    for file in ["options.txt", "optionsof.txt", "optionsshaders.txt"] {
                        copy_replacing(&root.join(file), &dest.join(file), &mut report);
                    }
                }
                "servers" => copy_replacing(&root.join("servers.dat"), &dest.join("servers.dat"), &mut report),
                "resourcepacks" | "shaderpacks" | "saves" | "screenshots" => {
                    copy_tree(&root.join(&part), &dest.join(&part), &mut report);
                }
                _ => {}
            }
        }
        report
    })
    .await
    .map_err(|e| io_err(e.to_string()))?;
    Ok(report)
}
