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
    now - fetched > 600000 ||
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
): { title: string; detail: string } | null {
  if (state.syncState === "connecting" || state.syncState === "refreshing")
    return null;
  const error = state.error || "";
  if (state.provider === "claude") {
    if (/sign in|sign-in|log ?in|claude \/login/i.test(error))
      return {
        title: state.usage
          ? "Claude sign-in needs attention · showing last usage"
          : "Sign in to Claude Code",
        detail: error,
      };
  } else {
    if (/Codex not found/i.test(error))
      return {
        title: "Codex CLI not found",
        detail:
          "Install the Codex CLI or add its executable directory to PATH, then retry.",
      };
    if (/sign in|unauthoriz|authentication|401/i.test(error))
      return {
        title: "Codex sign-in required",
        detail:
          "Run codex login in your terminal, finish signing in, then retry here.",
      };
  }
  if (
    state.syncState === "offline" ||
    state.syncState === "stale" ||
    state.syncState === "error"
  )
    return {
      title: state.usage ? "Showing last known usage" : "Unable to connect",
      detail:
        error ||
        "Check your connection, then retry. Koodex also retries automatically.",
    };
  if (!state.usage?.windows.length)
    return {
      title: "No usage limits reported",
      detail:
        "This account did not return subscription limits. Check that you are signed in with the intended Pro, Max, Plus or Pro account.",
    };
  return null;
}
