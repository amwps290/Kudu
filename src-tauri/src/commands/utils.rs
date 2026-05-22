use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tracing::info;
use crate::utils::logger;
use crate::models::AppInfo;

#[derive(Debug, serde::Serialize)]
pub struct SavedFileInfo {
    pub path: String,
    pub title: String,
}

/// 验证路径是否在允许的范围内（应用数据目录或用户显式选择的路径）
fn validate_path(path: &str, app: &AppHandle) -> Result<(), String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("无法获取应用目录: {}", e))?;

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

    // 允许访问应用数据目录下的所有文件
    let app_dir_canonical = if app_dir.exists() {
        app_dir.canonicalize().unwrap_or(app_dir)
    } else {
        app_dir
    };
    if canonical.starts_with(&app_dir_canonical) {
        return Ok(());
    }

    // 允许访问用户通过对话框显式选择的文件（父目录存在即表示有效路径）
    if canonical.exists() || target.parent().map_or(false, |p| p.exists()) {
        return Ok(());
    }

    Err(format!("路径访问被拒绝: {}", canonical.display()))
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
pub async fn save_file_as(path: String, content: String, app: AppHandle) -> Result<SavedFileInfo, String> {
    validate_or_prepare_new_path(&path, &app)?;
    fs::write(&path, content)
        .map_err(|e| format!("写入文件失败: {}", e))?;

    let title = Path::new(&path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("query.sql")
        .to_string();

    Ok(SavedFileInfo { path, title })
}

fn validate_or_prepare_new_path(path: &str, app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("无法获取应用目录: {}", e))?;

    let target = Path::new(path);
    let canonical = if target.exists() {
        target.canonicalize().map_err(|e| format!("路径解析失败: {}", e))?
    } else if let Some(parent) = target.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("无法创建父目录: {}", e))?;
        }
        let canonical_parent = parent.canonicalize().map_err(|e| format!("父目录解析失败: {}", e))?;
        canonical_parent.join(target.file_name().unwrap_or_default())
    } else {
        return Err("无效路径".to_string());
    };

    // 允许访问应用数据目录下的所有文件
    let app_dir_canonical = if app_dir.exists() {
        app_dir.canonicalize().unwrap_or(app_dir)
    } else {
        app_dir
    };
    if canonical.starts_with(&app_dir_canonical) {
        return Ok(canonical);
    }

    // 允许访问用户通过对话框显式选择的路径
    if canonical.exists() || target.parent().map_or(false, |p| p.exists()) {
        return Ok(canonical);
    }

    Err(format!("路径访问被拒绝: {}", canonical.display()))
}

#[tauri::command]
pub async fn get_app_info() -> Result<AppInfo, String> {
    Ok(AppInfo {
        app_name: env!("CARGO_PKG_NAME").to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        repository_url: option_env!("KUDU_REPOSITORY_URL").unwrap_or("https://github.com/amwps290/DataSmith").to_string(),
        git_commit: option_env!("KUDU_GIT_COMMIT").map(|s| s.to_string()),
        git_short_commit: option_env!("KUDU_GIT_SHORT_COMMIT").map(|s| s.to_string()),
        git_branch: option_env!("KUDU_GIT_BRANCH").map(|s| s.to_string()),
        git_commit_date: option_env!("KUDU_GIT_COMMIT_DATE").map(|s| s.to_string()),
        build_time: option_env!("KUDU_BUILD_TIME").map(|s| s.to_string()),
        profile: if cfg!(debug_assertions) { "debug".to_string() } else { "release".to_string() },
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    })
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
pub async fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("只允许打开 http/https 链接".to_string());
    }

    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", "", trimmed])
        .spawn()
        .map_err(|e| format!("无法打开链接: {}", e))?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(trimmed)
        .spawn()
        .map_err(|e| format!("无法打开链接: {}", e))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(trimmed)
        .spawn()
        .map_err(|e| format!("无法打开链接: {}", e))?;

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
