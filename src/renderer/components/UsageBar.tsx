import { tone } from "../../shared/format";
import type { CSSProperties } from "react";
export function UsageBar({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  return (
    <div
      className={`bar ${tone(value)}`}
      role="progressbar"
      aria-label={`${label} remaining`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      aria-valuetext={
        value === null ? "Unavailable" : `${Math.round(value)}% remaining`
      }
    >
      <span
        style={
          {
            width: `${value ?? 0}%`,
            "--remaining": `${value ?? 0}%`,
          } as CSSProperties
        }
      />
    </div>
  );
}
