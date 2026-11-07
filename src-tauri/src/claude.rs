//! Claude Code account usage.
//!
//! Koodex 1.x relied on Claude Code's status line, which only runs inside the
//! terminal CLI. Usage from the desktop app, IDE extensions or claude.ai never
//! reached it, so reports went stale. Instead we now ask the account usage
//! endpoint that Claude Code's own `/usage` screen uses, authenticated with the
//! OAuth sign-in Claude Code already stores locally. Nothing is sent anywhere
//! except Anthropic's own API.
use crate::usage::{now_ms, Usage, UsageWindow};
use base64::Engine;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const TOKEN_URL: &str = "https://platform.claude.com/v1/oauth/token";
const CLIENT_ID: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const BETA: &str = "oauth-2025-04-20";

#[derive(Debug)]
pub enum ClaudeError {
    /// Not signed in, or the sign-in can no longer be refreshed.
    SignIn(String),
    /// Usage endpoint asked us to slow down.
    RateLimited,
    Other(String),
}

impl ClaudeError {
    pub fn message(&self) -> String {
        match self {
            ClaudeError::SignIn(m) | ClaudeError::Other(m) => m.clone(),
            ClaudeError::RateLimited => {
                "Claude usage is temporarily rate limited. Koodex will retry shortly.".into()
            }
        }
    }
}

pub fn config_dir() -> PathBuf {
    std::env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| home().join(".claude"))
}

fn home() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_default()
}

fn credentials_path() -> PathBuf {
    config_dir().join(".credentials.json")
}

struct Credentials {
    access_token: String,
    refresh_token: Option<String>,
    expires_at: i64,
    scopes: Vec<String>,
    plan: Option<String>,
}

fn read_credentials(path: &Path) -> Result<(Value, Credentials), ClaudeError> {
    let sign_in = || {
        ClaudeError::SignIn(
            "Sign in to Claude Code first: run `claude` in a terminal and log in with your Pro or Max account."
                .into(),
        )
    };
    let text = fs::read_to_string(path).map_err(|_| sign_in())?;
    let root: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|_| sign_in())?;
    let oauth = root.get("claudeAiOauth").ok_or_else(sign_in)?;
    let access_token = oauth
        .get("accessToken")
        .and_then(Value::as_str)
        .filter(|t| !t.is_empty())
        .ok_or_else(sign_in)?
        .to_string();
    let creds = Credentials {
        access_token,
        refresh_token: oauth.get("refreshToken").and_then(Value::as_str).map(String::from),
        expires_at: oauth.get("expiresAt").and_then(Value::as_i64).unwrap_or(i64::MAX),
        scopes: oauth
            .get("scopes")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect())
            .unwrap_or_default(),
        plan: oauth.get("subscriptionType").and_then(Value::as_str).map(String::from),
    };
    Ok((root, creds))
}

/// Exchanges the stored refresh token and writes the new tokens back exactly
/// like Claude Code does, so Claude Code keeps working with the rotated token.
async fn refresh(client: &reqwest::Client, path: &Path, creds: &Credentials) -> Result<Credentials, ClaudeError> {
    let expired = || {
        ClaudeError::SignIn(
            "Your Claude Code sign-in expired. Run `claude` in a terminal (or `claude /login`) to sign in again."
                .into(),
        )
    };
    let refresh_token = creds.refresh_token.clone().ok_or_else(expired)?;
    let scopes = if creds.scopes.is_empty() {
        "user:profile user:inference".to_string()
    } else {
        creds.scopes.join(" ")
    };
    let response = client
        .post(TOKEN_URL)
        .json(&json!({
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": CLIENT_ID,
            "scope": scopes,
        }))
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|_| ClaudeError::Other("Could not reach Claude to renew your sign-in. Retrying automatically.".into()))?;
    let status = response.status();
    if status.as_u16() == 400 || status.as_u16() == 401 || status.as_u16() == 403 {
        // Claude Code may have rotated the token in the meantime; use its copy.
        if let Ok((_, latest)) = read_credentials(path) {
            if latest.refresh_token != creds.refresh_token && latest.expires_at > now_ms() + 60_000 {
                return Ok(latest);
            }
        }
        return Err(expired());
    }
    if !status.is_success() {
        return Err(ClaudeError::Other(format!("Claude sign-in renewal failed ({status}). Retrying automatically.")));
    }
    let data: Value = response
        .json()
        .await
        .map_err(|_| ClaudeError::Other("Claude returned an unexpected sign-in response.".into()))?;
    let access = data.get("access_token").and_then(Value::as_str).ok_or_else(expired)?.to_string();
    let new_refresh = data.get("refresh_token").and_then(Value::as_str).map(String::from).unwrap_or(refresh_token.clone());
    let expires_at = now_ms() + data.get("expires_in").and_then(Value::as_i64).unwrap_or(3600) * 1000;

    // Compare-and-swap: only write if nobody else refreshed since we read.
    let (mut root, latest) = read_credentials(path)?;
    if latest.refresh_token.as_deref() == Some(refresh_token.as_str()) {
        if let Some(oauth) = root.get_mut("claudeAiOauth").and_then(Value::as_object_mut) {
            oauth.insert("accessToken".into(), json!(access));
            oauth.insert("refreshToken".into(), json!(new_refresh));
            oauth.insert("expiresAt".into(), json!(expires_at));
            if let Some(seconds) = data.get("refresh_token_expires_in").and_then(Value::as_i64) {
                oauth.insert("refreshTokenExpiresAt".into(), json!(now_ms() + seconds * 1000));
            }
            if let Some(scope) = data.get("scope").and_then(Value::as_str) {
                oauth.insert("scopes".into(), json!(scope.split_whitespace().collect::<Vec<_>>()));
            }
        }
        let tmp = path.with_extension("json.koodex-tmp");
        let text = serde_json::to_string(&root).map_err(|e| ClaudeError::Other(e.to_string()))?;
        if fs::write(&tmp, text).and_then(|_| fs::rename(&tmp, path)).is_err() {
            let _ = fs::remove_file(&tmp);
            return Err(ClaudeError::Other("Could not save the renewed Claude sign-in.".into()));
        }
    }
    Ok(Credentials {
        access_token: access,
        refresh_token: Some(new_refresh),
        expires_at,
        scopes: creds.scopes.clone(),
        plan: creds.plan.clone(),
    })
}

