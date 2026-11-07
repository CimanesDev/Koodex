#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod alerts;
mod claude;
mod codex;
mod geometry;
mod icon;
mod settings;
mod tray;
mod updates;
mod usage;
mod windows;

use serde_json::{json, Value};
use settings::{Settings, Store, SETTINGS_VERSION};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, RunEvent};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Notify;
use updates::{UpdateState, Updates};
use usage::{now_ms, Provider, Snapshot, SyncState, Usage};

pub struct Core {
    app: AppHandle,
    store: Store,
    settings: Mutex<Settings>,
    snapshots: Mutex<[Snapshot; 2]>,
    ledgers: Mutex<[alerts::Ledger; 2]>,
    cache_saved: Mutex<[(String, i64); 2]>,
    wake: [Notify; 2],
    codex: codex::Codex,
    http: reqwest::Client,
    updates: Updates,
    shortcut: Mutex<(String, String)>,
    tray: tray::Tray,
    pub windows: windows::Windows,
    mock: Option<String>,
}

pub fn core(app: &AppHandle) -> Arc<Core> {
    app.state::<Arc<Core>>().inner().clone()
}

const PROVIDERS: [Provider; 2] = [Provider::Codex, Provider::Claude];
fn cache_name(p: Provider) -> &'static str {
    match p {
        Provider::Codex => "usage",
        Provider::Claude => "usage-claude",
    }
}
fn ledger_name(p: Provider) -> &'static str {
    match p {
        Provider::Codex => "alerts",
        Provider::Claude => "alerts-claude",
    }
}

fn data_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("KOODEX_TEST_DATA") {
        return PathBuf::from(dir);
    }
    let base = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join(if std::env::var_os("KOODEX_MOCK").is_some() { "Koodex-mock" } else { "Koodex" })
}

fn mock_usage(scenario: &str) -> Option<Usage> {
    let now = now_ms();
    let values = match scenario {
        "critical" => [4.0, 8.0],
        "low" => [22.0, 14.0],
        _ => [68.0, 42.0],
    };
    if scenario == "loading" {
        return None;
    }
    let mut windows = vec![
        usage::UsageWindow::new("five-hour", "5-hour", Some(100.0 - values[0]), Some(now + 138 * 60000), Some(300.0)),
        usage::UsageWindow::new("weekly", "Weekly", Some(100.0 - values[1]), Some(now + 86 * 3_600_000), Some(10080.0)),
    ];
    if scenario == "single-window" {
        windows.remove(0);
    }
    Some(Usage { windows, plan_type: Some("plus".into()), credits: None, fetched_at: now })
}

impl Core {
    fn settings(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }
    fn active(&self) -> Provider {
        self.settings.lock().unwrap().provider()
    }
    pub fn snapshot(&self) -> Snapshot {
        self.snapshots.lock().unwrap()[self.active().index()].clone()
    }

    fn publish(&self) {
        let state = self.snapshot();
        let _ = self.app.emit("usage", &state);
        self.tray.render(&self.app, &state, &self.settings(), &self.updates.get());
        self.windows.restore_overlay(&self.app);
    }

    fn set_snapshot(&self, p: Provider, f: impl FnOnce(&mut Snapshot)) {
        f(&mut self.snapshots.lock().unwrap()[p.index()]);
        if p == self.active() {
            self.publish();
        }
    }

    async fn read(&self, p: Provider) -> Result<Usage, (String, bool)> {
        if let Some(scenario) = &self.mock {
            tokio::time::sleep(Duration::from_millis(300)).await;
            return match scenario.as_str() {
                "offline" => Err(("Unable to read usage. Retrying automatically.".into(), false)),
                _ => mock_usage(scenario).ok_or(("Loading".into(), false)),
            };
        }
        match p {
            Provider::Codex => match self.codex.read().await {
                Ok(u) => Ok(u),
                Err(e) => Err((codex::explain(&e), false)),
            },
            Provider::Claude => claude::read(&self.http).await.map_err(|e| {
                let limited = matches!(e, claude::ClaudeError::RateLimited);
                (e.message(), limited)
            }),
        }
    }

