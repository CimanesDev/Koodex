import type { UsageWindow } from "./types";
export const priority = (windows: UsageWindow[]) =>
  [...windows].sort(
    (a, b) => (a.remainingPercent ?? 100) - (b.remainingPercent ?? 100),
  );
export function resetIn(at: number, now = Date.now()) {
  const m = Math.max(0, Math.ceil((at - now) / 60000));
  if (m === 0) return "soon";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
export function age(at: number, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - at) / 60000));
  return m === 0
    ? "just now"
    : m < 60
      ? `${m}m ago`
      : `${Math.floor(m / 60)}h ago`;
}
export const tone = (n: number | null) =>
  n !== null && n < 10 ? "critical" : n !== null && n <= 25 ? "low" : "normal";
