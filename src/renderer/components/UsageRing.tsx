import { tone } from "../../shared/format";
export function UsageRing({ value }: { value: number | null }) {
  return (
    <svg
      className={`ring ${tone(value)}`}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <circle className="ring-track" cx="10" cy="10" r="8" />
      <circle
        className="ring-value"
        cx="10"
        cy="10"
        r="8"
        pathLength="100"
        strokeDasharray={`${value ?? 0} 100`}
        transform="rotate(-90 10 10)"
      />
    </svg>
  );
}
