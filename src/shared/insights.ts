import type { Snapshot, UsageWindow } from "./types";

export function paceEstimate(
  quota: UsageWindow,
  state: Snapshot,
  now: number,
): string | null {
  const fetched = state.usage?.fetchedAt;
  const duration = (quota.windowMinutes ?? 0) * 60000;
  const used = quota.usedPercent;
  const reset = quota.resetsAt;
  if (
    state.syncState !== "synced" ||
    !fetched ||
    !Number.isFinite(fetched) ||
    now < fetched ||
    now - fetched > (state.provider === "claude" ? 60000 : 600000) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    reset === null ||
    !Number.isFinite(reset) ||
    reset <= now ||
    used === null ||
    !Number.isFinite(used) ||
    used <= 0 ||
    used >= 100 ||
    quota.remainingPercent === null
  )
    return null;
  const elapsed = fetched - (reset - duration);
  // A very young or inconsistent window cannot support a useful average.
  if (elapsed < Math.max(15 * 60000, duration * 0.05) || elapsed >= duration)
    return null;
  const projected = (used * duration) / elapsed;
  if (projected > 100)
    return "Window-average estimate: may run out before reset";
  return `Window-average estimate: ~${Math.round(100 - projected)}% left at reset`;
}

export function connectionDiagnostic(
  state: Snapshot,
): { title: string; detail: string; action: "refresh" | "reconnect" } | null {
  if (state.syncState === "connecting" || state.syncState === "refreshing")
    return null;
  const claude = state.provider === "claude";
  if (claude && state.syncState === "error")
    return {
      title: "Claude connection needs attention",
      detail:
        state.error ||
        "Reconnect the local status-line bridge, then complete a Claude Code response.",
      action: "reconnect",
    };
  if (claude && (state.syncState !== "synced" || !state.usage?.windows.length))
    return {
      title: state.usage?.windows.length
        ? "Waiting for a fresh Claude report"
        : "Waiting for Claude quota data",
      detail:
        state.error ||
        "Complete a response in a supported, signed-in Claude Code session. Refresh only rereads its last local report.",
      action: "reconnect",
    };
  if (/Codex not found/i.test(state.error || ""))
    return {
      title: "Codex CLI not found",
      detail:
        "Install the Codex CLI or add its executable directory to PATH, then restart Koodex.",
      action: "refresh",
    };
  if (/sign in|unauthoriz|authentication|401/i.test(state.error || ""))
    return {
      title: "Codex sign-in required",
      detail:
        "Run codex login in your terminal, finish signing in, then retry here.",
      action: "refresh",
    };
  if (
    state.syncState === "offline" ||
    state.syncState === "stale" ||
    state.syncState === "error"
  )
    return {
      title: state.usage ? "Showing saved usage" : "Unable to connect",
      detail:
        "Check your connection, then retry. Koodex also retries automatically; saved percentages may no longer reflect your allowance.",
      action: "refresh",
    };
  if (!state.usage?.windows.length)
    return {
      title: "No usage limits reported",
      detail:
        "This account did not return subscription quota windows. Check that your CLI is signed in to the intended account, then retry.",
      action: "refresh",
    };
  return null;
}