pub async fn read(client: &reqwest::Client) -> Result<Usage, ClaudeError> {
    let path = credentials_path();
    let (_, mut creds) = read_credentials(&path)?;
    let mut refreshed = false;
    if creds.expires_at <= now_ms() + 60_000 {
        creds = refresh(client, &path, &creds).await?;
        refreshed = true;
    }
    loop {
        let response = client
            .get(USAGE_URL)
            .bearer_auth(&creds.access_token)
            .header("anthropic-beta", BETA)
            .header("Accept", "application/json")
            .timeout(Duration::from_secs(20))
            .send()
            .await
            .map_err(|_| ClaudeError::Other("Could not reach Claude. Check your connection; Koodex retries automatically.".into()))?;
        match response.status().as_u16() {
            401 if !refreshed => {
                creds = refresh(client, &path, &creds).await?;
                refreshed = true;
                continue;
            }
            401 | 403 => {
                return Err(ClaudeError::SignIn(
                    "Claude did not accept your sign-in. Run `claude /login` in a terminal, then retry.".into(),
                ))
            }
            429 => return Err(ClaudeError::RateLimited),
            200..=299 => {}
            code => return Err(ClaudeError::Other(format!("Claude usage is unavailable right now ({code}). Retrying automatically."))),
        }
        let data: Value = response
            .json()
            .await
            .map_err(|_| ClaudeError::Other("Claude returned an unexpected usage response.".into()))?;
        return adapt(&data, creds.plan.clone(), now_ms())
            .ok_or_else(|| ClaudeError::Other("Claude returned an unexpected usage response.".into()));
    }
}

pub fn adapt(data: &Value, plan: Option<String>, now: i64) -> Option<Usage> {
    let obj = data.as_object()?;
    let mut windows = Vec::new();
    for (key, id, label, minutes) in [
        ("five_hour", "five-hour", "5-hour", 300.0),
        ("seven_day", "weekly", "Weekly", 10080.0),
        ("seven_day_opus", "weekly-opus", "Weekly · Opus", 10080.5),
        ("seven_day_sonnet", "weekly-sonnet", "Weekly · Sonnet", 10080.5),
    ] {
        let Some(w) = obj.get(key).and_then(Value::as_object) else { continue };
        let used = w.get("utilization").and_then(Value::as_f64);
        // Model-specific weekly windows are only interesting once used.
        if minutes != 300.0 && minutes != 10080.0 && used.unwrap_or(0.0) <= 0.0 {
            continue;
        }
        let resets_at = w.get("resets_at").and_then(|v| match v {
            Value::String(s) => parse_rfc3339(s),
            Value::Number(n) => n.as_f64().map(|s| (s * 1000.0) as i64),
            _ => None,
        });
        // Distinct minutes keep the extra windows out of the 5h/weekly slots.
        let minutes = if minutes == 10080.5 { None } else { Some(minutes) };
        windows.push(UsageWindow::new(id, label, used, resets_at, minutes));
    }
    if windows.is_empty() && !obj.contains_key("five_hour") && !obj.contains_key("seven_day") {
        return None;
    }
    Some(Usage { windows, plan_type: plan, credits: None, fetched_at: now })
}

