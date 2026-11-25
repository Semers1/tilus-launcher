use crate::api::Result;
use tauri::plugin::TauriPlugin;
use theseus::tilus::{self, HardwareInfo};

pub fn init<R: tauri::Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("tilus")
        .invoke_handler(tauri::generate_handler![
            hardware_info,
            prefer_high_performance_gpu,
            set_instance_game_options,
            get_instance_game_options,
        ])
        .build()
}

/// CPU, memory and GPUs of this PC, for autotune.
#[tauri::command]
pub async fn hardware_info() -> Result<HardwareInfo> {
    Ok(tauri::async_runtime::spawn_blocking(tilus::hardware_info)
        .await
        .map_err(|error| {
            theseus::ErrorKind::OtherError(format!(
                "Hardware probe failed: {error}"
            ))
            .as_error()
        })?)
}

/// Makes every Java the launcher uses start on the high-performance GPU.
#[tauri::command]
pub async fn prefer_high_performance_gpu() -> Result<Vec<String>> {
    Ok(tilus::prefer_high_performance_gpu().await?)
}

/// Writes per-instance `options.txt` values (render distance and the like).
#[tauri::command]
pub async fn set_instance_game_options(
    instance_id: String,
    values: Vec<(String, String)>,
) -> Result<()> {
    Ok(tilus::set_instance_game_options(&instance_id, values).await?)
}

/// Reads per-instance `options.txt` values.
#[tauri::command]
pub async fn get_instance_game_options(
    instance_id: String,
    keys: Vec<String>,
) -> Result<std::collections::HashMap<String, String>> {
    Ok(tilus::get_instance_game_options(&instance_id, keys).await?)
}