    fn succeeded(&self, p: Provider, usage: Usage) {
        let fingerprint = serde_json::to_string(&Usage { fetched_at: 0, ..usage.clone() }).unwrap_or_default();
        let now = now_ms();
        if self.mock.is_none() {
            let mut saved = self.cache_saved.lock().unwrap();
            let slot = &mut saved[p.index()];
            if slot.0 != fingerprint || now - slot.1 >= 60_000 {
                let _ = self.store.write(cache_name(p), &json!({"usage": usage, "fetchedAt": usage.fetched_at}));
                *slot = (fingerprint, now);
            }
        }
        let settings = self.settings();
        if self.mock.is_none() && settings.notifications_enabled && p == settings.provider() {
            let mut ledgers = self.ledgers.lock().unwrap();
            let ledger = &mut ledgers[p.index()];
            let before = ledger.clone();
            for a in alerts::collect(&usage, ledger, now) {
                let _ = self
                    .app
                    .notification()
                    .builder()
                    .title("Koodex")
                    .body(format!(
                        "Your {} {} limit has {}% remaining. Resets in {}.",
                        a.label,
                        p.name(),
                        a.remaining.round(),
                        usage::reset_in(a.resets_at, now)
                    ))
                    .show();
            }
            if *ledger != before {
                let _ = self.store.write(ledger_name(p), ledger);
            }
        }
        self.set_snapshot(p, |s| {
            s.usage = Some(usage);
            s.sync_state = SyncState::Synced;
            s.error = None;
        });
    }

    fn failed(&self, p: Provider, message: String) {
        self.set_snapshot(p, |s| {
            s.sync_state = if s.usage.is_some() { SyncState::Stale } else { SyncState::Error };
            s.error = Some(message);
        });
    }

    fn interval(&self, p: Provider) -> Duration {
        let seconds = self.settings.lock().unwrap().refresh_interval_seconds as u64;
        // Claude's account endpoint is shared with Claude Code itself; poll it gently.
        Duration::from_secs(if p == Provider::Claude { seconds.max(30) } else { seconds })
    }

    async fn monitor(self: Arc<Self>, p: Provider) {
        let mut failures: u32 = 0;
        loop {
            if self.active() != p {
                failures = 0;
                self.wake[p.index()].notified().await;
                continue;
            }
            self.set_snapshot(p, |s| {
                s.sync_state = if s.usage.is_some() { SyncState::Refreshing } else { SyncState::Connecting };
            });
            let result = self.read(p).await;
            let mut delay = self.interval(p);
            if self.active() == p {
                match result {
                    Ok(usage) => {
                        failures = 0;
                        self.succeeded(p, usage);
                    }
                    Err((message, limited)) => {
                        failures += 1;
                        self.failed(p, message);
                        delay = Duration::from_secs((5u64 << (failures - 1).min(6)).min(300));
                        if limited {
                            delay = delay.max(Duration::from_secs(120));
                        }
                    }
                }
            }
            tokio::select! {
                _ = tokio::time::sleep(delay) => {}
                _ = self.wake[p.index()].notified() => {}
            }
        }
    }

    pub fn refresh(&self) {
        self.wake[self.active().index()].notify_one();
    }

    pub fn update_settings(&self, patch: Value) -> Result<Settings, String> {
        let Some(patch) = patch.as_object() else { return Err("Invalid settings".into()) };
        let previous = self.settings();
        let mut next = previous.clone();
        let applied = next.apply(patch);
        if applied.is_empty() {
            return Ok(previous);
        }
        if next.pill_placement != previous.pill_placement {
            next.pill_pin_offset = None;
        }
        if next.launch_at_startup != previous.launch_at_startup {
            if cfg!(debug_assertions) || self.mock.is_some() || std::env::var_os("KOODEX_TEST_DATA").is_some() {
                return Err("Launch at startup is available in the installed app.".into());
            }
            let launcher = self.app.autolaunch();
            let result = if next.launch_at_startup { launcher.enable() } else { launcher.disable() };
            result.map_err(|_| "Windows did not allow Koodex to change startup. Please try again.".to_string())?;
        }
        if next.pill_shortcut != previous.pill_shortcut {
            self.set_shortcut(&next.pill_shortcut)?;
        }
        if let Err(e) = self.store.write("settings", &next) {
            if next.pill_shortcut != previous.pill_shortcut {
                let _ = self.set_shortcut(&previous.pill_shortcut);
            }
            return Err(e);
        }
        *self.settings.lock().unwrap() = next.clone();
        if next.provider != previous.provider {
            if previous.provider() == Provider::Codex {
                let core = core(&self.app);
                tauri::async_runtime::spawn(async move { core.codex.stop().await });
            }
            self.wake[next.provider().index()].notify_one();
        }
        if next.refresh_interval_seconds != previous.refresh_interval_seconds {
            self.refresh();
        }
        let _ = self.app.emit("settings", &next);
        self.windows.sync_pill(&self.app, &next);
        self.publish();
        Ok(next)
    }

