import type { CodexUsage } from "../shared/types";
export type AlertLedger = Record<string, { cycle: number; threshold: number }>;
export function collectAlerts(usage: CodexUsage, ledger: AlertLedger) {
  const alerts: Array<{ label: string; remaining: number; resetsAt: number }> =
    [];
  for (const w of usage.windows) {
    if (
      w.remainingPercent === null ||
      w.resetsAt === null ||
      w.resetsAt <= Date.now()
    )
      continue;
    const threshold = [5, 10, 25].find((t) => w.remainingPercent! <= t);
    if (threshold === undefined) continue;
    const previous = ledger[w.id];
    if (previous?.cycle === w.resetsAt && previous.threshold <= threshold)
      continue;
    ledger[w.id] = { cycle: w.resetsAt, threshold };
    alerts.push({
      label: w.label,
      remaining: w.remainingPercent,
      resetsAt: w.resetsAt,
    });
  }
  return alerts;
}
