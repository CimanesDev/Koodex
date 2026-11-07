//! Codex usage via one long-lived `codex app-server --listen stdio://` child.
//! Wire fields follow codex-cli `app-server generate-ts`.
use crate::usage::{now_ms, Usage, UsageWindow};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex};

type Pending = Arc<StdMutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>;

pub enum CodexEvent {
    /// Usage or account changed; read again.
    Updated,
    /// The child exited unexpectedly.
    Disconnected,
}

struct Conn {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    pending: Pending,
    id: u64,
}

pub struct Codex {
    conn: Mutex<Option<Conn>>,
    seq: AtomicU64,
    generation: Arc<AtomicU64>,
    events: Arc<dyn Fn(CodexEvent) + Send + Sync>,
}

pub fn locate() -> Option<PathBuf> {
    let mut roots: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    if let Some(appdata) = std::env::var_os("APPDATA") {
        roots.push(Path::new(&appdata).join("npm"));
    }
    let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
    for root in roots {
        let exe = root.join("codex.exe");
        if exe.is_file() {
            return Some(exe);
        }
        for base in [
            root.join("node_modules/@openai/codex/node_modules/@openai").join(format!("codex-win32-{arch}")).join("vendor"),
            root.join("node_modules/@openai/codex/vendor"),
        ] {
            let Ok(entries) = std::fs::read_dir(&base) else { continue };
            for entry in entries.flatten() {
                for dir in ["bin", "codex"] {
                    let path = entry.path().join(dir).join("codex.exe");
                    if path.is_file() {
                        return Some(path);
                    }
                }
            }
        }
    }
    None
}

impl Codex {
    pub fn new(events: Arc<dyn Fn(CodexEvent) + Send + Sync>) -> Self {
        Codex { conn: Mutex::new(None), seq: AtomicU64::new(0), generation: Arc::new(AtomicU64::new(0)), events }
    }

    async fn send(stdin: &Arc<Mutex<ChildStdin>>, message: &Value) -> Result<(), String> {
        let mut line = message.to_string();
        line.push('\n');
        let mut stdin = stdin.lock().await;
        stdin.write_all(line.as_bytes()).await.map_err(|_| "Codex disconnected".to_string())?;
        stdin.flush().await.map_err(|_| "Codex disconnected".to_string())
    }

    async fn request(&self, conn: &Conn, method: &str, params: Value) -> Result<Value, String> {
        let id = self.seq.fetch_add(1, Ordering::Relaxed) + 1;
        let (tx, rx) = oneshot::channel();
        conn.pending.lock().unwrap().insert(id, tx);
        if let Err(e) = Self::send(&conn.stdin, &json!({"id": id, "method": method, "params": params})).await {
            conn.pending.lock().unwrap().remove(&id);
            return Err(e);
        }
        match tokio::time::timeout(Duration::from_secs(20), rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("Codex disconnected".into()),
            Err(_) => {
                conn.pending.lock().unwrap().remove(&id);
                Err("Codex request timed out".into())
            }
        }
    }

    async fn start(&self) -> Result<Conn, String> {
        let exe = locate().ok_or("Codex not found")?;
        let mut command = Command::new(exe);
        command
            .args(["app-server", "--listen", "stdio://"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        let mut child = command.spawn().map_err(|e| format!("Codex not found ({e})"))?;
        let stdin = Arc::new(Mutex::new(child.stdin.take().ok_or("Codex disconnected")?));
        let stdout = child.stdout.take().ok_or("Codex disconnected")?;
        let pending: Pending = Arc::default();
        let id = self.generation.fetch_add(1, Ordering::SeqCst) + 1;

        let (reader_pending, reader_stdin, events, generation) =
            (pending.clone(), stdin.clone(), self.events.clone(), self.generation.clone());
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::with_capacity(64 * 1024, stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if line.len() > 4 * 1024 * 1024 {
                    break;
                }
                let Ok(message) = serde_json::from_str::<Value>(&line) else { continue };
                let method = message.get("method").and_then(Value::as_str);
                match (message.get("id").filter(|v| !v.is_null()), method) {
                    // Server-to-client requests are not supported.
                    (Some(rid), Some(_)) => {
                        let reply = json!({"id": rid, "error": {"code": -32601, "message": "Unsupported method"}});
                        let _ = Codex::send(&reader_stdin, &reply).await;
                    }
                    (Some(rid), None) => {
                        let Some(rid) = rid.as_u64() else { continue };
                        if let Some(tx) = reader_pending.lock().unwrap().remove(&rid) {
                            let result = match message.get("error") {
                                Some(err) if !err.is_null() => Err(err
                                    .get("message")
                                    .and_then(Value::as_str)
                                    .unwrap_or("Codex request failed")
                                    .to_string()),
                                _ => Ok(message.get("result").cloned().unwrap_or(Value::Null)),
                            };
                            let _ = tx.send(result);
                        }
                    }
                    (None, Some("account/rateLimits/updated" | "account/updated")) => events(CodexEvent::Updated),
                    _ => {}
                }
            }
            reader_pending.lock().unwrap().clear();
            // Only report disconnects of the current, non-stopped child.
            if generation.load(Ordering::SeqCst) == id {
                events(CodexEvent::Disconnected);
            }
        });

        let conn = Conn { child, stdin, pending, id };
        self.request(
            &conn,
            "initialize",
            json!({"clientInfo": {"name": "koodex", "title": "Koodex", "version": env!("CARGO_PKG_VERSION")}, "capabilities": null}),
        )
        .await?;
        Self::send(&conn.stdin, &json!({"method": "initialized"})).await?;
        Ok(conn)
    }

