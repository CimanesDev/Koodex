import type { CodexUsage } from "../shared/types";
export type AlertLedger = Record<
  string,
  { cycle: number; threshold: number; remaining?: number }
>;
export function collectAlerts(
  usage: CodexUsage,
  ledger: AlertLedger,
  now = Date.now(),
) {
  const alerts: Array<{ label: string; remaining: number; resetsAt: number }> =
    [];
  for (const w of usage.windows) {
    if (w.remainingPercent === null || w.resetsAt === null || w.resetsAt <= now)
      continue;
    const previous = ledger[w.id];
    // Reset timestamps can drift even while a quota remains exhausted. Rearm
    // only after the old reset has passed AND usage has actually recovered.
    const recovered =
      previous &&
      now >= previous.cycle &&
      w.remainingPercent > (previous.remaining ?? previous.threshold);
    const threshold = [0, 10, 25].find((t) => w.remainingPercent! <= t);
    if (threshold === undefined) {
      if (recovered) delete ledger[w.id];
      continue;
    }
    if (previous && !recovered && previous.threshold <= threshold) continue;
    ledger[w.id] = {
      cycle: w.resetsAt,
      threshold,
      remaining: w.remainingPercent,
    };
    alerts.push({
      label: w.label,
      remaining: w.remainingPercent,
      resetsAt: w.resetsAt,
    });
  }
  return alerts;
}
