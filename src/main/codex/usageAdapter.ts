import type { CodexUsage, UsageWindow } from "../../shared/types";
import type { RateLimitsResponse } from "./types";
export function adaptUsage(
  raw: RateLimitsResponse,
  now = Date.now(),
): CodexUsage {
  const s = raw?.rateLimitsByLimitId?.codex ?? raw?.rateLimits;
  if (!s || typeof s !== "object")
    throw new Error("Unsupported Codex usage response");
  const windows: UsageWindow[] = [];
  for (const [slot, w] of [
    ["primary", s.primary],
    ["secondary", s.secondary],
  ] as const) {
    if (!w) continue;
    const minutes = Number.isFinite(w.windowDurationMins)
      ? w.windowDurationMins
      : null;
    const id =
      minutes === 300 ? "five-hour" : minutes === 10080 ? "weekly" : slot;
    const used =
      typeof w.usedPercent === "number" && Number.isFinite(w.usedPercent)
        ? Math.max(0, Math.min(100, w.usedPercent))
        : null;
    windows.push({
      id,
      label:
        id === "five-hour"
          ? "5-hour"
          : id === "weekly"
            ? "Weekly"
            : minutes
              ? `${minutes / 60}-hour`
              : `${slot === "primary" ? "Primary" : "Secondary"} limit`,
      usedPercent: used,
      remainingPercent: used === null ? null : 100 - used,
      resetsAt:
        typeof w.resetsAt === "number" && Number.isFinite(w.resetsAt)
          ? w.resetsAt * 1000
          : null,
      windowMinutes: minutes,
    });
  }
  const balance = s.credits?.balance;
  return {
    windows,
    planType: s.planType ?? undefined,
    credits:
      balance != null &&
      balance.trim() !== "" &&
      Number.isFinite(Number(balance))
        ? Number(balance)
        : null,
    fetchedAt: now,
  };
}
