use crate::paths;
use anyhow::{Context, Result};
use std::ffi::OsStr;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const SCRIPT_TIMEOUT: Duration = Duration::from_secs(60);
const COOLDOWN: Duration = Duration::from_secs(30);
static IS_EXECUTING: AtomicBool = AtomicBool::new(false);
static LAST_EXECUTED_AT: AtomicU64 = AtomicU64::new(0);

struct ExecutionGuard;

impl Drop for ExecutionGuard {
    fn drop(&mut self) {
        IS_EXECUTING.store(false, Ordering::Release);
    }
}

pub fn execute_startup_scripts() {
    if IS_EXECUTING.swap(true, Ordering::AcqRel) {
        tracing::info!("スクリプトは既に実行中のためスキップします");
        return;
    }
    let _guard = ExecutionGuard;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let previous = LAST_EXECUTED_AT.load(Ordering::Acquire);
    if previous != 0 && now.saturating_sub(previous) < COOLDOWN.as_secs() {
        tracing::info!("クールダウン中のためスクリプトをスキップします");
        return;
    }
    LAST_EXECUTED_AT.store(now, Ordering::Release);

    if is_elevated() {
        tracing::warn!("root/管理者権限ではユーザースクリプトを実行しません");
        return;
    }

    if let Err(error) = execute_all() {
        tracing::error!(%error, "スクリプトの実行に失敗しました");
    }
}

fn execute_all() -> Result<()> {
    let directory = paths::ensure_startup_scripts_dir()?;
    let canonical_directory = fs::canonicalize(&directory)?;
    let mut scripts = Vec::new();

    for entry in fs::read_dir(&directory)? {
        let entry = entry?;
        let metadata = fs::symlink_metadata(entry.path())?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            continue;
        }
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let canonical = fs::canonicalize(entry.path())?;
        if canonical.parent() == Some(canonical_directory.as_path())
            && command_for(&canonical).is_some()
        {
            scripts.push(canonical);
        }
    }
    scripts.sort();

    for script in scripts {
        if let Err(error) = run_script(&script) {
            tracing::warn!(path = %script.display(), %error, "スクリプトが失敗しました");
        }
    }
    Ok(())
}

fn run_script(path: &Path) -> Result<()> {
    let (program, args) = command_for(path).context("未対応のスクリプト形式です")?;
    tracing::info!(path = %path.display(), "スクリプトを実行します");

    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }

    let mut child = command.spawn()?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_reader = std::thread::spawn(move || read_stream(stdout));
    let stderr_reader = std::thread::spawn(move || read_stream(stderr));
    let status = wait_with_timeout(&mut child, SCRIPT_TIMEOUT)?;
    let stdout = stdout_reader.join().unwrap_or_default();
    let stderr = stderr_reader.join().unwrap_or_default();
    log_output(path, status, &stdout, &stderr);
    Ok(())
}

fn read_stream(stream: Option<impl Read>) -> Vec<u8> {
    let mut bytes = Vec::new();
    if let Some(mut stream) = stream {
        let _ = stream.read_to_end(&mut bytes);
    }
    bytes
}

fn wait_with_timeout(child: &mut Child, timeout: Duration) -> Result<ExitStatus> {
    let started = Instant::now();
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(status);
        }
        if started.elapsed() >= timeout {
            tracing::warn!(pid = child.id(), "スクリプトをタイムアウトで終了します");
            terminate_process_tree(child)?;
            return child.wait().context("終了したスクリプトを回収できません");
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

fn terminate_process_tree(child: &mut Child) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill.exe")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    if child.try_wait()?.is_none() {
        child.kill().context("スクリプトを終了できません")?;
    }
    Ok(())
}

fn log_output(path: &Path, status: ExitStatus, stdout: &[u8], stderr: &[u8]) {
    let name = path
        .file_name()
        .unwrap_or_else(|| OsStr::new("unknown"))
        .to_string_lossy();
    if !stdout.is_empty() {
        tracing::info!(script = %name, output = %String::from_utf8_lossy(stdout).trim(), "stdout");
    }
    if !stderr.is_empty() {
        tracing::warn!(script = %name, output = %String::from_utf8_lossy(stderr).trim(), "stderr");
    }
    if status.success() {
        tracing::info!(script = %name, "スクリプトが完了しました");
    } else {
        tracing::warn!(script = %name, code = ?status.code(), "スクリプトが異常終了しました");
    }
}

fn command_for(path: &Path) -> Option<(&'static str, Vec<String>)> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    let path = path.to_string_lossy().into_owned();

    #[cfg(target_os = "windows")]
    match extension.as_str() {
        "ps1" => Some((
            "powershell.exe",
            vec![
                "-NoProfile".into(),
                "-NonInteractive".into(),
                "-NoLogo".into(),
                "-WindowStyle".into(),
                "Hidden".into(),
                "-ExecutionPolicy".into(),
                "Bypass".into(),
                "-File".into(),
                path,
            ],
        )),
        "bat" | "cmd" => Some(("cmd.exe", vec!["/d".into(), "/c".into(), path])),
        _ => None,
    }

    #[cfg(target_os = "macos")]
    match extension.as_str() {
        "sh" => Some(("/bin/bash", vec![path])),
        "applescript" | "scpt" => Some(("/usr/bin/osascript", vec![path])),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn is_elevated() -> bool {
    use std::mem::size_of;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::Security::{
        GetTokenInformation, TOKEN_ELEVATION, TOKEN_QUERY, TokenElevation,
    };
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    let mut token: HANDLE = std::ptr::null_mut();
    // SAFETY: `token` is a valid writable out-parameter and the pseudo-handle is
    // valid for the duration of this call.
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
        return false;
    }

    let mut elevation = TOKEN_ELEVATION::default();
    let mut returned_size = 0;
    // SAFETY: the output buffer points to a correctly sized TOKEN_ELEVATION and
    // the process token remains open until after the query completes.
    let queried = unsafe {
        GetTokenInformation(
            token,
            TokenElevation,
            (&mut elevation as *mut TOKEN_ELEVATION).cast(),
            size_of::<TOKEN_ELEVATION>() as u32,
            &mut returned_size,
        )
    } != 0;
    // SAFETY: `token` was returned by OpenProcessToken and is closed exactly once.
    unsafe { CloseHandle(token) };

    queried && elevation.TokenIsElevated != 0
}

#[cfg(target_os = "macos")]
fn is_elevated() -> bool {
    Command::new("/usr/bin/id")
        .arg("-u")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| output.stdout == b"0\n")
        .unwrap_or(false)
}

#[allow(dead_code)]
fn _assert_path_send(_: PathBuf) {}
