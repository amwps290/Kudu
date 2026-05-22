use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AppInfo {
    pub app_name: String,
    pub version: String,
    pub repository_url: String,
    pub git_commit: Option<String>,
    pub git_short_commit: Option<String>,
    pub git_branch: Option<String>,
    pub git_commit_date: Option<String>,
    pub build_time: Option<String>,
    pub profile: String,
    pub os: String,
    pub arch: String,
}
