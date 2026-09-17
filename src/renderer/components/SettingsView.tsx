import { useEffect, useRef, useState } from "react";
import type { Settings, Snapshot } from "../../shared/types";
import { pillSize } from "../../shared/pill";
import { CompactPill } from "./CompactPill";
import { BrandMark, TraySymbol } from "./Icons";

const colors = [
  ["neutral", "Neutral", "#eeeeee"],
  ["blue", "Blue", "#8bbcff"],
  ["mint", "Mint", "#8ed8b8"],
  ["lavender", "Lavender", "#bca5ee"],
  ["rose", "Rose", "#e5a4b8"],
] as const;
const placements = [
  ["free", "Free position"],
  ["top-left", "Top left"],
  ["top-center", "Top center"],
  ["top-right", "Top right"],
  ["left", "Left side · vertical"],
  ["right", "Right side · vertical"],
] as const;
export function SettingsView({
  settings: incomingSettings,
  now,
}: {
  settings: Settings;
  now: number;
}) {
  const [settings, setSettings] = useState(incomingSettings);
  const pending = useRef(0);
  useEffect(() => {
    if (pending.current === 0) setSettings(incomingSettings);
  }, [incomingSettings]);
  const [tab, setTab] = useState("pill");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [claudeConfig, setClaudeConfig] = useState("");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const sample = useRef<Snapshot>({
    syncState: "synced",
    usage: {
      fetchedAt: now,
      windows: [
        {
          id: "five-hour",
          label: "5-hour",
          remainingPercent: 68,
          usedPercent: 32,
          windowMinutes: 300,
          resetsAt: now + 138 * 60000,
        },
        {
          id: "weekly",
          label: "Weekly",
          remainingPercent: 42,
          usedPercent: 58,
          windowMinutes: 10080,
          resetsAt: now + 86 * 3600000,
        },
      ],
    },
  });
  useEffect(() => () => clearTimeout(refreshTimer.current), []);
  async function update(patch: Partial<Settings>) {
    pending.current++;
    setSettings((previous) => ({ ...previous, ...patch }));
    setSaving(true);
    try {
      const saved = await window.Koodex.updateSettings(patch);
      if (pending.current === 1) setSettings(saved);
      setError("");
    } catch (e) {
      setSettings(await window.Koodex.getSettings());
      setError(
        String(e).includes("packaged app")
          ? "Startup is available in the installed app."
          : "Could not save. Please try again.",
      );
    } finally {
      pending.current--;
      setSaving(pending.current > 0);
    }
  }
  async function done() {
    try {
      if (!settings.setupCompleted) await window.Koodex.finishSetup();
      else await window.Koodex.closeSettings();
    } catch {
      setError("Could not finish setup. Please try again.");
    }
  }
  function toggle(
    key:
      | "floatingPillEnabled"
      | "pillShowReset"
      | "pillShowRefresh"
      | "launchAtStartup"
      | "notificationsEnabled"
      | "pillShowDragHandle",
    label: string,
    description: string,
    disabled = false,
  ) {
    return (
      <label className="preference-row">
        <span>
          <strong>{label}</strong>
          <small>{description}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={settings[key]}
          disabled={disabled}
          onChange={(e) => void update({ [key]: e.target.checked })}
        />
      </label>
    );
  }
  const size = pillSize(settings);
  const previewScale = Math.min(1, 100 / size.height);
  return (
    <main className="preferences-shell">
      <header className="preferences-header">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <h1>
              {settings.setupCompleted ? "Make it yours" : "Welcome to Koodex"}
            </h1>
            <p>
              {settings.setupCompleted
                ? "Small details. Your way."
                : "A little less checking. A little more focus."}
            </p>
          </div>
        </div>
        <button
          className="icon-button"
          aria-label="Close settings"
          onClick={() => void window.Koodex.closeSettings()}
        >
          ×
        </button>
      </header>
      <section className="preview-stage" aria-label="Pill preview">
        <div className="preview-caption">
          <span>YOUR FLOATING PILL</span>
          <span>Sample values · click to try</span>
        </div>
        <div
          className="preview-pill-wrap"
          style={{
            width: size.width * previewScale,
            height: size.height * previewScale,
          }}
        >
          <div
            style={{
              width: size.width,
              height: size.height,
              transform: `scale(${previewScale})`,
              transformOrigin: "top left",
            }}
          >
            <CompactPill
              state={{
                ...sample.current,
                syncState: refreshing ? "refreshing" : "synced",
              }}
              paused={false}
              settings={settings}
              now={now}
              preview
              refresh={async () => {
                setRefreshing(true);
                refreshTimer.current = setTimeout(
                  () => setRefreshing(false),
                  600,
                );
              }}
            />
          </div>
        </div>
        <p>
          {settings.pillLayout === "both"
            ? "Both limits, always in view."
            : settings.pillSwitchSeconds === 0
              ? "One limit at a time. Left-click to switch."
              : `Switches every ${settings.pillSwitchSeconds} seconds. Click any time.`}
        </p>
      </section>
      <nav className="preferences-tabs" aria-label="Settings sections">
        {[
          ["pill", "Floating pill"],
          ["appearance", "Appearance"],
          ["placement", "Placement"],
          ["providers", "Providers"],
          ["general", "General"],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="preferences-content">
        {tab === "pill" && (
          <div className="preferences-grid">
            <section>
              <h2>What you see</h2>
              <div
                className="choice-grid"
                role="group"
                aria-label="Pill display"
              >
                {[
                  ["alternating", "One limit", "Click to switch"],
                  ["both", "Both limits", "Side by side"],
                ].map(([id, label, description]) => (
                  <button
                    className="choice-card"
                    key={id}
                    aria-pressed={settings.pillLayout === id}
                    onClick={() =>
                      void update({ pillLayout: id as Settings["pillLayout"] })
                    }
                  >
                    <span
                      className={`layout-symbol layout-${id}`}
                      aria-hidden="true"
                    >
                      <i />
                      {id === "both" && <i />}
                    </span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </button>
                ))}
              </div>
              <div
                className="content-choices"
                role="group"
                aria-label="Pill contents"
              >
                <button
                  aria-pressed={settings.pillContent === "details"}
                  onClick={() => void update({ pillContent: "details" })}
                >
                  Text + indicator
                </button>
                <button
                  aria-pressed={settings.pillContent === "indicator"}
                  onClick={() => void update({ pillContent: "indicator" })}
                >
                  Indicator only
                </button>
              </div>
              {settings.pillLayout === "alternating" && (
                <label className="select-row">
                  <span>Switch limits</span>
                  <select
                    aria-label="Switch limits"
                    value={settings.pillSwitchSeconds}
                    onChange={(e) =>
                      void update({
                        pillSwitchSeconds: Number(
                          e.target.value,
                        ) as Settings["pillSwitchSeconds"],
                      })
                    }
                  >
                    <option value="0">Only when I click</option>
                    <option value="2">Every 2 seconds</option>
                    <option value="3">Every 3 seconds</option>
                    <option value="5">Every 5 seconds</option>
                  </select>
                </label>
              )}
              {settings.pillLayout === "both" && (
                <label className="select-row">
                  <span>Both limits style</span>
                  <select
                    aria-label="Both limits style"
                    value={settings.pillBothStyle}
                    onChange={(e) =>
                      void update({
                        pillBothStyle: e.target
                          .value as Settings["pillBothStyle"],
                      })
                    }
                  >
                    <option value="separate">Separate indicators</option>
                    <option value="combined">
                      {settings.pillIndicator === "ring"
                        ? "Outer + inner ring"
                        : "Stacked bars (=)"}
                    </option>
                  </select>
                </label>
              )}
              <p className="preference-note">
                {settings.pillContent === "indicator"
                  ? "Hover for percentages and reset times. Click to switch limits."
                  : "Right-click the pill for settings or usage details."}
              </p>
            </section>
            <section>
              <h2>The useful extras</h2>
              {toggle(
                "floatingPillEnabled",
                "Show floating pill",
                "Keep usage above your other windows.",
              )}
              {toggle(
                "pillShowReset",
                "Reset countdown",
                "See when each limit resets.",
                settings.pillContent === "indicator",
              )}
              {toggle(
                "pillShowRefresh",
                "Quick refresh",
                "Add a refresh button to the pill.",
              )}
            </section>
          </div>
        )}
        {tab === "appearance" && (
          <div className="preferences-grid">
            <section>
              <h2>Progress style</h2>
              <div
                className="choice-grid"
                role="group"
                aria-label="Progress style"
              >
                {[
                  ["ring", "Ring"],
                  ["bar", "Bar below text"],
                ].map(([id, label]) => (
                  <button
                    className="choice-card"
                    key={id}
                    aria-pressed={settings.pillIndicator === id}
                    onClick={() =>
                      void update({
                        pillIndicator: id as Settings["pillIndicator"],
                      })
                    }
                  >
                    <span
                      className={`indicator-example indicator-${id}`}
                      aria-hidden="true"
                    />
                    <strong>{label}</strong>
                  </button>
                ))}
              </div>
              <h2 className="section-gap">Accent color</h2>
              <div
                className="color-choices"
                role="group"
                aria-label="Accent color"
              >
                {colors.map(([id, label, color]) => (
                  <button
                    key={id}
                    className="color-choice"
                    aria-label={label}
                    title={label}
                    aria-pressed={settings.accentColor === id}
                    style={{ "--swatch": color } as React.CSSProperties}
                    onClick={() => void update({ accentColor: id })}
                  >
                    <span />
                  </button>
                ))}
              </div>
              <p className="preference-note">
                Low limits still turn amber or red.
              </p>
            </section>
            <section>
              <h2>System tray icon</h2>
              <div
                className="tray-choices"
                role="group"
                aria-label="System tray icon"
              >
                {[
                  ["meter", "Usage meter", "Top: 5-hour. Bottom: weekly."],
                  ["logo", "Koodex mark", "A simple, static ring."],
                  ["ring", "Usage ring", "Outer: 5-hour. Inner: weekly."],
                ].map(([id, label, description]) => (
                  <button
                    key={id}
                    className="tray-choice"
                    aria-pressed={settings.trayStyle === id}
                    onClick={() =>
                      void update({ trayStyle: id as Settings["trayStyle"] })
                    }
                  >
                    <TraySymbol style={id as Settings["trayStyle"]} />
                    <span>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </span>
                    <span className="choice-check" aria-hidden="true">
                      {settings.trayStyle === id ? "✓" : ""}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
        {tab === "placement" && (
          <div className="preferences-grid">
            <section>
              <h2>Where it lives</h2>
              <div
                className="screen-preview"
                data-placement={settings.pillPlacement}
                aria-label="Screen position preview"
              >
                <div
                  className={`screen-pill screen-pill-${settings.pillPlacement}`}
                  aria-hidden="true"
                />
                {placements.map(([id, label]) => (
                  <button
                    key={id}
                    className={`screen-anchor anchor-${id}`}
                    aria-label={`Place at ${label}`}
                    aria-pressed={settings.pillPlacement === id}
                    onClick={() => void update({ pillPlacement: id })}
                  >
                    <span />
                  </button>
                ))}
              </div>
              <p className="preference-note">
                Pinned positions follow the usable screen edges. Side positions
                use a vertical layout.
              </p>
            </section>
            <section>
              <h2>Position & movement</h2>
              <label className="select-row">
                <span>Placement</span>
                <select
                  aria-label="Placement"
                  value={settings.pillPlacement}
                  onChange={(e) =>
                    void update({
                      pillPlacement: e.target
                        .value as Settings["pillPlacement"],
                    })
                  }
                >
                  {placements.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {toggle(
                "pillShowDragHandle",
                "Show drag grip",
                settings.pillPlacement === "free"
                  ? "Hide it to lock your current free position."
                  : "Pinned positions hide the grip automatically.",
                settings.pillPlacement !== "free",
              )}
              <p className="preference-note">
                Your free position is remembered when you pin the pill. Pins use
                the monitor where you last placed it.
              </p>
            </section>
          </div>
        )}
        {tab === "providers" && (
          <div className="preferences-grid">
            <section>
              <h2>Your usage source</h2>
              <label className="select-row">
                <span>Provider</span>
                <select
                  aria-label="Provider"
                  value={settings.provider}
                  onChange={(e) =>
                    void update({
                      provider: e.target.value as Settings["provider"],
                    })
                  }
                >
                  <option value="codex">Codex</option>
                  <option value="claude">Claude Code (bridge)</option>
                </select>
              </label>
              <p className="preference-note">
                One provider at a time. Your tray, pill and usage details follow
                this choice.
              </p>
              <h2 className="section-gap">Cursor & other providers</h2>
              <p className="preference-note">
                Not connected in this version. Cursor's documented team usage
                API is hourly, so it cannot supply live personal quotas here.
              </p>
            </section>
            <section>
              <h2>
                {settings.provider === "codex"
                  ? "Codex"
                  : "Connect Claude Code"}
              </h2>
              {settings.provider === "codex" ? (
                <p className="preference-note">
                  Uses your signed-in Codex CLI. Usage events update
                  immediately; background checks follow your General refresh
                  setting. The service may report usage with a delay.
                </p>
              ) : (
                <>
                  <p className="preference-note">
                    Requires Node.js on PATH and Claude Code 2.1.251+ with
                    Pro/Max quota data. Reports arrive after Claude responses;
                    idle data is marked as saved after a minute.
                  </p>
                  <button
                    className="bridge-button"
                    onClick={async () => {
                      try {
                        setClaudeConfig(
                          await window.Koodex.prepareClaudeBridge(),
                        );
                        setError("");
                      } catch {
                        setError(
                          "Could not prepare the Claude bridge. Please try again.",
                        );
                      }
                    }}
                  >
                    Prepare Claude bridge
                  </button>
                  {claudeConfig && (
                    <>
                      <p className="preference-note">
                        Merge this entry into ~/.claude/settings.json. It
                        replaces your status line; keep a backup if you already
                        have one. Koodex has not edited your Claude settings.
                      </p>
                      <textarea
                        className="bridge-config"
                        aria-label="Claude status-line configuration"
                        readOnly
                        value={claudeConfig}
                        onFocus={(e) => e.target.select()}
                      />
                    </>
                  )}
                  <p className="preference-note">
                    Only quota percentages and reset times are saved. Refresh
                    rereads the latest local report; it does not fetch a new
                    Claude quota.
                  </p>
                </>
              )}
            </section>
          </div>
        )}
        {tab === "general" && (
          <div className="preferences-grid">
            <section>
              <h2>Quiet by default</h2>
              {toggle(
                "launchAtStartup",
                "Launch at startup",
                "Start quietly when you sign in to Windows.",
              )}
              {toggle(
                "notificationsEnabled",
                "Low usage alerts",
                "Notify at 25%, 10%, and 5% remaining.",
              )}
            </section>
            <section>
              <h2>Stay up to date</h2>
              <label className="select-row">
                <span>Refresh interval</span>
                <select
                  aria-label="Refresh interval"
                  value={settings.refreshIntervalSeconds}
                  onChange={(e) =>
                    void update({
                      refreshIntervalSeconds: Number(
                        e.target.value,
                      ) as Settings["refreshIntervalSeconds"],
                    })
                  }
                >
                  <option value="10">Live · every 10 seconds</option>
                  <option value="30">30 seconds</option>
                  <option value="60">1 minute</option>
                  <option value="300">5 minutes</option>
                </select>
              </label>
              <p className="preference-note">
                Codex usage events update immediately; polling checks other
                sessions. Service reporting can lag. Claude follows its local
                status-line reports. Refresh never resets a quota.
              </p>
              <div className="privacy-note">
                <BrandMark />
                <p>
                  Uses your local{" "}
                  {settings.provider === "claude"
                    ? "Claude Code bridge"
                    : "Codex"}
                  .
                  <br />
                  No Koodex account. No telemetry.
                </p>
              </div>
            </section>
          </div>
        )}
      </div>
      <footer className="preferences-footer">
        <span>
          {error ? (
            <span role="alert" className="save-error">
              {error}
            </span>
          ) : saving ? (
            "Saving…"
          ) : settings.setupCompleted ? (
            "Changes saved automatically"
          ) : (
            "Choose your preferences. Change them any time."
          )}
        </span>
        <button
          className="primary-button"
          disabled={saving}
          onClick={() => void done()}
        >
          {settings.setupCompleted ? "Done" : "Start Koodex"}{" "}
          <span aria-hidden="true">↗</span>
        </button>
      </footer>
    </main>
  );
}