    fn set_shortcut(&self, next: &str) -> Result<(), String> {
        let mut current = self.shortcut.lock().unwrap();
        if current.0 == next {
            current.1.clear();
            return Ok(());
        }
        let gs = self.app.global_shortcut();
        if next != "off" {
            let registered = gs.on_shortcut(next, |app, _, event| {
                if event.state() == ShortcutState::Pressed {
                    let core = core(app);
                    let visible = core.settings().floating_pill_enabled;
                    let _ = core.update_settings(json!({"floatingPillEnabled": !visible}));
                }
            });
            if registered.is_err() {
                current.1 = "That shortcut is already in use or unavailable. Choose another combination.".into();
                return Err(current.1.clone());
            }
        }
        if current.0 != "off" {
            let _ = gs.unregister(current.0.as_str());
        }
        *current = (next.to_string(), String::new());
        Ok(())
    }
}

// ---- Commands (see src/renderer/bridge.ts) ----
type Cmd<T> = Result<T, String>;

#[tauri::command]
fn get_usage(app: AppHandle) -> Snapshot {
    core(&app).snapshot()
}
#[tauri::command]
fn get_all_usage(app: AppHandle) -> Vec<Snapshot> {
    core(&app).snapshots.lock().unwrap().to_vec()
}
#[tauri::command]
async fn refresh_usage(app: AppHandle) {
    core(&app).refresh();
}
#[tauri::command]
fn get_settings(app: AppHandle) -> Settings {
    core(&app).settings()
}
#[tauri::command]
async fn update_settings(app: AppHandle, patch: Value) -> Cmd<Settings> {
    core(&app).update_settings(patch)
}
#[tauri::command]
fn get_shortcut_error(app: AppHandle) -> String {
    core(&app).shortcut.lock().unwrap().1.clone()
}
#[tauri::command]
async fn open_settings(app: AppHandle) {
    core(&app).windows.open_settings(&app, None);
}
#[tauri::command]
async fn close_settings(app: AppHandle) {
    core(&app).windows.hide(&app, windows::SETTINGS);
}
#[tauri::command]
async fn finish_setup(app: AppHandle) -> Cmd<()> {
    let core = core(&app);
    let mut next = core.settings();
    next.setup_completed = true;
    core.store.write("settings", &next)?;
    *core.settings.lock().unwrap() = next.clone();
    let _ = app.emit("settings", &next);
    core.windows.sync_pill(&app, &next);
    core.windows.hide(&app, windows::SETTINGS);
    core.publish();
    Ok(())
}
#[tauri::command]
async fn open_popover(app: AppHandle) {
    core(&app).windows.open_popover(&app, None);
}
#[tauri::command]
async fn hide_popover(app: AppHandle) {
    core(&app).windows.hide(&app, windows::POPOVER);
}
#[tauri::command]
async fn resize_popover(app: AppHandle, height: f64) {
    if height.is_finite() {
        core(&app).windows.resize_popover(&app, height);
    }
}
#[tauri::command]
async fn drag_pill(app: AppHandle, phase: String) {
    let core = core(&app);
    let settings = core.settings();
    if let Some(patch) = core.windows.drag_pill(&app, &settings, &phase) {
        let _ = core.update_settings(patch);
    }
}
#[tauri::command]
async fn expand_pill(app: AppHandle, expanded: bool) {
    let core = core(&app);
    core.windows.expand_pill(&app, &core.settings(), expanded);
}
#[tauri::command]
async fn pill_menu(app: AppHandle) -> Cmd<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    let w = app.get_webview_window(windows::PILL).ok_or("No pill")?;
    let other = match core(&app).active() {
        Provider::Codex => ("pill-provider-claude", "Show Claude Code"),
        Provider::Claude => ("pill-provider-codex", "Show Codex"),
    };
    let e = |e: tauri::Error| e.to_string();
    let menu = Menu::with_items(
        &app,
        &[
            &MenuItem::with_id(&app, "open", "Usage details", true, None::<&str>).map_err(e)?,
            &MenuItem::with_id(&app, other.0, other.1, true, None::<&str>).map_err(e)?,
            &MenuItem::with_id(&app, "refresh", "Refresh", true, None::<&str>).map_err(e)?,
            &MenuItem::with_id(&app, "settings", "Settings", true, None::<&str>).map_err(e)?,
            &PredefinedMenuItem::separator(&app).map_err(e)?,
            &MenuItem::with_id(&app, "hide-pill", "Hide floating pill", true, None::<&str>).map_err(e)?,
        ],
    )
    .map_err(e)?;
    w.popup_menu(&menu).map_err(e)
}
#[tauri::command]
fn get_update_state(app: AppHandle) -> UpdateState {
    core(&app).updates.get()
}
#[tauri::command]
async fn check_for_updates(app: AppHandle) -> UpdateState {
    core(&app).updates.check().await
}
#[tauri::command]
async fn download_update(app: AppHandle) -> UpdateState {
    core(&app).updates.download().await
}
#[tauri::command]
async fn install_update(app: AppHandle) -> Cmd<UpdateState> {
    let core = core(&app);
    core.updates.install()?;
    let state = core.updates.get();
    app.exit(0);
    Ok(state)
}
#[tauri::command]
fn open_releases(app: AppHandle) -> Cmd<()> {
    app.opener().open_url(updates::RELEASES, None::<&str>).map_err(|e| e.to_string())
}
#[tauri::command]
async fn quit(app: AppHandle) {
    app.exit(0);
}

