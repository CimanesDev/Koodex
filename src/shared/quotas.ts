import type { UsageWindow } from "./types";
export function orderedQuotas(windows: UsageWindow[]) {
  return [...windows].sort((a, b) => rank(a) - rank(b));
}
function rank(w: UsageWindow) {
  return w.id === "five-hour" || w.windowMinutes === 300
    ? 0
    : w.id === "weekly" || w.windowMinutes === 10080
      ? 1
      : 2;
}
export function trayLevels(windows: UsageWindow[]) {
  const step = (w: UsageWindow | undefined) =>
    w?.remainingPercent == null
      ? -1
      : Math.max(0, Math.min(10, Math.round(w.remainingPercent / 10)));
  return [
    step(windows.find((w) => w.id === "five-hour" || w.windowMinutes === 300)),
    step(windows.find((w) => w.id === "weekly" || w.windowMinutes === 10080)),
  ] as const;
}
