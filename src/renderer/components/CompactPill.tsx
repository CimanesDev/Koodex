import type { Settings, Snapshot, UsageWindow } from "../../shared/types";
import { useAlternatingMetric } from "../hooks/useAlternatingMetric";
import { UsageRing } from "./UsageRing";
import { UsageBar } from "./UsageBar";
import { resetIn } from "../../shared/format";
import { RefreshIcon } from "./Icons";
import { hasGrip, isVertical, pillSize } from "../../shared/pill";
import { orderedQuotas } from "../../shared/quotas";
import { DualIndicator } from "./DualIndicator";
export function CompactPill({
  state,
  paused,
  settings,
  now = Date.now(),
  preview = false,
  refresh = () => window.Koodex.refreshUsage(),
}: {
  state: Snapshot;
  paused: boolean;
  settings: Settings;
  now?: number;
  preview?: boolean;
  refresh?: () => Promise<void>;
}) {
  const both = settings.pillLayout === "both";
  const providerName = settings.provider === "claude" ? "Claude Code" : "Codex";
  const minimal = settings.pillContent === "indicator";
  const vertical = isVertical(settings);
  const combined = both && settings.pillBothStyle === "combined";
  const { quota, next } = useAlternatingMetric(
    state.usage?.windows ?? [],
    settings.pillSwitchSeconds * 1000,
    paused || both,
  );
  const quotas = both
    ? orderedQuotas(state.usage?.windows ?? [])
    : quota
      ? [quota]
      : [];
  const canSwitch = !both && (state.usage?.windows.length ?? 0) > 1;
  function metric(w: UsageWindow) {
    return (
      <div
        className="pill-quota"
        key={w.id}
        title={`${w.label}: ${w.remainingPercent === null ? "Unavailable" : `${Math.round(w.remainingPercent)}% left`}${w.resetsAt ? ` · Resets in ${resetIn(w.resetsAt, now)}` : ""}`}
        aria-label={`${w.label}: ${w.remainingPercent === null ? "Unavailable" : `${Math.round(w.remainingPercent)}% remaining`}`}
      >
        {!combined && settings.pillIndicator === "ring" && (
          <UsageRing value={w.remainingPercent} />
        )}
        <div className="pill-metric">
          {!minimal && (
            <span className="metric" key={w.id}>
              {w.id === "five-hour" ? "5h" : w.label} ·{" "}
              {w.remainingPercent === null
                ? "—"
                : `${Math.round(w.remainingPercent)}%${both ? "" : " left"}`}
            </span>
          )}
          {!combined && settings.pillIndicator === "bar" && (
            <UsageBar label={w.label} value={w.remainingPercent} />
          )}
          {!minimal && settings.pillShowReset && (
            <span
              className="pill-reset"
              title={
                w.resetsAt ? new Date(w.resetsAt).toLocaleString() : undefined
              }
            >
              {w.resetsAt === null
                ? "Reset unavailable"
                : w.resetsAt <= now
                  ? "Reset due"
                  : `Resets in ${resetIn(w.resetsAt, now)}`}
            </span>
          )}
        </div>
      </div>
    );
  }
  const content = (
    <>
      {quotas.length ? (
        combined ? (
          <div
            className="combined-quota"
            title={quotas
              .map(
                (w) =>
                  `${w.label}: ${w.remainingPercent === null ? "Unavailable" : `${Math.round(w.remainingPercent)}% left`}${w.resetsAt ? ` · Resets in ${resetIn(w.resetsAt, now)}` : ""}`,
              )
              .join("\n")}
          >
            <DualIndicator windows={quotas} style={settings.pillIndicator} />
            {!minimal && (
              <div className="combined-labels">{quotas.map(metric)}</div>
            )}
          </div>
        ) : (
          quotas.map(metric)
        )
      ) : (
        <span
          className={minimal ? "minimal-empty" : "metric"}
          title={
            state.syncState === "connecting"
              ? `Connecting to ${providerName}`
              : `${providerName} unavailable`
          }
        >
          {state.syncState === "connecting"
            ? minimal
              ? "…"
              : "Connecting…"
            : minimal
              ? "—"
              : `${providerName} unavailable`}
        </span>
      )}
      {state.syncState !== "synced" && (
        <span className="pill-stale" title={state.syncState}>
          ○
        </span>
      )}
    </>
  );
  return (
    <div
      style={{ height: pillSize(settings).height }}
      className={`pill ${both ? "pill-both" : ""} pill-${settings.pillIndicator} ${settings.pillShowReset && !minimal ? "pill-with-reset" : ""} ${preview ? "pill-preview" : ""} ${minimal ? "pill-minimal" : ""} ${vertical ? "pill-vertical" : ""} ${hasGrip(settings) ? "" : "pill-no-grip"} ${combined ? "pill-combined" : ""}`}
    >
      {hasGrip(settings) && (
        <div
          className="drag-handle"
          title="Drag to move · right-click for settings"
          aria-hidden="true"
        >
          ⠿
        </div>
      )}
      {canSwitch ? (
        <button
          className="pill-content"
          onClick={next}
          aria-label="Switch usage limit"
          title="Click to switch · right-click for settings"
        >
          {content}
        </button>
      ) : (
        <div className="pill-content" title="Right-click for settings">
          {content}
        </div>
      )}
      {settings.pillShowRefresh && (
        <button
          className="pill-refresh"
          aria-label={preview ? "Try refresh preview" : "Refresh usage"}
          title={preview ? "Preview refresh" : "Refresh usage now"}
          disabled={
            state.syncState === "refreshing" || state.syncState === "connecting"
          }
          onClick={() => void refresh()}
        >
          <RefreshIcon />
        </button>
      )}
    </div>
  );
}