fn on_menu(app: &AppHandle, id: &str) {
    let core = core(app);
    match id {
        "open" => core.windows.open_popover(app, None),
        "refresh" => core.refresh(),
        "settings" => core.windows.open_settings(app, None),
        "updates" => core.windows.open_settings(app, Some("general")),
        "provider-codex" | "pill-provider-codex" => {
            let _ = core.update_settings(json!({"provider": "codex"}));
        }
        "provider-claude" | "pill-provider-claude" => {
            let _ = core.update_settings(json!({"provider": "claude"}));
        }
        "startup" => {
            let enabled = core.settings().launch_at_startup;
            if core.update_settings(json!({"launchAtStartup": !enabled})).is_err() {
                core.publish();
            }
        }
        "pill" | "hide-pill" => {
            let visible = core.settings().floating_pill_enabled;
            let _ = core.update_settings(json!({"floatingPillEnabled": !visible && id == "pill"}));
        }
        "quit" => app.exit(0),
        _ => {}
    }
}

/// Removes Windows startup entries that point at the Koodex 1.x Electron install.
fn remove_legacy_startup_entries() {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
        let Ok(run) = winreg::RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Run", KEY_READ | KEY_SET_VALUE)
        else {
            return;
        };
        let stale: Vec<String> = run
            .enum_values()
            .flatten()
            .filter(|(_, value)| value.to_string().to_ascii_lowercase().contains("\\programs\\koodex\\koodex.exe"))
            .map(|(name, _)| name)
            .collect();
        for name in stale {
            let _ = run.delete_value(name);
        }
    }
}

fn updates_disabled() -> Option<String> {
    if cfg!(debug_assertions) || std::env::var_os("KOODEX_MOCK").is_some() || std::env::var_os("KOODEX_TEST_DATA").is_some() {
        return Some("Update installation is available in the installed Windows app.".into());
    }
    let exe = std::env::current_exe().ok()?;
    if !exe.parent()?.join("uninstall.exe").is_file() {
        return Some("Portable copies update by replacing the app. Download the latest release below.".into());
    }
    None
}

