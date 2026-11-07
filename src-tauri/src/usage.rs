//! Wire types shared with the renderer (`src/shared/types.ts`).
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Codex,
    Claude,
}

impl Provider {
    pub fn name(self) -> &'static str {
        match self {
            Provider::Codex => "Codex",
            Provider::Claude => "Claude Code",
        }
    }
    pub fn index(self) -> usize {
        self as usize
    }
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "codex" => Some(Provider::Codex),
            "claude" => Some(Provider::Claude),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub id: String,
    pub label: String,
    pub used_percent: Option<f64>,
    pub remaining_percent: Option<f64>,
    /// Unix milliseconds.
    pub resets_at: Option<i64>,
    pub window_minutes: Option<f64>,
}

impl UsageWindow {
    pub fn new(id: &str, label: &str, used: Option<f64>, resets_at: Option<i64>, minutes: Option<f64>) -> Self {
        let used = used.filter(|v| v.is_finite()).map(|v| v.clamp(0.0, 100.0));
        UsageWindow {
            id: id.into(),
            label: label.into(),
            used_percent: used,
            remaining_percent: used.map(|u| 100.0 - u),
            resets_at,
            window_minutes: minutes,
        }
    }
    pub fn is_five_hour(&self) -> bool {
        self.id == "five-hour" || self.window_minutes == Some(300.0)
    }
    pub fn is_weekly(&self) -> bool {
        self.id == "weekly" || self.window_minutes == Some(10080.0)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub windows: Vec<UsageWindow>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credits: Option<f64>,
    pub fetched_at: i64,
}

impl Usage {
    pub fn valid(&self) -> bool {
        self.fetched_at > 0
            && self.windows.iter().all(|w| {
                w.remaining_percent.map_or(true, |p| (0.0..=100.0).contains(&p))
            })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncState {
    Connecting,
    Synced,
    Refreshing,
    Stale,
    Offline,
    Error,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub provider: Provider,
    pub usage: Option<Usage>,
    pub sync_state: SyncState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl Snapshot {
    pub fn empty(provider: Provider) -> Self {
        Snapshot { provider, usage: None, sync_state: SyncState::Connecting, error: None }
    }
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Tray steps (0–10, or -1 when unknown) for the 5-hour and weekly windows.
pub fn tray_levels(windows: &[UsageWindow]) -> (i32, i32) {
    let step = |w: Option<&UsageWindow>| {
        w.and_then(|w| w.remaining_percent)
            .map(|p| (p / 10.0).round().clamp(0.0, 10.0) as i32)
            .unwrap_or(-1)
    };
    (
        step(windows.iter().find(|w| w.is_five_hour())),
        step(windows.iter().find(|w| w.is_weekly())),
    )
}

pub fn reset_in(at: i64, now: i64) -> String {
    let m = ((at - now) as f64 / 60000.0).ceil().max(0.0) as i64;
    if m == 0 {
        return "soon".into();
    }
    if m < 60 {
        return format!("{m}m");
    }
    let h = m / 60;
    if h < 24 {
        return format!("{h}h {}m", m % 60);
    }
    format!("{}d {}h", h / 24, h % 24)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn levels_round_and_default() {
        let w = vec![UsageWindow::new("weekly", "Weekly", Some(26.0), None, Some(10080.0))];
        assert_eq!(tray_levels(&w), (-1, 7));
    }
    #[test]
    fn reset_formatting() {
        assert_eq!(reset_in(0, 0), "soon");
        assert_eq!(reset_in(90 * 60000, 0), "1h 30m");
        assert_eq!(reset_in(50 * 3600000, 0), "2d 2h");
    }
}
