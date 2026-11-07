//! In-app updates from GitHub releases. The installer is downloaded only when
//! the user asks, verified against the release's SHA256SUMS.txt, and run only
//! after "Restart and install".
use crate::usage::now_ms;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const LATEST: &str = "https://api.github.com/repos/CimanesDev/Koodex/releases/latest";
pub const RELEASES: &str = "https://github.com/CimanesDev/Koodex/releases/latest";

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateState {
    pub status: String,
    pub current_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checked_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failed_action: Option<String>,
}

#[derive(Clone)]
struct Release {
    asset_url: String,
    asset_name: String,
    sums_url: Option<String>,
}

pub struct Updates {
    state: Mutex<UpdateState>,
    release: Mutex<Option<Release>>,
    file: Mutex<Option<PathBuf>>,
    http: reqwest::Client,
    changed: Arc<dyn Fn(UpdateState) + Send + Sync>,
    pub enabled: bool,
}

pub fn newer(candidate: &str, current: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.trim_start_matches('v')
            .split(['-', '+'])
            .next()
            .unwrap_or("")
            .split('.')
            .map(|p| p.parse().unwrap_or(0))
            .collect()
    };
    let (a, b) = (parse(candidate), parse(current));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (a.get(i).copied().unwrap_or(0), b.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    false
}

impl Updates {
    pub fn new(http: reqwest::Client, disabled: Option<String>, changed: Arc<dyn Fn(UpdateState) + Send + Sync>) -> Self {
        let state = UpdateState {
            status: if disabled.is_some() { "disabled" } else { "idle" }.into(),
            current_version: env!("CARGO_PKG_VERSION").into(),
            message: disabled.clone(),
            ..Default::default()
        };
        Updates {
            state: Mutex::new(state),
            release: Mutex::new(None),
            file: Mutex::new(None),
            http,
            changed,
            enabled: disabled.is_none(),
        }
    }

    pub fn get(&self) -> UpdateState {
        self.state.lock().unwrap().clone()
    }

    fn set(&self, f: impl FnOnce(&mut UpdateState)) -> UpdateState {
        let next = {
            let mut s = self.state.lock().unwrap();
            f(&mut s);
            s.clone()
        };
        (self.changed)(next.clone());
        next
    }

    fn fail(&self, action: &str, message: &str) -> UpdateState {
        self.set(|s| {
            s.status = "error".into();
            s.failed_action = Some(action.into());
            s.message = Some(message.into());
            s.percent = None;
        })
    }

    pub async fn check(&self) -> UpdateState {
        if !self.enabled {
            return self.get();
        }
        let status = self.get().status;
        if ["checking", "downloading", "ready", "installing"].contains(&status.as_str()) {
            return self.get();
        }
        self.set(|s| {
            s.status = "checking".into();
            s.message = None;
            s.failed_action = None;
        });
        let result = async {
            let data: Value = self
                .http
                .get(LATEST)
                .header("Accept", "application/vnd.github+json")
                .timeout(Duration::from_secs(20))
                .send()
                .await
                .and_then(|r| r.error_for_status())
                .map_err(|e| e.to_string())?
                .json()
                .await
                .map_err(|e| e.to_string())?;
            let tag = data.get("tag_name").and_then(Value::as_str).ok_or("missing tag")?;
            let assets = data.get("assets").and_then(Value::as_array).cloned().unwrap_or_default();
            let find = |pred: &dyn Fn(&str) -> bool| {
                assets.iter().find_map(|a| {
                    let name = a.get("name")?.as_str()?;
                    let url = a.get("browser_download_url")?.as_str()?;
                    pred(&name.to_ascii_lowercase()).then(|| (name.to_string(), url.to_string()))
                })
            };
            let installer = find(&|n| n.ends_with("-setup.exe") || n.ends_with("-nsis.exe"));
            let sums = find(&|n| n == "sha256sums.txt").map(|(_, url)| url);
            Ok::<_, String>((tag.trim_start_matches('v').to_string(), installer, sums))
        }
        .await;
        match result {
            Err(_) => self.fail("check", "Could not check for updates. Check your connection and try again."),
            Ok((version, installer, sums_url)) => {
                if !newer(&version, env!("CARGO_PKG_VERSION")) {
                    return self.set(|s| {
                        s.status = "current".into();
                        s.checked_at = Some(now_ms());
                    });
                }
                let Some((asset_name, asset_url)) = installer else {
                    return self.fail("check", "The latest release has no Windows installer yet.");
                };
                *self.release.lock().unwrap() = Some(Release { asset_url, asset_name, sums_url });
                self.set(|s| {
                    s.status = "available".into();
                    s.version = Some(version);
                    s.checked_at = Some(now_ms());
                })
            }
        }
    }

