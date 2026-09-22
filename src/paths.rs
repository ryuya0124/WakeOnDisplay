use anyhow::{Context, Result};
use directories::BaseDirs;
use std::path::PathBuf;

pub fn app_data_dir() -> Result<PathBuf> {
    let base = BaseDirs::new().context("ユーザーデータフォルダを取得できません")?;
    // Electron版の `app.getPath("userData")` と同じ場所を使い、
    // 既存のstartup-scriptsとログをそのまま引き継ぐ。
    Ok(base.data_dir().join("wakeondisplay"))
}

pub fn startup_scripts_dir() -> Result<PathBuf> {
    Ok(app_data_dir()?.join("startup-scripts"))
}

pub fn ensure_startup_scripts_dir() -> Result<PathBuf> {
    let path = startup_scripts_dir()?;
    std::fs::create_dir_all(&path)
        .with_context(|| format!("スクリプトフォルダを作成できません: {}", path.display()))?;
    Ok(path)
}

#[cfg(target_os = "macos")]
pub fn single_instance_path() -> Result<PathBuf> {
    let directory = app_data_dir()?;
    std::fs::create_dir_all(&directory)?;
    Ok(directory.join("wakeondisplay.lock"))
}