fn main() {
    let startup = std::env::args().any(|a| a == "--startup");
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            core(app).windows.open_popover(app, None);
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--startup"])))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_usage,
            get_all_usage,
            refresh_usage,
            get_settings,
            update_settings,
            get_shortcut_error,
            open_settings,
            close_settings,
            finish_setup,
            open_popover,
            hide_popover,
            resize_popover,
            drag_pill,
            expand_pill,
            pill_menu,
            get_update_state,
            check_for_updates,
            download_update,
            install_update,
            open_releases,
            quit
        ])
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .setup(move |app| {
            let handle = app.handle().clone();
            let store = Store::new(data_dir());
            let (settings, saved_version) = store.settings();
            let mock = std::env::var("KOODEX_MOCK").ok().filter(|s| !s.is_empty());
            let http = reqwest::Client::builder()
                .user_agent(concat!("Koodex/", env!("CARGO_PKG_VERSION")))
                .connect_timeout(Duration::from_secs(10))
                .build()?;

            let snapshots = PROVIDERS.map(|p| {
                let cached = store
                    .read(cache_name(p))
                    .and_then(|v| v.get("usage").cloned())
                    .and_then(|v| serde_json::from_value::<Usage>(v).ok())
                    .filter(Usage::valid);
                Snapshot {
                    provider: p,
                    sync_state: if cached.is_some() { SyncState::Stale } else { SyncState::Connecting },
                    usage: cached,
                    error: None,
                }
            });
            let ledgers = PROVIDERS.map(|p| {
                store.read(ledger_name(p)).and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
            });

            let events_handle = handle.clone();
            let codex = codex::Codex::new(Arc::new(move |event| {
                let core = core(&events_handle);
                match event {
                    codex::CodexEvent::Updated => core.wake[Provider::Codex.index()].notify_one(),
                    codex::CodexEvent::Disconnected => core.set_snapshot(Provider::Codex, |s| {
                        if s.sync_state == SyncState::Synced {
                            s.sync_state = SyncState::Stale;
                        }
                    }),
                }
            }));
            let updates_handle = handle.clone();
            let updates = Updates::new(
                http.clone(),
                updates_disabled(),
                Arc::new(move |state| {
                    let _ = updates_handle.emit("updates", &state);
                    if let Some(core) = updates_handle.try_state::<Arc<Core>>() {
                        core.tray.render(&updates_handle, &core.snapshot(), &core.settings(), &state);
                    }
                }),
            );

            let core = Arc::new(Core {
                app: handle.clone(),
                store,
                settings: Mutex::new(settings.clone()),
                snapshots: Mutex::new(snapshots),
                ledgers: Mutex::new(ledgers),
                cache_saved: Mutex::new(Default::default()),
                wake: [Notify::new(), Notify::new()],
                codex,
                http,
                updates,
                shortcut: Mutex::new(("off".into(), String::new())),
                tray: tray::Tray::default(),
                windows: windows::Windows::default(),
                mock,
            });
            app.manage(core.clone());

            // One-time 2.0 migration: drop the Node.js status-line bridge from
            // Claude Code's settings (restoring any previous status line).
            if saved_version < SETTINGS_VERSION as u64 && core.mock.is_none() && std::env::var_os("KOODEX_TEST_DATA").is_none() {
                let _ = claude::remove_legacy_bridge();
                for stale in ["claude-bridge.cjs", "claude-usage.json", "claude-account-usage.json", "claude-discovered.json"] {
                    let _ = std::fs::remove_file(core.store.dir.join(stale));
                }
                remove_legacy_startup_entries();
            }
            // Keep "Launch at startup" pointing at this executable (the 1.x
            // entry referenced the old Electron install, now removed).
            let packaged = !cfg!(debug_assertions) && core.mock.is_none() && std::env::var_os("KOODEX_TEST_DATA").is_none();
            if packaged && settings.launch_at_startup {
                let launcher = handle.autolaunch();
                if !launcher.is_enabled().unwrap_or(false) {
                    let _ = launcher.enable();
                }
            }
            let _ = core.store.write("settings", &settings);

            tray::Tray::create(&handle)?;
            let _ = core.set_shortcut(&settings.pill_shortcut);
            for p in PROVIDERS {
                tauri::async_runtime::spawn(core.clone().monitor(p));
            }
            core.wake[settings.provider().index()].notify_one();
            core.windows.sync_pill(&handle, &settings);
            core.publish();
            if !settings.setup_completed && !startup {
                core.windows.open_settings(&handle, None);
            }
            if core.updates.enabled {
                let updater = core.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(30)).await;
                    loop {
                        updater.updates.check().await;
                        tokio::time::sleep(Duration::from_secs(6 * 3600)).await;
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Koodex")
        .run(|app, event| match event {
            // Koodex lives in the tray; closing windows never quits it.
            RunEvent::ExitRequested { code: None, api, .. } => api.prevent_exit(),
            RunEvent::Exit => {
                if let Some(core) = app.try_state::<Arc<Core>>() {
                    let core = core.inner().clone();
                    tauri::async_runtime::block_on(async move {
                        let _ = tokio::time::timeout(Duration::from_secs(2), core.codex.stop()).await;
                    });
                }
            }
            _ => {}
        });
}
