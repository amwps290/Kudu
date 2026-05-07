use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager};
use tracing::info;
use crate::utils::logger;

/// 验证路径是否在允许的目录内（应用数据目录下的 scripts 子目录）
fn validate_path(path: &str, app: &AppHandle) -> Result<(), String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("无法获取应用目录: {}", e))?;
    let scripts_dir = app_dir.join("scripts");

    let target = Path::new(path);

    // 尝试对文件本身或其父目录进行规范化
    let canonical = if target.exists() {
        target.canonicalize()
            .map_err(|e| format!("路径解析失败: {}", e))?
    } else if let Some(parent) = target.parent() {
        if parent.exists() {
            let canonical_parent = parent.canonicalize()
                .map_err(|e| format!("父目录解析失败: {}", e))?;
            canonical_parent.join(target.file_name().unwrap_or_default())
        } else {
            return Err("父目录不存在".to_string());
        }
    } else {
        return Err("无效路径".to_string());
    };

    // scripts 目录可能还不存在，使用非规范化路径比较
    let allowed = if scripts_dir.exists() {
        scripts_dir.canonicalize().unwrap_or(scripts_dir)
    } else {
        scripts_dir
    };

    if canonical.starts_with(&allowed) {
        Ok(())
    } else {
        Err("路径访问被拒绝: 只允许访问脚本目录".to_string())
    }
}

#[tauri::command]
pub async fn read_file(path: String, app: AppHandle) -> Result<String, String> {
    validate_path(&path, &app)?;
    fs::read_to_string(&path)
        .map_err(|e| format!("读取文件失败: {}", e))
}

#[tauri::command]
pub async fn write_file(path: String, content: String, app: AppHandle) -> Result<(), String> {
    validate_path(&path, &app)?;
    fs::write(&path, content)
        .map_err(|e| format!("写入文件失败: {}", e))
}

#[tauri::command]
pub async fn set_log_level(level: String) -> Result<String, String> {
    logger::set_log_level(&level)
}

#[tauri::command]
pub async fn log_frontend_timing(stage: String, elapsed_ms: f64, details: Option<String>) -> Result<(), String> {
    info!(
        stage = %stage,
        elapsed_ms = format_args!("{:.2}", elapsed_ms),
        details = details.as_deref().unwrap_or(""),
        "前端启动计时"
    );
    Ok(())
}

#[tauri::command]
pub async fn open_in_file_manager(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let dir = if p.is_dir() { p.to_path_buf() } else { p.parent().unwrap_or(p).to_path_buf() };
    
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(dir.to_str().unwrap_or(""))
        .spawn()
        .map_err(|e| format!("无法打开目录: {}", e))?;
    
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(dir.to_str().unwrap_or(""))
        .spawn()
        .map_err(|e| format!("无法打开目录: {}", e))?;
    
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(dir.to_str().unwrap_or(""))
        .spawn()
        .map_err(|e| format!("无法打开目录: {}", e))?;
    
    Ok(())
}
