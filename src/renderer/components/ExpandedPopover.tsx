import { providerName, type Snapshot } from "../../shared/types";
import { age } from "../../shared/format";
import { UsageWindow } from "./UsageWindow";
import { SyncStatus } from "./SyncStatus";
import { ConnectionDiagnostic } from "./ConnectionDiagnostic";
import { ProviderSwitch, type ProviderView } from "./ProviderSwitch";
import { ProviderLogo } from "./ProviderLogo";
import { RefreshIcon } from "./Icons";

const plan = (state: Snapshot) => {
  const p = state.usage?.planType;
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : "";
};

function ProviderCard({
  state,
  now,
  refresh,
}: {
  state: Snapshot;
  now: number;
  refresh: () => Promise<void>;
}) {
  const name = providerName(state.provider);
  return (
    <section className="provider-card-usage" aria-label={`${name} usage`}>
      <header className="provider-card-head">
        <ProviderLogo provider={state.provider} size={15} />
        <h2>{name}</h2>
        {plan(state) && <span className="plan-chip">{plan(state)}</span>}
        <SyncStatus state={state} now={now} compact />
      </header>
      <div className="quotas quotas-compact">
        {state.usage?.windows.map((quota) => (
          <UsageWindow key={quota.id} quota={quota} now={now} state={state} compact />
        ))}
      </div>
      {state.syncState === "connecting" && !state.usage && (
        <p className="empty">Connecting&hellip;</p>
      )}
      <ConnectionDiagnostic state={state} refresh={refresh} />
    </section>
  );
}

export function ExpandedPopover({
  shown,
  view,
  now,
  refresh,
}: {
  shown: Snapshot[];
  view: ProviderView;
  now: number;
  refresh: () => Promise<void>;
}) {
  const state = shown[0] ?? { provider: "codex", usage: null, syncState: "connecting" };
  const both = shown.length > 1;
  const busy = shown.every(
    (s) => s.syncState === "connecting" || s.syncState === "refreshing",
  );
  const newest = Math.max(0, ...shown.map((s) => s.usage?.fetchedAt ?? 0));
  const name = providerName(state.provider);
  return (
    <main className={`panel usage-panel ${both ? "usage-panel-both" : ""}`}>
      <header>
        <ProviderSwitch value={view} compact />
        <button
          className="icon-button"
          aria-label="Settings"
          title="Settings"
          onClick={() => void window.Koodex.openSettings()}
        >
          &middot;&middot;&middot;
        </button>
      </header>
      {both ? (
        <div className="provider-cards-usage">
          {shown.map((s) => (
            <ProviderCard key={s.provider} state={s} now={now} refresh={refresh} />
          ))}
        </div>
      ) : (
        <section className="provider-usage" aria-label={`${name} usage`}>
          <SyncStatus state={state} now={now} />
          <div className="quotas">
            {state.usage?.windows.map((quota) => (
              <UsageWindow key={quota.id} quota={quota} now={now} state={state} />
            ))}
          </div>
          {state.syncState === "connecting" && !state.usage && (
            <p className="empty">Connecting to {name}&hellip;</p>
          )}
          <ConnectionDiagnostic state={state} refresh={refresh} />
        </section>
      )}
      <footer>
        <span>
          {both
            ? newest
              ? `Updated ${age(newest, now)}`
              : "Reads your local sign-ins"
            : state.usage
              ? `${plan(state) ? `${plan(state)} plan · ` : ""}Updated ${age(state.usage.fetchedAt, now)}`
              : `Reads your local ${name} sign-in`}
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
