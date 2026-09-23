import { useState } from "react";
import type { Snapshot } from "../../shared/types";
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
  const [message, setMessage] = useState("");
  if (!diagnostic) return null;
  return (
    <aside
      className="connection-diagnostic"
      aria-label={`${state.provider === "claude" ? "Claude Code" : "Codex"} connection diagnostics`}
    >
      <strong>{diagnostic.title}</strong>
      <p>{diagnostic.detail}</p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            if (diagnostic.action === "reconnect")
              setMessage(await window.Koodex.prepareClaudeBridge());
            await refresh();
          } catch (error) {
            setMessage(
              String(error).replace(
                /^Error: (Error invoking remote method [^:]+: Error: )?/,
                "",
              ),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Trying..."
          : diagnostic.action === "reconnect"
            ? "Reconnect Claude Code"
            : "Retry connection"}
      </button>
      {message && <p role="status">{message}</p>}
    </aside>
  );
}