/// Parses `YYYY-MM-DDTHH:MM:SS[.fff][Z|±HH:MM]` into Unix milliseconds.
pub fn parse_rfc3339(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 19 {
        return None;
    }
    let num = |r: std::ops::Range<usize>| s.get(r)?.parse::<i64>().ok();
    let (y, mo, d, h, mi, sec) = (num(0..4)?, num(5..7)?, num(8..10)?, num(11..13)?, num(14..16)?, num(17..19)?);
    let mut i = 19;
    let mut ms = 0i64;
    if b.get(i) == Some(&b'.') {
        i += 1;
        let start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        let frac = &s[start..i];
        let digits: String = frac.chars().chain("000".chars()).take(3).collect();
        ms = digits.parse().ok()?;
    }
    let offset_min = match b.get(i) {
        None | Some(b'Z') | Some(b'z') => 0,
        Some(&c) if c == b'+' || c == b'-' => {
            let oh = num(i + 1..i + 3)?;
            let om = num(i + 4..i + 6)?;
            (oh * 60 + om) * if c == b'-' { -1 } else { 1 }
        }
        _ => return None,
    };
    // Days from civil (Howard Hinnant).
    let (y2, m2) = if mo <= 2 { (y - 1, mo + 9) } else { (y, mo - 3) };
    let era = y2.div_euclid(400);
    let yoe = y2 - era * 400;
    let doy = (153 * m2 + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    Some(((days * 86400 + h * 3600 + mi * 60 + sec) - offset_min * 60) * 1000 + ms)
}

/// Koodex 1.x installed a status-line bridge that needed Node.js on every
/// status-line render. Restore the user's previous status line (with a backup).
pub fn remove_legacy_bridge() -> Result<bool, String> {
    let dir = config_dir();
    let path = dir.join("settings.json");
    let Ok(original) = fs::read_to_string(&path) else { return Ok(false) };
    let mut root: Map<String, Value> = match serde_json::from_str(original.trim_start_matches('\u{feff}')) {
        Ok(Value::Object(map)) => map,
        _ => return Ok(false),
    };
    let Some(command) = root.get("statusLine").and_then(|s| s.get("command")).and_then(Value::as_str) else {
        return Ok(false);
    };
    let Some(previous) = legacy_previous_command(command) else { return Ok(false) };
    let backup = dir.join(format!("settings.koodex-backup-{}.json", now_ms()));
    fs::write(&backup, &original).map_err(|e| e.to_string())?;
    if previous.trim().is_empty() {
        root.remove("statusLine");
    } else if let Some(Value::Object(line)) = root.get_mut("statusLine") {
        line.insert("command".into(), Value::String(previous));
    }
    let tmp = path.with_extension("json.koodex-tmp");
    let text = serde_json::to_string_pretty(&Value::Object(root)).map_err(|e| e.to_string())? + "\n";
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Returns the wrapped command if `command` is the Koodex 1.x bridge.
pub fn legacy_previous_command(command: &str) -> Option<String> {
    let b64 = base64::engine::general_purpose::STANDARD;
    let between = |start: &str, end: &str| -> Option<String> {
        let at = command.find(start)? + start.len();
        let len = command[at..].find(end)?;
        Some(command[at..at + len].to_string())
    };
    let target = between("Buffer.from('", "'")?;
    let target = String::from_utf8(b64.decode(target).ok()?).ok()?;
    if !target.to_ascii_lowercase().ends_with("claude-bridge.cjs") {
        return None;
    }
    Some(match between("previousCommand='", "'") {
        Some(prev) => String::from_utf8(b64.decode(prev).ok()?).ok()?,
        None => String::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_timestamps() {
        assert_eq!(parse_rfc3339("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_rfc3339("2025-11-04T04:59:59.943648+00:00"), Some(1762232399943));
        assert_eq!(parse_rfc3339("2025-11-04T06:59:59+02:00"), Some(1762232399000));
        assert_eq!(parse_rfc3339("nope"), None);
    }

    #[test]
    fn adapts_usage_response() {
        let data = json!({
            "five_hour": {"utilization": 12.0, "resets_at": "2025-11-04T04:59:59Z"},
            "seven_day": {"utilization": 35.5, "resets_at": null},
            "seven_day_opus": {"utilization": 0.0, "resets_at": null},
            "seven_day_sonnet": {"utilization": 4.0, "resets_at": null},
            "extra_usage": null
        });
        let usage = adapt(&data, Some("max".into()), 5).unwrap();
        assert_eq!(usage.windows.len(), 3);
        assert_eq!(usage.windows[0].remaining_percent, Some(88.0));
        assert_eq!(usage.windows[1].id, "weekly");
        assert_eq!(usage.windows[2].window_minutes, None);
        assert_eq!(usage.plan_type.as_deref(), Some("max"));
        assert!(adapt(&json!({"error": 1}), None, 0).is_none());
    }

    #[test]
    fn recognises_legacy_bridge() {
        let b64 = base64::engine::general_purpose::STANDARD;
        let path = b64.encode("C:\\Users\\me\\AppData\\Roaming\\Koodex\\claude-bridge.cjs");
        let prev = b64.encode("bash ~/.claude/statusline.sh");
        let wrapped = format!("node -e \"require(Buffer.from('{path}','base64').toString()).previousCommand='{prev}'\"");
        assert_eq!(legacy_previous_command(&wrapped).as_deref(), Some("bash ~/.claude/statusline.sh"));
        let bare = format!("node -e \"require(Buffer.from('{path}','base64').toString())\"");
        assert_eq!(legacy_previous_command(&bare).as_deref(), Some(""));
        assert!(legacy_previous_command("bash statusline.sh").is_none());
    }
}
