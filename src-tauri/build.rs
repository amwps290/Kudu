use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn git_output(args: &[&str]) -> Option<String> {
    let output = Command::new("git").args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() { None } else { Some(text) }
}

fn main() {
    tauri_build::build();

    let build_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string());
    println!("cargo:rustc-env=KUDU_BUILD_TIME={build_time}");

    if let Some(commit) = git_output(&["rev-parse", "HEAD"]) {
        println!("cargo:rustc-env=KUDU_GIT_COMMIT={commit}");
    }
    if let Some(short_commit) = git_output(&["rev-parse", "--short", "HEAD"]) {
        println!("cargo:rustc-env=KUDU_GIT_SHORT_COMMIT={short_commit}");
    }
    if let Some(branch) = git_output(&["rev-parse", "--abbrev-ref", "HEAD"]) {
        println!("cargo:rustc-env=KUDU_GIT_BRANCH={branch}");
    }
    if let Some(commit_date) = git_output(&["show", "-s", "--format=%cI", "HEAD"]) {
        println!("cargo:rustc-env=KUDU_GIT_COMMIT_DATE={commit_date}");
    }
    if let Some(remote) = git_output(&["remote", "get-url", "origin"]) {
        println!("cargo:rustc-env=KUDU_REPOSITORY_URL={remote}");
    }
}
