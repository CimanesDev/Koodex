//! Preferences, validation and on-disk storage (`%APPDATA%\Koodex`).
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::PathBuf;

pub const SETTINGS_VERSION: u32 = 3;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub pill_shortcut: String,
    pub provider: String,
    pub show_both_providers: bool,
    pub launch_at_startup: bool,
    pub notifications_enabled: bool,
    pub refresh_interval_seconds: u32,
    pub floating_pill_enabled: bool,
    pub pill_layout: String,
    pub pill_both_style: String,
    pub pill_indicator: String,
    pub pill_content: String,
    pub pill_show_drag_handle: bool,
    pub pill_side_hideable: bool,
    pub pill_pin_offset: Option<f64>,
    pub pill_placement: String,
    pub pill_switch_seconds: u32,
    pub accent_color: String,
    pub pill_show_reset: bool,
    pub pill_show_refresh: bool,
    pub pill_show_provider: bool,
    pub tray_style: String,
    pub tray_color: String,
    pub show_refresh_activity: bool,
    pub pill_opacity: u32,
    pub pill_material: String,
    pub setup_completed: bool,
    pub settings_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pill_position: Option<Point>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            pill_shortcut: "off".into(),
            provider: "codex".into(),
            show_both_providers: false,
            launch_at_startup: false,
            notifications_enabled: false,
            refresh_interval_seconds: 10,
            floating_pill_enabled: true,
            pill_layout: "alternating".into(),
            pill_both_style: "separate".into(),
            pill_indicator: "ring".into(),
            pill_content: "details".into(),
            pill_show_drag_handle: true,
            pill_side_hideable: false,
            pill_pin_offset: None,
            pill_placement: "free".into(),
            pill_switch_seconds: 0,
            accent_color: "neutral".into(),
            pill_show_reset: false,
            pill_show_refresh: false,
            pill_show_provider: false,
            tray_style: "meter".into(),
            tray_color: "auto".into(),
            show_refresh_activity: false,
            pill_opacity: 100,
            pill_material: "solid".into(),
            setup_completed: false,
            settings_version: SETTINGS_VERSION,
            pill_position: None,
        }
    }
}

fn one_of(value: &Value, allowed: &[&str]) -> Option<String> {
    value.as_str().filter(|s| allowed.contains(s)).map(String::from)
}

impl Settings {
    /// Applies the recognised, valid keys of `patch`; everything else is ignored.
    /// Returns the keys that were applied.
    pub fn apply(&mut self, patch: &Map<String, Value>) -> Vec<String> {
        let mut applied = Vec::new();
        for (key, v) in patch {
            let ok = match key.as_str() {
                "pillShortcut" => set(&mut self.pill_shortcut, one_of(v, &["off", "CommandOrControl+Shift+K", "CommandOrControl+Alt+K"])),
                "provider" => set(&mut self.provider, one_of(v, &["codex", "claude"])),
                "pillLayout" => set(&mut self.pill_layout, one_of(v, &["alternating", "both"])),
                "pillBothStyle" => set(&mut self.pill_both_style, one_of(v, &["separate", "combined"])),
                "pillIndicator" => set(&mut self.pill_indicator, one_of(v, &["ring", "bar"])),
                "pillContent" => set(&mut self.pill_content, one_of(v, &["details", "indicator"])),
                "pillPlacement" => set(&mut self.pill_placement, one_of(v, &["free", "top-left", "top-center", "top-right", "left", "right"])),
                "accentColor" => set(&mut self.accent_color, one_of(v, &["neutral", "blue", "mint", "lavender", "rose"])),
                "trayStyle" => set(&mut self.tray_style, one_of(v, &["meter", "ring", "logo"]).map(|s| if s == "logo" { "meter".into() } else { s })),
                "trayColor" => set(&mut self.tray_color, one_of(v, &["auto", "light", "dark"])),
                "pillMaterial" => set(&mut self.pill_material, one_of(v, &["solid", "glass"])),
                "launchAtStartup" => set(&mut self.launch_at_startup, v.as_bool()),
                "notificationsEnabled" => set(&mut self.notifications_enabled, v.as_bool()),
                "floatingPillEnabled" => set(&mut self.floating_pill_enabled, v.as_bool()),
                "pillShowDragHandle" => set(&mut self.pill_show_drag_handle, v.as_bool()),
                "pillSideHideable" => set(&mut self.pill_side_hideable, v.as_bool()),
                "pillShowReset" => set(&mut self.pill_show_reset, v.as_bool()),
                "pillShowRefresh" => set(&mut self.pill_show_refresh, v.as_bool()),
                "pillShowProvider" => set(&mut self.pill_show_provider, v.as_bool()),
                "showBothProviders" => set(&mut self.show_both_providers, v.as_bool()),
                "showRefreshActivity" => set(&mut self.show_refresh_activity, v.as_bool()),
                "refreshIntervalSeconds" => set(&mut self.refresh_interval_seconds, v.as_u64().filter(|n| [10, 30, 60, 300].contains(n)).map(|n| n as u32)),
                "pillSwitchSeconds" => set(&mut self.pill_switch_seconds, v.as_u64().filter(|n| [0, 2, 3, 5].contains(n)).map(|n| n as u32)),
                "pillOpacity" => set(&mut self.pill_opacity, v.as_f64().filter(|n| (35.0..=100.0).contains(n)).map(|n| n.round() as u32)),
                "pillPinOffset" => {
                    if v.is_null() {
                        self.pill_pin_offset = None;
                        true
                    } else {
                        set_opt(&mut self.pill_pin_offset, v.as_f64().filter(|n| (0.0..=1.0).contains(n)))
                    }
                }
                "pillPosition" => {
                    let x = v.get("x").and_then(Value::as_f64).filter(|n| n.is_finite());
                    let y = v.get("y").and_then(Value::as_f64).filter(|n| n.is_finite());
                    match (x, y) {
                        (Some(x), Some(y)) => {
                            self.pill_position = Some(Point { x: x.round() as i32, y: y.round() as i32 });
                            true
                        }
                        _ => false,
                    }
                }
                _ => false,
            };
            if ok {
                applied.push(key.clone());
            }
        }
        applied
    }

