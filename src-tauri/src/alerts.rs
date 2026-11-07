//! Low-usage alerts: once each at 25%, 10% and 0% remaining per quota cycle.
use crate::usage::Usage;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Entry {
    pub cycle: i64,
    pub threshold: f64,
    #[serde(default)]
    pub remaining: Option<f64>,
}

pub type Ledger = HashMap<String, Entry>;

pub struct Alert {
    pub label: String,
    pub remaining: f64,
    pub resets_at: i64,
}

pub fn collect(usage: &Usage, ledger: &mut Ledger, now: i64) -> Vec<Alert> {
    let mut alerts = Vec::new();
    for w in &usage.windows {
        let (Some(remaining), Some(resets_at)) = (w.remaining_percent, w.resets_at) else { continue };
        if resets_at <= now {
            continue;
        }
        let previous = ledger.get(&w.id).cloned();
        // Reset timestamps drift while a quota stays exhausted. Rearm only after
        // the old reset passed AND usage actually recovered.
        let recovered = previous
            .as_ref()
            .map_or(false, |p| now >= p.cycle && remaining > p.remaining.unwrap_or(p.threshold));
        let Some(threshold) = [0.0, 10.0, 25.0].into_iter().find(|t| remaining <= *t) else {
            if recovered {
                ledger.remove(&w.id);
            }
            continue;
        };
        if let Some(p) = &previous {
            if !recovered && p.threshold <= threshold {
                continue;
            }
        }
        ledger.insert(w.id.clone(), Entry { cycle: resets_at, threshold, remaining: Some(remaining) });
        alerts.push(Alert { label: w.label.clone(), remaining, resets_at });
    }
    alerts
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::usage::UsageWindow;
    fn usage(remaining: f64, reset: i64) -> Usage {
        Usage {
            windows: vec![UsageWindow::new("five-hour", "5-hour", Some(100.0 - remaining), Some(reset), Some(300.0))],
            plan_type: None,
            credits: None,
            fetched_at: 1,
        }
    }
    #[test]
    fn fires_once_per_threshold_and_rearms() {
        let mut ledger = Ledger::new();
        assert_eq!(collect(&usage(20.0, 1000), &mut ledger, 0).len(), 1);
        assert_eq!(collect(&usage(18.0, 1000), &mut ledger, 0).len(), 0);
        // Skipping straight to 0 produces one urgent alert.
        assert_eq!(collect(&usage(0.0, 1000), &mut ledger, 0).len(), 1);
        // Reset drift while exhausted does not repeat.
        assert_eq!(collect(&usage(0.0, 2000), &mut ledger, 500).len(), 0);
        // Recovery after the reset clears the entry.
        assert_eq!(collect(&usage(90.0, 9000), &mut ledger, 1500).len(), 0);
        assert!(ledger.is_empty());
    }
}
