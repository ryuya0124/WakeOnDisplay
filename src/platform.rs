use anyhow::{Context, Result};
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
pub fn wake_display() -> Result<()> {
    let script = concat!(
        "Add-Type -AssemblyName System.Windows.Forms; ",
        "[System.Windows.Forms.SendKeys]::SendWait('{CAPSLOCK}'); ",
        "Start-Sleep -Milliseconds 100; ",
        "[System.Windows.Forms.SendKeys]::SendWait('{CAPSLOCK}')"
    );
    spawn_hidden(
        "powershell.exe",
        &["-NoProfile", "-NonInteractive", "-Command", script],
    )?;
    tracing::info!("Windowsのディスプレイ復帰処理を実行しました");
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn wake_display() -> Result<()> {
    spawn_hidden("/usr/bin/caffeinate", &["-u", "-t", "20"])?;
    tracing::info!("macOSのディスプレイ復帰処理を実行しました");
    Ok(())
}

fn spawn_hidden(program: &str, args: &[&str]) -> Result<()> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }

    command
        .spawn()
        .with_context(|| format!("{program} を起動できません"))?;
    Ok(())
}

pub fn show_error(title: &str, message: &str) {
    tracing::error!("{title}: {message}");

    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::iter::once;
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::UI::WindowsAndMessaging::{MB_ICONERROR, MB_OK, MessageBoxW};

        let title: Vec<u16> = OsStr::new(title).encode_wide().chain(once(0)).collect();
        let message: Vec<u16> = OsStr::new(message).encode_wide().chain(once(0)).collect();
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                message.as_ptr(),
                title.as_ptr(),
                MB_OK | MB_ICONERROR,
            );
        }
    }

    #[cfg(target_os = "macos")]
    {
        let escaped_title = title.replace('\\', "\\\\").replace('"', "\\\"");
        let escaped_message = message.replace('\\', "\\\\").replace('"', "\\\"");
        let script =
            format!("display alert \"{escaped_title}\" message \"{escaped_message}\" as critical");
        let _ = Command::new("/usr/bin/osascript")
            .args(["-e", &script])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }
}