    /// The primary provider: shown alone, or first (and in the tray) when both are shown.
    pub fn provider(&self) -> crate::usage::Provider {
        crate::usage::Provider::parse(&self.provider).unwrap_or(crate::usage::Provider::Codex)
    }

    pub fn shows(&self, p: crate::usage::Provider) -> bool {
        self.show_both_providers || self.provider() == p
    }
}

fn set<T>(slot: &mut T, value: Option<T>) -> bool {
    match value {
        Some(v) => {
            *slot = v;
            true
        }
        None => false,
    }
}
fn set_opt<T>(slot: &mut Option<T>, value: Option<T>) -> bool {
    match value {
        Some(v) => {
            *slot = Some(v);
            true
        }
        None => false,
    }
}

/// Loads saved preferences, accepting files written by Koodex 1.x.
pub fn migrate(saved: Option<&Map<String, Value>>) -> Settings {
    let mut settings = Settings::default();
    let Some(saved) = saved else { return settings };
    settings.apply(saved);
    let version = saved.get("settingsVersion").and_then(Value::as_u64).unwrap_or(0);
    // Legacy automatic cycling was implicit. Upgrades start with deliberate clicks.
    if version < 2 {
        settings.pill_switch_seconds = 0;
    }
    settings.setup_completed = if version >= 2 {
        saved.get("setupCompleted").and_then(Value::as_bool) == Some(true)
    } else {
        true
    };
    settings.settings_version = SETTINGS_VERSION;
    settings
}

pub struct Store {
    pub dir: PathBuf,
}

impl Store {
    pub fn new(dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&dir);
        Store { dir }
    }
    pub fn path(&self, name: &str) -> PathBuf {
        self.dir.join(format!("{name}.json"))
    }
    pub fn read(&self, name: &str) -> Option<Value> {
        let text = fs::read_to_string(self.path(name)).ok()?;
        serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()
    }
    pub fn write<T: Serialize>(&self, name: &str, value: &T) -> Result<(), String> {
        let path = self.path(name);
        let tmp = path.with_extension("json.tmp");
        let text = serde_json::to_string(value).map_err(|e| e.to_string())?;
        fs::write(&tmp, text).map_err(|e| format!("Could not save {name}: {e}"))?;
        fs::rename(&tmp, &path).map_err(|e| format!("Could not save {name}: {e}"))
    }
    pub fn settings(&self) -> (Settings, u64) {
        let saved = self.read("settings");
        let version = saved
            .as_ref()
            .and_then(|v| v.get("settingsVersion"))
            .and_then(Value::as_u64)
            .unwrap_or(if saved.is_some() { 0 } else { SETTINGS_VERSION as u64 });
        (migrate(saved.as_ref().and_then(Value::as_object)), version)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rejects_invalid_values() {
        let mut s = Settings::default();
        let applied = s.apply(json!({"provider":"cursor","pillOpacity":20,"refreshIntervalSeconds":30,"pillPinOffset":null}).as_object().unwrap());
        assert_eq!(s.provider, "codex");
        assert_eq!(s.pill_opacity, 100);
        assert_eq!(s.refresh_interval_seconds, 30);
        assert!(applied.contains(&"pillPinOffset".to_string()));
    }

    #[test]
    fn migrates_v1_and_v2_files() {
        let v1 = migrate(json!({"pillSwitchSeconds":3,"monitorBoth":true}).as_object());
        assert_eq!(v1.pill_switch_seconds, 0);
        assert!(v1.setup_completed);
        let v2 = migrate(json!({"settingsVersion":2,"setupCompleted":false,"trayStyle":"logo","provider":"claude"}).as_object());
        assert!(!v2.setup_completed);
        assert_eq!(v2.tray_style, "meter");
        assert_eq!(v2.provider, "claude");
        assert_eq!(v2.settings_version, SETTINGS_VERSION);
    }

    #[test]
    fn camel_case_round_trip() {
        let value = serde_json::to_value(Settings::default()).unwrap();
        assert!(value.get("pillShowDragHandle").is_some());
        assert!(value.get("monitorBoth").is_none());
    }
}
