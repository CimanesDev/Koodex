import { age } from "../../shared/format";
import type { Snapshot } from "../../shared/types";
export function SyncStatus({ state, now }: { state: Snapshot; now: number }) {
  const status = state.syncState;
  const provider = state.provider === "claude" ? "Claude Code" : "Codex";
  const text =
    status === "synced" && state.usage
      ? `Synced ${age(state.usage!.fetchedAt, now)}`
      : status === "refreshing"
        ? "Updating…"
        : status === "connecting"
          ? `Connecting to ${provider}…`
          : state.usage
            ? `Last updated ${age(state.usage.fetchedAt, now)}`
            : `${provider} unavailable`;
  return (
    <p className="sync" role="status">
      <span
        className={`status-dot ${status === "synced" ? "connected" : ""}`}
      />
      {text}
    </p>
  );
}
