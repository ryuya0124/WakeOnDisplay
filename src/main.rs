#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod autostart;
mod paths;
mod platform;
mod scripts;
mod wol;

use anyhow::{Context, Result};
use autostart::AutoStart;
use single_instance::SingleInstance;
use std::path::Path;
use tray_icon::menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tray_icon::{Icon, TrayIcon, TrayIconBuilder};
use winit::application::ApplicationHandler;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, EventLoop, EventLoopProxy};
use winit::window::WindowId;

const APP_NAME: &str = "WakeOnDisplay";

#[derive(Debug)]
enum UserEvent {
    Menu(MenuEvent),
    ListenerFailed(String),
}

struct TrayState {
    _tray: TrayIcon,
    auto_start: AutoStart,
    auto_start_item: CheckMenuItem,
    open_scripts_item: MenuItem,
    quit_item: MenuItem,
}

#[derive(Default)]
struct WakeOnDisplayApp {
    tray: Option<TrayState>,
}

impl WakeOnDisplayApp {
    fn create_tray(&mut self) -> Result<()> {
        let auto_start = AutoStart::new()?;
        let enabled = auto_start.is_enabled().unwrap_or_else(|error| {
            tracing::warn!(%error, "自動起動の状態を読み取れません");
            false
        });

        let auto_start_item = CheckMenuItem::new("自動起動", true, enabled, None);
        let open_scripts_item = MenuItem::new("スクリプトフォルダを開く", true, None);
        let quit_item = MenuItem::new("終了", true, None);
        let first_separator = PredefinedMenuItem::separator();
        let second_separator = PredefinedMenuItem::separator();
        let menu = Menu::new();
        menu.append_items(&[
            &auto_start_item,
            &first_separator,
            &open_scripts_item,
            &second_separator,
            &quit_item,
        ])?;

        let tray = TrayIconBuilder::new()
            .with_tooltip(APP_NAME)
            .with_icon(load_tray_icon()?)
            .with_menu(Box::new(menu))
            .build()
            .context("トレイアイコンを作成できません")?;

        self.tray = Some(TrayState {
            _tray: tray,
            auto_start,
            auto_start_item,
            open_scripts_item,
            quit_item,
        });
        Ok(())
    }

    fn handle_menu(&mut self, event_loop: &ActiveEventLoop, event: MenuEvent) {
        let Some(state) = self.tray.as_ref() else {
            return;
        };

        if event.id == *state.auto_start_item.id() {
            let requested = state.auto_start_item.is_checked();
            if let Err(error) = state.auto_start.set_enabled(requested) {
                state.auto_start_item.set_checked(!requested);
                platform::show_error("自動起動エラー", &error.to_string());
            } else {
                tracing::info!(enabled = requested, "自動起動設定を変更しました");
            }
        } else if event.id == *state.open_scripts_item.id() {
            match paths::ensure_startup_scripts_dir().and_then(|path| {
                open::that(&path).with_context(|| format!("{} を開けません", path.display()))
            }) {
                Ok(()) => {}
                Err(error) => platform::show_error("フォルダを開けません", &error.to_string()),
            }
        } else if event.id == *state.quit_item.id() {
            event_loop.exit();
        }
    }
}

impl ApplicationHandler<UserEvent> for WakeOnDisplayApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.tray.is_none()
            && let Err(error) = self.create_tray()
        {
            platform::show_error("起動エラー", &error.to_string());
            event_loop.exit();
        }
    }

    fn user_event(&mut self, event_loop: &ActiveEventLoop, event: UserEvent) {
        match event {
            UserEvent::Menu(event) => self.handle_menu(event_loop, event),
            UserEvent::ListenerFailed(message) => platform::show_error("WoL待受エラー", &message),
        }
    }

    fn window_event(
        &mut self,
        _event_loop: &ActiveEventLoop,
        _window_id: WindowId,
        _event: WindowEvent,
    ) {
    }
}

fn load_tray_icon() -> Result<Icon> {
    #[cfg(target_os = "macos")]
    let bytes = include_bytes!("../assets/mac/icon_tray.iconset/icon_32x32@2x.png").as_slice();
    #[cfg(target_os = "windows")]
    let bytes = include_bytes!("../assets/icon_trans_tray.png").as_slice();

    let image = image::load_from_memory(bytes)?.into_rgba8();
    let (width, height) = image.dimensions();
    Icon::from_rgba(image.into_raw(), width, height).context("トレイアイコンを読み込めません")
}

fn init_logging() -> Result<tracing_appender::non_blocking::WorkerGuard> {
    use tracing_subscriber::prelude::*;

    let log_directory = paths::app_data_dir()?.join("logs");
    std::fs::create_dir_all(&log_directory)?;
    let file = tracing_appender::rolling::daily(log_directory, "wakeondisplay.log");
    let (writer, guard) = tracing_appender::non_blocking(file);
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::registry()
        .with(filter)
        .with(
            tracing_subscriber::fmt::layer()
                .with_ansi(false)
                .with_writer(writer),
        )
        .try_init()
        .context("ログを初期化できません")?;
    Ok(guard)
}

fn start_listener(proxy: EventLoopProxy<UserEvent>) {
    std::thread::Builder::new()
        .name("wol-listener".into())
        .spawn(move || {
            if let Err(error) = wol::listen(|| {
                if let Err(error) = platform::wake_display() {
                    tracing::error!(%error, "ディスプレイを復帰できません");
                }
                std::thread::spawn(scripts::execute_startup_scripts);
            }) {
                let message = if error.kind() == std::io::ErrorKind::AddrInUse {
                    format!(
                        "Wake-on-LANの待受ポート (UDP:{}) は既に使用されています。\n{error}",
                        wol::WOL_PORT
                    )
                } else {
                    format!("Wake-on-LANの待受を開始できません。\n{error}")
                };
                let _ = proxy.send_event(UserEvent::ListenerFailed(message));
            }
        })
        .expect("WoL listener thread must start");
}

fn instance_name() -> Result<String> {
    #[cfg(target_os = "windows")]
    return Ok("Local\\net.ryuya-dev.net.wod".into());

    #[cfg(target_os = "macos")]
    return Ok(paths::single_instance_path()?
        .to_string_lossy()
        .into_owned());
}

fn main() -> Result<()> {
    let _log_guard = init_logging()?;
    let instance =
        SingleInstance::new(&instance_name()?).context("単一インスタンスを確認できません")?;
    if !instance.is_single() {
        tracing::info!("既に起動しているため終了します");
        return Ok(());
    }
    paths::ensure_startup_scripts_dir()?;

    let event_loop = EventLoop::<UserEvent>::with_user_event().build()?;
    let menu_proxy = event_loop.create_proxy();
    MenuEvent::set_event_handler(Some(move |event| {
        let _ = menu_proxy.send_event(UserEvent::Menu(event));
    }));
    start_listener(event_loop.create_proxy());

    let mut app = WakeOnDisplayApp::default();
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        "WakeOnDisplayを起動しました"
    );
    event_loop.run_app(&mut app)?;
    tracing::info!("WakeOnDisplayを終了しました");
    drop(instance);
    Ok(())
}

#[allow(dead_code)]
fn _assert_path(_: &Path) {}
