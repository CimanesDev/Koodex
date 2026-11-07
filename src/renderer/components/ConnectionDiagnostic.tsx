import { useState } from "react";
import { providerName, type Snapshot } from "../../shared/types";
import { connectionDiagnostic } from "../../shared/insights";
export function ConnectionDiagnostic({
  state,
  refresh,
}: {
  state: Snapshot;
  refresh: () => Promise<void>;
}) {
  const diagnostic = connectionDiagnostic(state);
  const [busy, setBusy] = useState(false);
  if (!diagnostic) return null;
  return (
    <aside
      className="connection-diagnostic"
      aria-label={`${providerName(state.provider)} connection diagnostics`}
    >
      <strong>{diagnostic.title}</strong>
      <p>{diagnostic.detail}</p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await refresh();
          } finally {
            setTimeout(() => setBusy(false), 800);
          }
        }}
      >
        {busy ? "Retrying…" : "Retry now"}
      </button>
    </aside>
  );
}