    pub async fn read(&self) -> Result<Usage, String> {
        let mut guard = self.conn.lock().await;
        if guard.as_mut().map_or(true, |c| c.child.try_wait().ok().flatten().is_some()) {
            if let Some(old) = guard.take() {
                self.kill(old).await;
            }
            *guard = Some(self.start().await?);
        }
        let conn = guard.as_ref().unwrap();
        let result = async {
            let account = self.request(conn, "account/read", json!({"refreshToken": false})).await?;
            if account.get("account").map_or(true, Value::is_null)
                && account.get("requiresOpenaiAuth").and_then(Value::as_bool) == Some(true)
            {
                return Err("Sign in to Codex first".to_string());
            }
            let limits = self.request(conn, "account/rateLimits/read", json!({})).await?;
            adapt(&limits, now_ms())
        }
        .await;
        if result.is_err() {
            if let Some(old) = guard.take() {
                self.kill(old).await;
            }
        }
        result
    }

    async fn kill(&self, mut conn: Conn) {
        // Invalidate this generation so its reader does not report a disconnect.
        let _ = self.generation.compare_exchange(conn.id, conn.id + 1_000_000, Ordering::SeqCst, Ordering::SeqCst);
        drop(conn.stdin);
        if tokio::time::timeout(Duration::from_millis(1500), conn.child.wait()).await.is_err() {
            let _ = conn.child.kill().await;
        }
    }

    pub async fn stop(&self) {
        if let Some(conn) = self.conn.lock().await.take() {
            self.kill(conn).await;
        }
    }
}

pub fn adapt(raw: &Value, now: i64) -> Result<Usage, String> {
    let snapshot = raw
        .get("rateLimitsByLimitId")
        .and_then(|m| m.get("codex"))
        .filter(|v| v.is_object())
        .or_else(|| raw.get("rateLimits").filter(|v| v.is_object()))
        .ok_or("Unsupported Codex usage response")?;
    let mut windows = Vec::new();
    for slot in ["primary", "secondary"] {
        let Some(w) = snapshot.get(slot).filter(|v| v.is_object()) else { continue };
        let minutes = w.get("windowDurationMins").and_then(Value::as_f64);
        let id = match minutes {
            Some(m) if m == 300.0 => "five-hour",
            Some(m) if m == 10080.0 => "weekly",
            _ => slot,
        };
        let label = match (id, minutes) {
            ("five-hour", _) => "5-hour".to_string(),
            ("weekly", _) => "Weekly".to_string(),
            (_, Some(m)) => format!("{}-hour", m / 60.0),
            _ => format!("{} limit", if slot == "primary" { "Primary" } else { "Secondary" }),
        };
        let resets = w.get("resetsAt").and_then(Value::as_f64).map(|s| (s * 1000.0) as i64);
        windows.push(UsageWindow::new(id, &label, w.get("usedPercent").and_then(Value::as_f64), resets, minutes));
    }
    let credits = snapshot
        .get("credits")
        .and_then(|c| c.get("balance"))
        .and_then(Value::as_str)
        .and_then(|b| b.trim().parse::<f64>().ok())
        .filter(|n| n.is_finite());
    Ok(Usage {
        windows,
        plan_type: snapshot.get("planType").and_then(Value::as_str).map(String::from),
        credits,
        fetched_at: now,
    })
}

pub fn explain(error: &str) -> String {
    let lower = error.to_ascii_lowercase();
    if lower.contains("not found") {
        "Codex not found. Install the Codex CLI, then restart Koodex.".into()
    } else if ["sign in", "not logged", "unauthoriz", "authentication", "401"].iter().any(|k| lower.contains(k)) {
        "Sign in to Codex first. Run codex login in your terminal.".into()
    } else {
        "Unable to read Codex usage. Retrying automatically.".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn adapts_codex_bucket() {
        let raw = json!({
            "rateLimits": {"primary": {"usedPercent": 1, "windowDurationMins": 60, "resetsAt": 1}},
            "rateLimitsByLimitId": {"codex": {
                "primary": {"usedPercent": 30, "windowDurationMins": 300, "resetsAt": 100},
                "secondary": {"usedPercent": 140, "windowDurationMins": 10080, "resetsAt": null},
                "planType": "plus", "credits": {"balance": " 5 "}
            }}
        });
        let u = adapt(&raw, 7).unwrap();
        assert_eq!(u.windows[0].id, "five-hour");
        assert_eq!(u.windows[0].resets_at, Some(100_000));
        assert_eq!(u.windows[1].remaining_percent, Some(0.0));
        assert_eq!(u.credits, Some(5.0));
        assert!(adapt(&json!({}), 0).is_err());
    }
    #[test]
    fn explains_errors() {
        assert!(explain("Codex not found").contains("Install"));
        assert!(explain("Sign in to Codex first").contains("codex login"));
    }
}
