//! Tray icon, tooltip and menu.
use crate::icon::{self, Style};
use crate::settings::Settings;
use crate::updates::UpdateState;
use crate::usage::{tray_levels, Provider, Snapshot, SyncState};
use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Wry};

const TRAY_ID: &str = "koodex";

#[derive(Default)]
pub struct Tray {
    icon_key: Mutex<String>,
    menu_key: Mutex<String>,
}

/// True when the Windows taskbar uses the dark theme (the default).
fn taskbar_is_dark() -> bool {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        let key = winreg::RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize");
        if let Ok(key) = key {
            if let Ok(light) = key.get_value::<u32, _>("SystemUsesLightTheme") {
                return light == 0;
            }
        }
    }
    true
}

fn icon_size(app: &AppHandle) -> u32 {
    let scale = app.primary_monitor().ok().flatten().map_or(1.0, |m| m.scale_factor());
    ((16.0 * scale).round() as u32).clamp(16, 64)
}

pub fn line(label: &str, id: &str, remaining: Option<f64>) -> String {
    format!(
        "{}: {}",
        if id == "five-hour" { "5h" } else { label },
        remaining.map_or("unavailable".to_string(), |r| format!("{}% left", r.round()))
    )
}

impl Tray {
    pub fn create(app: &AppHandle) -> tauri::Result<TrayIcon> {
        TrayIconBuilder::with_id(TRAY_ID)
            .icon(Image::new_owned(icon::render(16, Style::Meter, [242, 246, 244], -1, -1), 16, 16))
            .tooltip("Koodex")
            .show_menu_on_left_click(false)
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, rect, .. } = event {
                    let app = tray.app_handle();
                    let scale = app.primary_monitor().ok().flatten().map_or(1.0, |m| m.scale_factor());
                    let p = rect.position.to_physical::<f64>(scale);
                    let s = rect.size.to_physical::<f64>(scale);
                    let anchor = crate::geometry::Rect { x: p.x, y: p.y, width: s.width, height: s.height };
                    crate::core(app).windows.toggle_popover(app, anchor);
                }
            })
            .build(app)
    }

    /// `shown` lists the visible providers, primary first. The icon follows the primary.
    pub fn render(&self, app: &AppHandle, shown: &[Snapshot], settings: &Settings, updates: &UpdateState) {
        let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
        let Some(primary) = shown.first() else { return };
        let windows = primary.usage.as_ref().map(|u| u.windows.clone()).unwrap_or_default();
        let (five, weekly) = tray_levels(&windows);
        let light = match settings.tray_color.as_str() {
            "light" => true,
            "dark" => false,
            _ => taskbar_is_dark(),
        };
        let size = icon_size(app);
        let style = if settings.tray_style == "ring" { Style::Ring } else { Style::Meter };
        let key = format!("{light}-{}-{five}-{weekly}-{size}", settings.tray_style);
        {
            let mut current = self.icon_key.lock().unwrap();
            if *current != key {
                let color = if light { [242, 246, 244] } else { [30, 36, 33] };
                let _ = tray.set_icon(Some(Image::new_owned(icon::render(size, style, color, five, weekly), size, size)));
                *current = key;
            }
        }

        let both = shown.len() > 1;
        // One section per provider: a heading when several are shown, then its limits.
        let sections: Vec<(Provider, Vec<String>, Option<&str>)> = shown
            .iter()
            .map(|s| {
                let lines = s
                    .usage
                    .as_ref()
                    .map(|u| u.windows.iter().map(|w| line(&w.label, &w.id, w.remaining_percent)).collect())
                    .unwrap_or_default();
                let status = match s.sync_state {
                    SyncState::Synced | SyncState::Refreshing => None,
                    SyncState::Stale => Some("Offline · last known usage"),
                    SyncState::Connecting => Some("Connecting…"),
                    SyncState::Offline | SyncState::Error => Some("Needs attention"),
                };
                (s.provider, lines, status)
            })
            .collect();
        let mut tooltip: Vec<String> = vec![if both { "Koodex".to_string() } else { format!("Koodex · {}", primary.provider.name()) }];
        for (provider, lines, status) in &sections {
            if both {
                let short: Vec<String> = lines.iter().map(|l| l.replace(" left", "")).collect();
                let detail = if short.is_empty() { status.unwrap_or("unavailable").to_string() } else { short.join(" · ") };
                tooltip.push(format!("{}: {detail}", if *provider == Provider::Claude { "Claude" } else { "Codex" }));
            } else {
                tooltip.extend(lines.iter().cloned());
                tooltip.extend(status.map(String::from));
            }
        }
        let tooltip: String = tooltip.join("\n").chars().take(127).collect();
        let _ = tray.set_tooltip(Some(tooltip));

        let menu_key = serde_json::json!([sections.iter().map(|(p, l, _)| (p, l)).collect::<Vec<_>>(), settings.provider, settings.show_both_providers, settings.launch_at_startup, settings.floating_pill_enabled, updates.status, updates.version]).to_string();
        {
            let mut current = self.menu_key.lock().unwrap();
            if *current == menu_key {
                return;
            }
            *current = menu_key;
        }
        let sections: Vec<(Provider, Vec<String>)> = sections.into_iter().map(|(p, l, _)| (p, l)).collect();
        if let Ok(menu) = build_menu(app, &sections, settings, updates) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

fn build_menu(app: &AppHandle, sections: &[(Provider, Vec<String>)], settings: &Settings, updates: &UpdateState) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    let both = sections.len() > 1;
    if !both {
        menu.append(&MenuItem::with_id(app, "header", format!("Koodex · {}", settings.provider().name()), false, None::<&str>)?)?;
    }
    for (p, lines) in sections {
        if both {
            menu.append(&MenuItem::with_id(app, format!("header-{}", p.index()), p.name(), false, None::<&str>)?)?;
        }
        for (i, l) in lines.iter().enumerate() {
            let text = if both { format!("    {l}") } else { l.clone() };
            menu.append(&MenuItem::with_id(app, format!("line-{}-{i}", p.index()), text, false, None::<&str>)?)?;
        }
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "open", "Open", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "refresh", "Refresh", true, None::<&str>)?)?;
    let show = Submenu::with_id(app, "provider", "Show usage for", true)?;
    let (provider, both) = (settings.provider(), settings.show_both_providers);
    show.append(&CheckMenuItem::with_id(app, "provider-codex", "Codex", true, !both && provider == Provider::Codex, None::<&str>)?)?;
    show.append(&CheckMenuItem::with_id(app, "provider-claude", "Claude Code", true, !both && provider == Provider::Claude, None::<&str>)?)?;
    show.append(&CheckMenuItem::with_id(app, "provider-both", "Both", true, both, None::<&str>)?)?;
    menu.append(&show)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&CheckMenuItem::with_id(app, "startup", "Launch at startup", !cfg!(debug_assertions), settings.launch_at_startup, None::<&str>)?)?;
    menu.append(&CheckMenuItem::with_id(app, "pill", "Show floating pill", true, settings.floating_pill_enabled, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?)?;
    let update_label = match updates.status.as_str() {
        "ready" => "Update ready to install…".to_string(),
        "available" => format!("Update {} available…", updates.version.clone().unwrap_or_default()),
        _ => "App updates…".to_string(),
    };
    menu.append(&MenuItem::with_id(app, "updates", update_label, true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Quit Koodex", true, None::<&str>)?)?;
    Ok(menu)
}
