import { paceEstimate } from "../../shared/insights";
import type { Snapshot, UsageWindow as Quota } from "../../shared/types";
import { resetIn, tone } from "../../shared/format";
import { UsageBar } from "./UsageBar";
export function UsageWindow({
  quota,
  now,
  state,
}: {
  quota: Quota;
  now: number;
  state?: Snapshot;
}) {
  const pace = state ? paceEstimate(quota, state, now) : null;
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
      {pace && (
        <p
          className="pace-estimate"
          title="Approximate: assumes steady use at the average rate since this quota window began. Bursts, reporting delays, and rolling limits can change the outcome. No usage history is stored."
        >
          {pace}
        </p>
      )}
    </section>
  );
}