    pub async fn download(&self) -> UpdateState {
        let Some(release) = self.release.lock().unwrap().clone() else { return self.check().await };
        if self.get().status == "downloading" {
            return self.get();
        }
        self.set(|s| {
            s.status = "downloading".into();
            s.percent = Some(0);
            s.failed_action = None;
            s.message = None;
        });
        match self.fetch(&release).await {
            Ok(path) => {
                *self.file.lock().unwrap() = Some(path);
                self.set(|s| {
                    s.status = "ready".into();
                    s.percent = None;
                })
            }
            Err(message) => self.fail("download", &message),
        }
    }

    async fn fetch(&self, release: &Release) -> Result<PathBuf, String> {
        let generic = "The update could not be downloaded. Please try again.".to_string();
        let sums_url = release.sums_url.clone().ok_or("This release has no checksums, so it cannot be verified.")?;
        let sums = self
            .http
            .get(&sums_url)
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|_| generic.clone())?
            .text()
            .await
            .map_err(|_| generic.clone())?;
        let expected = sums
            .lines()
            .find_map(|line| {
                let mut parts = line.split_whitespace();
                let hash = parts.next()?;
                let name = parts.next()?.trim_start_matches('*');
                (name == release.asset_name).then(|| hash.to_ascii_lowercase())
            })
            .ok_or("This release has no checksum for its installer.")?;

        let mut response = self
            .http
            .get(&release.asset_url)
            .timeout(Duration::from_secs(600))
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|_| generic.clone())?;
        let total = response.content_length().unwrap_or(0);
        let mut hasher = Sha256::new();
        let mut bytes = Vec::with_capacity(total as usize);
        let mut last = 0;
        while let Some(chunk) = response.chunk().await.map_err(|_| generic.clone())? {
            hasher.update(&chunk);
            bytes.extend_from_slice(&chunk);
            if total > 0 {
                let percent = (bytes.len() as u64 * 100 / total) as u32;
                if percent != last {
                    last = percent;
                    self.set(|s| s.percent = Some(percent));
                }
            }
        }
        let actual: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
        if actual != expected {
            return Err("The downloaded update failed verification and was discarded.".into());
        }
        let dir = std::env::temp_dir().join("Koodex-update");
        let _ = std::fs::create_dir_all(&dir);
        let safe_name: String = release.asset_name.chars().filter(|c| c.is_ascii_alphanumeric() || "._-".contains(*c)).collect();
        let path = dir.join(safe_name);
        std::fs::write(&path, bytes).map_err(|_| generic)?;
        Ok(path)
    }

    /// Starts the verified installer. The caller exits the app afterwards.
    pub fn install(&self) -> Result<(), String> {
        let path = self.file.lock().unwrap().clone().ok_or("No update has been downloaded.")?;
        self.set(|s| s.status = "installing".into());
        // Passive mode shows progress only; the installer relaunches Koodex.
        std::process::Command::new(&path).args(["/P", "/R"]).spawn().map(|_| ()).map_err(|_| {
            self.fail("install", "The installer could not be started. Please try again.");
            "The installer could not be started.".to_string()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::newer;
    #[test]
    fn compares_versions() {
        assert!(newer("v2.0.1", "2.0.0"));
        assert!(newer("2.1", "2.0.9"));
        assert!(!newer("2.0.0", "2.0.0"));
        assert!(!newer("1.9.9", "2.0.0"));
        assert!(!newer("2.0.0-beta", "2.0.0"));
    }
}
