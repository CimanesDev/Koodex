// Wire fields verified against codex-cli 0.154.0 generate-ts (2026-09-16).
export interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}
export interface RateLimitSnapshot {
  limitId?: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
  planType?: string | null;
  credits?: {
    balance: string | null;
    unlimited: boolean;
    hasCredits: boolean;
  } | null;
}
export interface RateLimitsResponse {
  rateLimits: RateLimitSnapshot;
  rateLimitsByLimitId?: Record<string, RateLimitSnapshot | undefined> | null;
}
