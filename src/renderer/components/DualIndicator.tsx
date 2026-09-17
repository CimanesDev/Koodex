import type { UsageWindow } from "../../shared/types";
import { orderedQuotas } from "../../shared/quotas";
import { tone } from "../../shared/format";
import { UsageBar } from "./UsageBar";
export function DualIndicator({
  windows,
  style,
  vertical = false,
}: {
  windows: UsageWindow[];
  style: "ring" | "bar";
  vertical?: boolean;
}) {
  const items = orderedQuotas(windows);
  if (style === "bar")
    return (
      <div className={`dual-bars ${vertical ? "dual-bars-vertical" : ""}`}>
        {items.map((w) => (
          <div
            key={w.id}
            style={{
              [vertical ? "gridColumn" : "gridRow"]:
                w.id === "weekly" || w.windowMinutes === 10080 ? 2 : 1,
            }}
          >
            <UsageBar label={w.label} value={w.remainingPercent} />
          </div>
        ))}
      </div>
    );
  return (
    <svg
      className="dual-ring"
      viewBox="0 0 32 32"
      width="32"
      height="32"
      fill="none"
      aria-label="5-hour outer ring, weekly inner ring"
    >
      {items.map((w, index) => {
        const radius =
          w.id === "weekly" || w.windowMinutes === 10080
            ? 7
            : w.id === "five-hour" || w.windowMinutes === 300
              ? 12
              : Math.max(3, 12 - index * 5);
        return (
          <g
            key={w.id}
            className={tone(w.remainingPercent)}
            role="progressbar"
            aria-label={`${w.label} remaining`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={w.remainingPercent ?? undefined}
            aria-valuetext={
              w.remainingPercent === null
                ? "Unavailable"
                : `${Math.round(w.remainingPercent)}% remaining`
            }
          >
            <circle
              cx="16"
              cy="16"
              r={radius}
              className="ring-track"
              strokeWidth="2.5"
            />
            <circle
              cx="16"
              cy="16"
              r={radius}
              className="ring-value"
              strokeWidth="2.5"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray={`${w.remainingPercent ?? 0} 100`}
              transform="rotate(-90 16 16)"
            />
          </g>
        );
      })}
    </svg>
  );
}
