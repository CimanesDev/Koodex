import type { UsageWindow as Quota } from "../../shared/types";
import { resetIn, tone } from "../../shared/format";
import { UsageBar } from "./UsageBar";
export function UsageWindow({ quota, now }: { quota: Quota; now: number }) {
  return (
    <section className="quota">
      <div className="quota-heading">
        <h2>{quota.label}</h2>
        <div className={`percent ${tone(quota.remainingPercent)}`}>
          {quota.remainingPercent === null
            ? "—"
            : Math.round(quota.remainingPercent)}
          {quota.remainingPercent !== null && (
            <>
              <span>%</span>
              <small> left</small>
            </>
          )}
        </div>
      </div>
      <UsageBar value={quota.remainingPercent} label={quota.label} />
      {quota.resetsAt !== null && (
        <p className="reset" title={new Date(quota.resetsAt).toLocaleString()}>
          {quota.resetsAt <= now
            ? "Reset due · awaiting update"
            : `Resets in ${resetIn(quota.resetsAt, now)}`}
        </p>
      )}
    </section>
  );
}
