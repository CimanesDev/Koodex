import type { Snapshot } from "../../shared/types";
import { age } from "../../shared/format";
import { UsageWindow } from "./UsageWindow";
import { SyncStatus } from "./SyncStatus";
export function ExpandedPopover({
  state,
  now,
  refresh,
}: {
  state: Snapshot;
  now: number;
  refresh: () => Promise<void>;
}) {
  const provider = state.provider === "claude" ? "Claude Code" : "Codex";
  return (
    <main className="panel">
      <header>
        <h1>Koodex · {provider}</h1>
        <button
          className="icon-button"
          aria-label="Settings"
          onClick={() => void window.Koodex.openSettings()}
        >
          ···
        </button>
      </header>
      <SyncStatus state={state} now={now} />
      <div className="quotas">
        {state.usage?.windows.length ? (
          state.usage.windows.map((w) => (
            <UsageWindow key={w.id} quota={w} now={now} />
          ))
        ) : (
          <div className="empty">
            <h2>
              {state.syncState === "connecting"
                ? "A moment, quietly."
                : state.error?.startsWith("Codex not found")
                  ? "Codex not found"
                  : state.error?.startsWith("Sign in")
                    ? "Sign in to Codex first"
                    : state.error
                      ? `Unable to read ${provider} usage`
                      : "No usage limits available"}
            </h2>
            <p>
              {state.error ??
                (state.syncState === "connecting"
                  ? `Connecting to your local ${provider} installation.`
                  : "Your account did not report a usage window.")}
            </p>
          </div>
        )}
      </div>
      {state.error && !!state.usage?.windows.length && (
        <p className="error-hint">{state.error}</p>
      )}
      <footer>
        <span>
          {state.usage
            ? `Updated ${age(state.usage.fetchedAt, now)}`
            : `Local to your ${provider} installation`}
        </span>
        <button
          className="icon-button refresh"
          disabled={
            state.syncState === "refreshing" || state.syncState === "connecting"
          }
          aria-label="Refresh usage"
          title="Refresh usage"
          onClick={() => void refresh()}
        >
          ↻
        </button>
      </footer>
    </main>
  );
}
