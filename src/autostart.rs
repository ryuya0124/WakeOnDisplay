use anyhow::{Context, Result};
use auto_launch::{AutoLaunch, AutoLaunchBuilder};

const APP_NAME: &str = "WakeOnDisplay";

pub struct AutoStart {
    inner: AutoLaunch,
}

impl AutoStart {
    pub fn new() -> Result<Self> {
        let executable = std::env::current_exe().context("実行ファイルの場所を取得できません")?;
        let executable = executable
            .to_str()
            .context("実行ファイルのパスをUnicodeに変換できません")?;

        let mut builder = AutoLaunchBuilder::new();
        builder.set_app_name(APP_NAME).set_app_path(executable);

        #[cfg(target_os = "windows")]
        builder.set_windows_enable_mode(auto_launch::WindowsEnableMode::CurrentUser);

        #[cfg(target_os = "macos")]
        builder
            .set_macos_launch_mode(auto_launch::MacOSLaunchMode::SMAppService)
            .set_bundle_identifiers(&["net.ryuya-dev.net.wod"]);

        Ok(Self {
            inner: builder.build().context("自動起動設定を初期化できません")?,
        })
    }

    pub fn is_enabled(&self) -> Result<bool> {
        self.inner
            .is_enabled()
            .context("自動起動の状態を確認できません")
    }

    pub fn set_enabled(&self, enabled: bool) -> Result<()> {
        if enabled {
            self.inner.enable().context("自動起動を有効にできません")
        } else {
            self.inner.disable().context("自動起動を無効にできません")
        }
    }
}
