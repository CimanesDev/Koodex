import { providerName, type Snapshot } from "../../shared/types";
import { age } from "../../shared/format";
import { UsageWindow } from "./UsageWindow";
import { SyncStatus } from "./SyncStatus";
import { ConnectionDiagnostic } from "./ConnectionDiagnostic";
import { ProviderSwitch } from "./ProviderSwitch";
import { RefreshIcon } from "./Icons";

function planLabel(state: Snapshot) {
  const plan = state.usage?.planType;
  if (!plan) return "";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function ExpandedPopover({
  state,
  now,
  refresh,
}: {
  state: Snapshot;
  now: number;
  refresh: () => Promise<void>;
}) {
  const provider = providerName(state.provider);
  const plan = planLabel(state);
  const busy =
    state.syncState === "connecting" || state.syncState === "refreshing";
  return (
    <main className="panel usage-panel">
      <header>
        <ProviderSwitch value={state.provider ?? "codex"} compact />
        <button
          className="icon-button"
          aria-label="Settings"
          title="Settings"
          onClick={() => void window.Koodex.openSettings()}
        >
          &middot;&middot;&middot;
        </button>
      </header>
      <section className="provider-usage" aria-label={`${provider} usage`}>
        <SyncStatus state={state} now={now} />
        <div className="quotas">
          {state.usage?.windows.map((quota) => (
            <UsageWindow key={quota.id} quota={quota} now={now} state={state} />
          ))}
        </div>
        {state.syncState === "connecting" && !state.usage && (
          <p className="empty">Connecting to {provider}&hellip;</p>
        )}
        <ConnectionDiagnostic state={state} refresh={refresh} />
      </section>
      <footer>
        <span>
          {state.usage
            ? `${plan ? `${plan} plan · ` : ""}Updated ${age(state.usage.fetchedAt, now)}`
            : `Reads your local ${provider} sign-in`}
        </span>
        <button
          className={`icon-button refresh ${busy ? "spinning" : ""}`}
          aria-label="Refresh usage"
          title="Refresh usage"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshIcon />
        </button>
      </footer>
    </main>
  );
}
