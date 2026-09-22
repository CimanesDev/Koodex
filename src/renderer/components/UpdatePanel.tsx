import { useEffect, useState } from "react";
import type { UpdateState } from "../../shared/types";

export function UpdatePanel() {
  const [state, setState] = useState<UpdateState>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let received = false;
    const unsubscribe = window.Koodex.onUpdateState((value) => {
      received = true;
      setState(value);
    });
    window.Koodex.getUpdateState()
      .then((value) => {
        if (active && !received) setState(value);
      })
      .catch(() => {
        if (active)
          setError(
            "Could not load update status. Reopen Settings to try again.",
          );
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch {
      setError("That action could not finish. Please try again.");
    }
  }
  const status = state?.status;
  const message =
    status === "checking"
      ? "Checking for updates..."
      : status === "current"
        ? "You're up to date."
        : status === "available"
          ? `Version ${state?.version} is available.`
          : status === "downloading"
            ? `Downloading update: ${state?.percent ?? 0}%`
            : status === "ready"
              ? `Version ${state?.version} is ready. Restart to finish updating.`
              : status === "installing"
                ? "Restarting to install the update..."
                : state?.message ||
                  "Checks automatically. You choose when to download and restart.";
  const busy =
    !state ||
    status === "checking" ||
    status === "downloading" ||
    status === "installing";
  return (
    <section className="update-panel" aria-label="App updates">
      <div className="update-heading">
        <h2>App updates</h2>
        {state && <span>Version {state.currentVersion}</span>}
      </div>
      <p className="preference-note" role="status">
        {message}
      </p>
      {status === "downloading" && (
        <progress
          className="update-progress"
          aria-label="Update download progress"
          max="100"
          value={state?.percent ?? 0}
        />
      )}
      <div className="update-actions">
        {status !== "disabled" && (
          <button
            className="bridge-button"
            disabled={busy}
            onClick={() =>
              void run(
                status === "ready"
                  ? () => window.Koodex.installUpdate()
                  : status === "available" ||
                      (status === "error" && state?.failedAction === "download")
                    ? () => window.Koodex.downloadUpdate()
                    : () => window.Koodex.checkForUpdates(),
              )
            }
          >
            {status === "ready"
              ? "Restart and install"
              : status === "available"
                ? "Download update"
                : status === "error"
                  ? "Try again"
                  : status === "downloading"
                    ? "Downloading..."
                    : "Check for updates"}
          </button>
        )}
        <button
          className="bridge-button"
          onClick={() => void run(() => window.Koodex.openReleases())}
        >
          View releases
        </button>
      </div>
      {status !== "disabled" && (
        <p className="preference-note">
          Your preferences stay in place. Updates install only when you choose
          Restart and install.
        </p>
      )}
      {error && (
        <p className="save-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
