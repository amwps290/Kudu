use serde::Serialize;
use std::sync::Mutex;
use std::sync::OnceLock;

/// 从系统读取到的字体信息
#[derive(Debug, Clone, Serialize)]
pub struct SystemFont {
    /// 字体族名称，如 "JetBrains Mono"
    pub family: String,
    /// 是否是等宽字体
    pub is_monospace: bool,
}

/// 全局字体缓存
static FONT_CACHE: OnceLock<Mutex<Vec<SystemFont>>> = OnceLock::new();

/// 判断字体名是否暗示是等宽字体（启发式，避免加载每个字体）
fn looks_monospace(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("mono")
        || lower.contains("code")
        || lower.contains("console")
        || lower.contains("terminal")
        || lower.contains("typewriter")
        || lower.contains("courier")
        || lower.contains("fixed")
        || lower.contains("source code")
        || lower.contains("cascadia")
        || lower.contains("fira")
        || lower.contains("jetbrains")
        || lower.contains("droid sans mono")
        || lower.contains("dejavu sans mono")
        || lower.contains("liberation mono")
        || lower.contains("iosevka")
        || lower.contains("hack")
        || lower.contains("inconsolata")
        || lower.contains("ubuntu mono")
}

/// 列出系统中所有已安装的字体
#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<SystemFont>, String> {
    // 优先使用缓存
    if let Some(cache) = FONT_CACHE.get() {
        if let Ok(cached) = cache.lock() {
            if !cached.is_empty() {
                return Ok(cached.clone());
            }
        }
    }

    let fonts = load_fonts_from_system().unwrap_or_else(|e| {
        tracing::warn!(error = %e, "无法读取系统字体，返回空列表");
        Vec::new()
    });

    // 写入缓存
    let cache = FONT_CACHE.get_or_init(|| Mutex::new(Vec::new()));
    if let Ok(mut cached) = cache.lock() {
        *cached = fonts.clone();
    }

    Ok(fonts)
}

#[cfg(not(target_os = "linux"))]
fn load_fonts_from_system() -> Result<Vec<SystemFont>, String> {
    use font_kit::family_name::FamilyName;
    use font_kit::properties::Properties;
    use font_kit::source::SystemSource;

    let source = SystemSource::new();
    let families = source
        .all_families()
        .map_err(|e| format!("无法枚举字体族: {}", e))?;

    let mut seen = std::collections::HashSet::new();
    let mut fonts = Vec::with_capacity(families.len());

    for name in &families {
        let name_str = name.to_string();
        if name_str.is_empty() {
            continue;
        }
        // 大小写不敏感去重
        if !seen.insert(name_str.to_lowercase()) {
            continue;
        }

        // 尝试加载字体以检查是否等宽（只在启发式匹配时加载，节省时间）
        let is_monospace = if looks_monospace(&name_str) {
            // 启发式匹配，大概率是等宽字体
            match source.select_best_match(
                &[FamilyName::Title(name_str.clone())],
                &Properties::new(),
            ) {
                Ok(handle) => match handle.load() {
                    Ok(font) => font.is_monospace(),
                    Err(_) => true, // 加载失败但启发式匹配，保守地认为是等宽
                },
                Err(_) => true,
            }
        } else {
            false
        };

        fonts.push(SystemFont {
            family: name_str,
            is_monospace,
        });
    }

    // 排序：等宽字体优先，然后按字母排序
    fonts.sort_by(|a, b| {
        b.is_monospace
            .cmp(&a.is_monospace)
            .then(a.family.to_lowercase().cmp(&b.family.to_lowercase()))
    });

    tracing::info!(count = fonts.len(), "已加载系统字体列表");
    Ok(fonts)
}

/// Linux: font-kit 依赖 fontconfig
#[cfg(target_os = "linux")]
fn load_fonts_from_system() -> Result<Vec<SystemFont>, String> {
    use font_kit::source::SystemSource;

    let source = SystemSource::new();
    let families = source
        .all_families()
        .map_err(|e| format!("无法枚举字体族: {}", e))?;

    let mut seen = std::collections::HashSet::new();
    let mut fonts = Vec::with_capacity(families.len());

    for name in &families {
        let name_str = name.to_string();
        if name_str.is_empty() {
            continue;
        }
        // 大小写不敏感去重
        if !seen.insert(name_str.to_lowercase()) {
            continue;
        }

        // Linux: 通过启发式判断等宽
        let is_monospace = looks_monospace(&name_str);

        fonts.push(SystemFont {
            family: name_str,
            is_monospace,
        });
    }

    fonts.sort_by(|a, b| {
        b.is_monospace
            .cmp(&a.is_monospace)
            .then(a.family.to_lowercase().cmp(&b.family.to_lowercase()))
    });

    tracing::info!(count = fonts.len(), "已加载系统字体列表 (Linux)");
    Ok(fonts)
}
