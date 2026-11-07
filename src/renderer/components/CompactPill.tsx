import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  providerName,
  type Settings,
  type Snapshot,
  type UsageWindow,
} from "../../shared/types";
import { useAlternatingMetric } from "../hooks/useAlternatingMetric";
import { UsageRing } from "./UsageRing";
import { UsageBar } from "./UsageBar";
import { resetIn } from "../../shared/format";
import { RefreshIcon } from "./Icons";
import {
  DOCK_TAB_WIDTH,
  hasGrip,
  isVertical,
  pillSize,
} from "../../shared/pill";
import { orderedQuotas } from "../../shared/quotas";
import { DualIndicator } from "./DualIndicator";
import { ProviderLogo } from "./ProviderLogo";

const describe = (w: UsageWindow, now: number) =>
  `${w.label}: ${w.remainingPercent === null ? "Unavailable" : `${Math.round(w.remainingPercent)}% left`}${w.resetsAt ? ` · Resets in ${resetIn(w.resetsAt, now)}` : ""}`;

/**
 * One provider's usage, exactly as configured (limits, style, text, countdowns).
 * The pill shows one of these, or one row per provider in "Both".
 */
function PillBody({
  state,
  settings,
  now,
  paused,
  logo,
}: {
  state: Snapshot;
  settings: Settings;
  now: number;
  paused: boolean;
  logo: boolean;
}) {
  const both = settings.pillLayout === "both";
  const combined = both && settings.pillBothStyle === "combined";
  const minimal = settings.pillContent === "indicator";
  const vertical = isVertical(settings);
  const provider = providerName(state.provider ?? settings.provider);
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
        title={describe(w, now)}
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
  const body = (
    <>
      {logo && (
        <span className="provider-badge" title={provider}>
          <ProviderLogo provider={state.provider ?? settings.provider} size={15} />
        </span>
      )}
      {quotas.length ? (
        combined ? (
          <div
            className="combined-quota"
            title={quotas.map((w) => describe(w, now)).join("\n")}
          >
            <DualIndicator
              windows={quotas}
              style={settings.pillIndicator}
              vertical={vertical}
            />
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
              ? `Connecting to ${provider}`
              : state.error || `${provider} unavailable`
          }
        >
          {state.syncState === "connecting"
            ? minimal
              ? "…"
              : "Connecting…"
            : minimal
              ? "—"
              : `${provider} unavailable`}
        </span>
      )}
      {state.syncState !== "synced" &&
        (state.syncState !== "refreshing" || settings.showRefreshActivity) && (
          <span
            className={
              state.syncState === "refreshing"
                ? "pill-stale pill-refreshing"
                : "pill-stale"
            }
            title={state.syncState}
          >
            ○
          </span>
        )}
    </>
  );
  return canSwitch ? (
    <button
      className="pill-content"
      onClick={next}
      aria-label={`Switch ${provider} usage limit`}
      title={`${provider} · click to switch · right-click for more`}
    >
      {body}
    </button>
  ) : (
    <div className="pill-content" title={`${provider} · right-click for more`}>
      {body}
    </div>
  );
}

