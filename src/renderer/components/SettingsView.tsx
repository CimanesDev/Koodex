import { useEffect, useRef, useState } from "react";
import {
  providerName,
  type Settings,
  type Snapshot,
} from "../../shared/types";
import { age } from "../../shared/format";

function providerStatus(state: Snapshot | undefined, active: boolean) {
  if (!state) return "Checking…";
  if ((state.syncState === "synced" || state.syncState === "refreshing") && state.usage)
    return "Connected";
  if (/sign in|sign-in|log ?in/i.test(state.error || ""))
    return "Sign-in needed";
  if (/not found/i.test(state.error || "")) return "Not installed";
  if (state.usage)
    return active
      ? `Last update ${age(state.usage.fetchedAt)}`
      : `Last seen ${age(state.usage.fetchedAt)}`;
  return active ? "Connecting…" : "Not checked yet";
}
import { UpdatePanel } from "./UpdatePanel";
import { ProviderLogo } from "./ProviderLogo";
import { patchFor, viewOf } from "./ProviderSwitch";
import { pillSize } from "../../shared/pill";
import { CompactPill } from "./CompactPill";
import { BrandMark, TraySymbol, PillStyleSymbol } from "./Icons";

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
  state,
  shown,
}: {
  shown: Snapshot[];
  settings: Settings;
  now: number;
  state: Snapshot;
}) {
  const [settings, setSettings] = useState(incomingSettings);
  const pending = useRef(0);
  useEffect(() => {
    if (pending.current === 0) setSettings(incomingSettings);
  }, [incomingSettings]);
  const [tab, setTab] = useState(
    new URLSearchParams(location.search).get("section") === "general"
      ? "general"
      : "pill",
  );
  useEffect(
    () =>
      window.Koodex.onView((view) => {
        if (view === "updates") setTab("general");
      }),
    [],
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [shortcutError, setShortcutError] = useState("");
  useEffect(() => {
    void window.Koodex.getShortcutError().then(setShortcutError);
  }, [incomingSettings.pillShortcut]);
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
          : String(e).replace(
              /^Error: (Error invoking remote method [^:]+: Error: )?/,
              "",
            ),
      );
    } finally {
      pending.current--;
      setSaving(pending.current > 0);
      if (patch.pillShortcut !== undefined)
        void window.Koodex.getShortcutError().then(setShortcutError);
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
      | "showRefreshActivity"
      | "pillShowReset"
      | "pillShowRefresh"
      | "launchAtStartup"
      | "notificationsEnabled"
      | "pillSideHideable"
      | "pillShowDragHandle"
      | "pillShowProvider",
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
  const [providers, setProviders] = useState<Snapshot[]>([]);
  useEffect(() => {
    void window.Koodex.getAllUsage().then(setProviders);
  }, [state]);
  const size = pillSize(settings);
  const previewScale = Math.min(1, 100 / size.height);
  return (
    <main className="preferences-shell">
      <header className="preferences-header" data-tauri-drag-region>
        <div className="brand-lockup" data-tauri-drag-region>
          <BrandMark />
          <div>
            <h1>Koodex</h1>
            <p>
              {settings.setupCompleted
                ? "Your usage, at a glance."
                : "Welcome. Let’s set up your floating pill."}
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
          <span>
            {settings.showBothProviders
              ? "Codex + Claude Code"
              : providerName(settings.provider)}{" "}
            ·{" "}
            {state.syncState === "synced"
              ? "Live usage"
              : state.usage
                ? "Last reported usage"
                : "Waiting for usage"}
          </span>
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
              shown={shown}
              state={
                state.provider && state.provider !== settings.provider
                  ? {
                      usage: null,
                      syncState: "connecting",
                      provider: settings.provider,
                    }
                  : state
              }
              paused={false}
              settings={settings}
              now={now}
              preview
            />
          </div>
        </div>
        <p>
          {settings.showBothProviders
            ? "Codex and Claude Code side by side. Hover either for details."
            : settings.pillLayout === "both"
            ? settings.pillBothStyle === "combined"
              ? settings.pillIndicator === "ring"
                ? "5-hour outside. Weekly inside."
                : settings.pillPlacement === "left" ||
                    settings.pillPlacement === "right"
                  ? "5-hour on the left. Weekly on the right."
                  : "5-hour above. Weekly below."
              : "Both limits, always in view."
            : settings.pillSwitchSeconds === 0
              ? "One limit at a time. Left-click to switch."
              : `Switches every ${settings.pillSwitchSeconds} seconds. Click any time.`}
        </p>
      </section>
      <nav className="preferences-tabs" aria-label="Settings sections">
        {[
          ["pill", "Pill & appearance"],
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
              {settings.showBothProviders && (
                <p className="preference-note">
                  Showing Codex and Claude Code side by side, each with both
                  limits. Contents, progress style and extras still apply.
                </p>
              )}
              <div
                className="choice-grid"
                role="group"
                aria-label="Pill display"
                hidden={settings.showBothProviders}
              >
                {[
                  ["alternating", "One limit", "Click to switch"],
                  ["both", "Both limits", "Always visible"],
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
              {settings.pillLayout === "alternating" && !settings.showBothProviders && (
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
              <h2 className="section-gap">Progress style</h2>
              <div
                className="style-choices"
                role="group"
                aria-label="Progress style"
              >
                {(
                  [
                    [
                      "bar",
                      "separate",
                      settings.pillLayout === "both" ? "Two bars" : "Bar",
                    ],
                    [
                      "ring",
                      "separate",
                      settings.pillLayout === "both" ? "Two rings" : "Ring",
                    ],
                    ...(settings.pillLayout === "both"
                      ? [
                          ["bar", "combined", "Stacked bars"],
                          ["ring", "combined", "Nested rings"],
                        ]
                      : []),
                  ] as const
                ).map(([indicator, bothStyle, label]) => (
                  <button
                    key={label}
                    className="style-choice"
                    aria-label={label}
                    aria-pressed={
                      settings.pillIndicator === indicator &&
                      (settings.pillLayout !== "both" ||
                        settings.pillBothStyle === bothStyle)
                    }
                    onClick={() =>
                      void update({
                        pillIndicator: indicator as Settings["pillIndicator"],
                        pillBothStyle: bothStyle as Settings["pillBothStyle"],
                      })
                    }
                  >
                    <PillStyleSymbol
                      indicator={indicator as Settings["pillIndicator"]}
                      combined={bothStyle === "combined"}
                      both={settings.pillLayout === "both"}
                      vertical={
                        settings.pillPlacement === "left" ||
                        settings.pillPlacement === "right"
                      }
                    />
                    <span>{label}</span>
                    <small>
                      {bothStyle === "combined"
                        ? indicator === "ring"
                          ? "Outer + inner"
                          : settings.pillPlacement === "left" ||
                              settings.pillPlacement === "right"
                            ? "Vertical pair"
                            : "Equal sign"
                        : "Separate indicators"}
                    </small>
                  </button>
                ))}
              </div>
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
              <h2 className="section-gap">Surface & transparency</h2>
              <label className="select-row">
                <span>Pill surface</span>
                <select
                  aria-label="Pill surface"
                  value={settings.pillMaterial}
                  onChange={(e) =>
                    void update({
                      pillMaterial: e.target.value as Settings["pillMaterial"],
                    })
                  }
                >
                  <option value="solid">Solid</option>
                  <option value="glass">Glass</option>
                </select>
              </label>
              <label className="opacity-control">
                <span>
                  Pill opacity <output>{settings.pillOpacity}%</output>
                </span>
                <input
                  aria-label="Pill opacity"
                  type="range"
                  min="35"
                  max="100"
                  step="5"
                  value={settings.pillOpacity}
                  onChange={(e) =>
                    void update({ pillOpacity: Number(e.target.value) })
                  }
                />
              </label>
              <p className="preference-note">
                Hover or focus to bring the pill back to full opacity. Glass
                adds a translucent surface and soft highlights.
              </p>
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
            <section className="tray-section">
              <h2>System tray icon</h2>
              <label className="select-row">
                <span>Icon color</span>
                <select
                  aria-label="Tray icon color"
                  value={settings.trayColor}
                  onChange={(e) =>
                    void update({
                      trayColor: e.target.value as Settings["trayColor"],
                    })
                  }
                >
                  <option value="auto">Match taskbar</option>
                  <option value="light">Light icon</option>
                  <option value="dark">Dark icon</option>
                </select>
              </label>
              <div
                className="tray-choices"
                role="group"
                aria-label="System tray icon"
              >
                {[
                  ["meter", "Usage meter", "Top: 5-hour. Bottom: weekly."],
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
                "Optional visual handle. You can always drag the pill itself.",
              )}
              {toggle(
                "pillSideHideable",
                "Collapsible side tab",
                "On left or right placement, click the edge tab to slide usage out or hide it.",
                !["left", "right"].includes(settings.pillPlacement),
              )}
              <p className="preference-note">
                Drag the pill to move it; click to switch limits. Free placement
                snaps near the sides and top center. Pins stay on their edge.
              </p>
            </section>
          </div>
        )}
        {tab === "providers" && (
          <div className="preferences-grid">
            <section>
              <h2>Show usage for</h2>
              <div className="provider-cards" role="radiogroup" aria-label="Show usage for">
                {(["codex", "claude", "both"] as const).map((v) => {
                  const active = viewOf(settings) === v;
                  const status =
                    v === "both"
                      ? "Side by side"
                      : providerStatus(
                          providers.find((s) => s.provider === v),
                          settings.showBothProviders || settings.provider === v,
                        );
                  return (
                    <button
                      key={v}
                      role="radio"
                      className="choice-card provider-card"
                      aria-checked={active}
                      aria-pressed={active}
                      onClick={() => void update(patchFor(v))}
                    >
                      <span className="provider-card-logo" aria-hidden="true">
                        {v === "both" ? (
                          <>
                            <ProviderLogo provider="codex" size={16} />
                            <ProviderLogo provider="claude" size={16} />
                          </>
                        ) : (
                          <ProviderLogo provider={v} size={18} />
                        )}
                      </span>
                      <strong>{v === "both" ? "Both" : providerName(v)}</strong>
                      <small>{status}</small>
                    </button>
                  );
                })}
              </div>
              {settings.showBothProviders ? (
                <>
                  <label className="select-row">
                    <span>Tray icon follows</span>
                    <select
                      aria-label="Tray icon follows"
                      value={settings.provider}
                      onChange={(e) =>
                        void update({ provider: e.target.value as Settings["provider"] })
                      }
                    >
                      <option value="codex">Codex</option>
                      <option value="claude">Claude Code</option>
                    </select>
                  </label>
                  <p className="preference-note">
                    The pill shows each provider with both limits (5-hour outer
                    or top, weekly inner or bottom). Hover a provider for exact
                    percentages and reset times. Alerts cover both.
                  </p>
                </>
              ) : (
                <>
                  <p className="preference-note">
                    Switch any time from the usage popup, the tray menu or by
                    right-clicking the pill.
                  </p>
                  {toggle(
                    "pillShowProvider",
                    "Provider logo on the pill",
                    "Shows the Codex or Claude mark so you always know which you are viewing.",
                  )}
                </>
              )}
            </section>
            <section>
              <h2 className="provider-setup-heading">
                <ProviderLogo provider="codex" size={14} /> Codex
              </h2>
              <p className="preference-note">
                Uses your signed-in Codex CLI (run <code>codex login</code>{" "}
                once). Usage events update immediately; background checks follow
                your refresh interval.
              </p>
              <h2 className="section-gap provider-setup-heading">
                <ProviderLogo provider="claude" size={14} /> Claude Code
              </h2>
              <p className="preference-note">
                Reads your Claude Code sign-in (run <code>claude</code> and log
                in with Pro or Max) and asks Anthropic for the usage shown by{" "}
                <code>/usage</code>, so the terminal, desktop app, IDE
                extensions and claude.ai all count. Expired sign-ins are renewed
                the way Claude Code does. Checked at most every 30 seconds.
              </p>
              {providers
                .filter((s) => s.error && (settings.showBothProviders || s.provider === settings.provider))
                .map((s) => (
                  <p className="save-error" role="status" key={s.provider}>
                    {providerName(s.provider)}: {s.error}
                  </p>
                ))}
            </section>
          </div>
        )}
        {tab === "general" && (
          <div className="preferences-grid">
            <UpdatePanel />
            <section>
              <h2>Quiet by default</h2>
              <label className="select-row">
                <span>Toggle pill shortcut</span>
                <select
                  aria-label="Toggle pill shortcut"
                  value={settings.pillShortcut}
                  onChange={(event) =>
                    void update({
                      pillShortcut: event.target
                        .value as Settings["pillShortcut"],
                    })
                  }
                >
                  <option value="off">Off</option>
                  <option value="CommandOrControl+Shift+K">
                    Ctrl + Shift + K
                  </option>
                  <option value="CommandOrControl+Alt+K">Ctrl + Alt + K</option>
                </select>
              </label>
              <p className="preference-note">
                Show or hide the pill from any app. Your choice is saved.
              </p>
              {shortcutError && (
                <p className="save-error" role="alert">
                  {shortcutError}
                </p>
              )}
              {toggle(
                "launchAtStartup",
                "Launch at startup",
                "Start quietly when you sign in to Windows.",
              )}
              {toggle(
                "notificationsEnabled",
                "Low usage alerts",
                "Notify once at 25%, 10%, and 0% per limit cycle.",
              )}
            </section>
            <section>
              <h2>Usage refresh</h2>
              {toggle(
                "showRefreshActivity",
                "Show refresh activity",
                "Show a small activity indicator on the pill while refreshing. Off keeps routine updates quiet.",
              )}
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
                Codex usage events update immediately; polling catches other
                sessions. Claude Code is checked at most every 30 seconds.
                Refreshing never resets a limit.
              </p>
              <div className="privacy-note">
                <BrandMark />
                <p>
                  Uses your local {providerName(settings.provider)} sign-in.
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
          <span className="maker-credit">Made by cimanesdev</span>
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
