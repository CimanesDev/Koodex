import type { Snapshot } from "../../shared/types";
import { age } from "../../shared/format";
import { UsageWindow } from "./UsageWindow";
import { SyncStatus } from "./SyncStatus";
import { ConnectionDiagnostic } from "./ConnectionDiagnostic";
import { RefreshIcon } from "./Icons";
export function ExpandedPopover({
  state,
  now,
  refresh,
}: {
  state: Snapshot;
  now: number;
  refresh: () => Promise<void>;
}) {
  const providers = state.companion
    ? [state, state.companion].sort((a) => (a.provider === "codex" ? -1 : 1))
    : [state];
  const provider = state.provider === "claude" ? "Claude Code" : "Codex";
  return (
    <main className="panel usage-panel">
      <header>
        <h1>Koodex &middot; {state.companion ? "All providers" : provider}</h1>
        <button
          className="icon-button"
          aria-label="Settings"
          onClick={() => void window.Koodex.openSettings()}
        >
          &middot;&middot;&middot;
        </button>
      </header>
      {providers.map((current) => (
        <section
          className="provider-usage"
          key={current.provider || "codex"}
          aria-label={`${current.provider === "claude" ? "Claude Code" : "Codex"} usage`}
        >
          {state.companion && (
            <h2 className="provider-heading">
              {current.provider === "claude" ? "Claude Code" : "Codex"}
            </h2>
          )}
          <SyncStatus state={current} now={now} />
          <div className="quotas">
            {current.usage?.windows.map((quota) => (
              <UsageWindow
                key={quota.id}
                quota={quota}
                now={now}
                state={current}
              />
            ))}
          </div>
          {current.syncState === "connecting" && !current.usage && (
            <p className="empty">
              Connecting to your local installation&hellip;
            </p>
          )}
          <ConnectionDiagnostic state={current} refresh={refresh} />
        </section>
      ))}
      <footer>
        <span>
          {state.companion
            ? "Each provider updates independently"
            : state.usage
              ? `Updated ${age(state.usage.fetchedAt, now)}`
              : `Local to your ${provider} installation`}
        </span>
        <button
          className="icon-button refresh"
          aria-label="Refresh usage"
          title="Refresh usage"
          disabled={providers.every(
            (current) =>
              current.syncState === "connecting" ||
              current.syncState === "refreshing",
          )}
          onClick={() => void refresh()}
        >
          <RefreshIcon />
        </button>
      </footer>
    </main>
  );
}