export function CompactPill({
  state,
  paused,
  settings,
  now = Date.now(),
  preview = false,
  refresh = () => window.Koodex.refreshUsage(),
  shown,
}: {
  shown?: Snapshot[];
  state: Snapshot;
  paused: boolean;
  settings: Settings;
  now?: number;
  preview?: boolean;
  refresh?: () => Promise<void>;
}) {
  const bothProviders = settings.showBothProviders;
  const both = settings.pillLayout === "both";
  const minimal = settings.pillContent === "indicator";
  const vertical = isVertical(settings);
  const docked = !preview && vertical && settings.pillSideHideable;
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(false);
  }, [docked, settings.pillPlacement]);
  const gesture = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (
      preview ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest(".pill-refresh, .dock-tab")
    )
      return;
    gesture.current = { x: event.screenX, y: event.screenY, moved: false };
    suppressClick.current = false;
    (event.target as Element).setPointerCapture(event.pointerId);
    void window.Koodex.dragPill("start");
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (!start) return;
    if (
      !start.moved &&
      Math.hypot(event.screenX - start.x, event.screenY - start.y) >= 5
    ) {
      start.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (start.moved) {
      suppressClick.current = true;
      void window.Koodex.dragPill("move");
    }
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (!gesture.current) return;
    void window.Koodex.dragPill(
      event.type === "pointercancel" || !gesture.current.moved
        ? "cancel"
        : "end",
    );
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const combined = both && settings.pillBothStyle === "combined";
  const rows = bothProviders
    ? (shown?.length ? shown : [state]).slice(0, 2)
    : [state];
  const busy = rows.every(
    (s) => s.syncState === "refreshing" || s.syncState === "connecting",
  );
  const size = pillSize(settings);
  const pill = (
    <div
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!preview) void window.Koodex.showPillMenu();
      }}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      }}
      data-material={settings.pillMaterial}
      style={
        {
          width: preview ? size.width : undefined,
          height: size.height,
          "--pill-opacity": settings.pillOpacity / 100,
        } as CSSProperties
      }
      className={`pill ${bothProviders ? "pill-providers" : ""} ${both ? "pill-both" : ""} pill-${settings.pillIndicator} ${settings.pillShowReset && !minimal ? "pill-with-reset" : ""} ${preview ? "pill-preview" : ""} ${minimal ? "pill-minimal" : ""} ${vertical ? "pill-vertical" : ""} ${hasGrip(settings) ? "" : "pill-no-grip"} ${combined ? "pill-combined" : ""}`}
    >
      {hasGrip(settings) && (
        <div
          className="drag-handle"
          title={
            settings.pillPlacement === "free"
              ? "Drag to move · right-click for settings"
              : "Drag along this screen edge · right-click for settings"
          }
          aria-hidden="true"
        >
          ⠿
        </div>
      )}
      {bothProviders ? (
        <div className="provider-rows">
          {rows.map((s, i) => (
            <div className="provider-row" key={s.provider}>
              {i > 0 && <span className="provider-row-divider" aria-hidden="true" />}
              <PillBody state={s} settings={settings} now={now} paused={paused} logo />
            </div>
          ))}
        </div>
      ) : (
        <PillBody
          state={state}
          settings={settings}
          now={now}
          paused={paused}
          logo={settings.pillShowProvider}
        />
      )}
      {settings.pillShowRefresh && (
        <button
          className="pill-refresh"
          aria-label={preview ? "Refresh live preview" : "Refresh usage"}
          title="Refresh usage now"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshIcon />
        </button>
      )}
    </div>
  );
  if (!docked) return pill;
  const tab = (
    <button
      className="dock-tab"
      aria-label={expanded ? "Hide usage pill" : "Show usage pill"}
      aria-expanded={expanded}
      aria-controls="dock-usage"
      title={expanded ? "Hide usage" : "Show usage"}
      onClick={() => {
        setExpanded(!expanded);
        void window.Koodex.expandPill(!expanded);
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        style={{
          transform:
            (settings.pillPlacement === "left") !== expanded
              ? undefined
              : "rotate(180deg)",
        }}
      >
        <path
          d="m6 4 4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
  return (
    <div
      className={`pill-dock dock-${settings.pillPlacement}`}
      data-expanded={expanded}
      data-material={settings.pillMaterial}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          setExpanded(false);
          void window.Koodex.expandPill(false);
          event.currentTarget
            .querySelector<HTMLButtonElement>(".dock-tab")
            ?.focus();
        }
      }}
      style={
        {
          "--dock-tab-width": `${DOCK_TAB_WIDTH}px`,
          "--pill-opacity": settings.pillOpacity / 100,
          width: size.width + DOCK_TAB_WIDTH,
          height: size.height,
        } as CSSProperties
      }
    >
      {settings.pillPlacement === "right" && tab}
      <div id="dock-usage" className="dock-content" inert={!expanded}>
        {pill}
      </div>
      {settings.pillPlacement === "left" && tab}
    </div>
  );
}
