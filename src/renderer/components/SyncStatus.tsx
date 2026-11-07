import { age } from "../../shared/format";
import { providerName, type Snapshot } from "../../shared/types";
export function SyncStatus({
  state,
  now,
  compact = false,
}: {
  state: Snapshot;
  now: number;
  compact?: boolean;
}) {
  const status = state.syncState;
  const provider = providerName(state.provider);
  const text = compact
    ? status === "synced" && state.usage
      ? age(state.usage.fetchedAt, now)
      : status === "refreshing"
        ? "Updating…"
        : status === "connecting"
          ? "Connecting…"
          : state.usage
            ? `Saved · ${age(state.usage.fetchedAt, now)}`
            : "Unavailable"
    : status === "synced" && state.usage
      ? `Synced ${age(state.usage.fetchedAt, now)}`
      : status === "refreshing"
        ? "Updating…"
        : status === "connecting"
          ? `Connecting to ${provider}…`
          : state.usage
            ? `Last updated ${age(state.usage.fetchedAt, now)}`
            : `${provider} unavailable`;
  return (
    <p className={`sync ${compact ? "sync-compact" : ""}`} role="status">
      <span
        className={`status-dot ${status === "synced" ? "connected" : ""}`}
      />
      {text}
    </p>
  );
}
