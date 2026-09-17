import { copyFileSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Snapshot, UsageWindow } from "../shared/types";

export const claudeFile = (directory: string) =>
  join(directory, "claude-usage.json");

export function prepareClaudeBridge(
  appPath: string,
  directory: string,
): string {
  const destination = join(directory, "claude-bridge.cjs");
  copyFileSync(join(appPath, "assets", "claude-bridge.cjs"), destination);
  // Base64 avoids shell interpretation of spaces or special characters in user paths.
  const encoded = Buffer.from(destination).toString("base64");
  return JSON.stringify(
    {
      statusLine: {
        type: "command",
        command: `node -e "require(Buffer.from('${encoded}','base64').toString())"`,
      },
    },
    null,
    2,
  );
}

export function adaptClaude(data: unknown, now = Date.now()): Snapshot {
  const value = data as {
    receivedAt?: unknown;
    rate_limits?: Record<string, unknown>;
  } | null;
  if (
    !value ||
    typeof value.receivedAt !== "number" ||
    !Number.isFinite(value.receivedAt) ||
    value.receivedAt <= 0 ||
    value.receivedAt > now + 5000 ||
    !value.rate_limits ||
    typeof value.rate_limits !== "object"
  )
    throw new Error("Invalid Claude quota update");
  const windows: UsageWindow[] = [];
  for (const [key, id, label, minutes] of [
    ["five_hour", "five-hour", "5-hour", 300],
    ["seven_day", "weekly", "Weekly", 10080],
  ] as const) {
    const w = value.rate_limits[key] as
      { used_percentage?: unknown; resets_at?: unknown } | undefined;
    if (!w || typeof w !== "object") continue;
    const used =
      typeof w.used_percentage === "number" &&
      Number.isFinite(w.used_percentage)
        ? Math.max(0, Math.min(100, w.used_percentage))
        : null;
    const reset =
      typeof w.resets_at === "number" &&
      Number.isFinite(w.resets_at) &&
      w.resets_at > 0 &&
      w.resets_at < 8640000000000
        ? w.resets_at * 1000
        : null;
    windows.push({
      id,
      label,
      usedPercent: used,
      remainingPercent: used === null ? null : 100 - used,
      resetsAt: reset,
      windowMinutes: minutes,
    });
  }
  const stale =
    now - value.receivedAt > 60000 ||
    windows.some((w) => w.resetsAt !== null && w.resetsAt <= now);
  return {
    provider: "claude",
    usage: { windows, fetchedAt: value.receivedAt },
    syncState: stale ? "stale" : "synced",
    ...(!windows.length
      ? {
          error:
            "Claude Code has not reported quota data. A supported Pro/Max session must complete a response first.",
        }
      : stale
        ? {
            error:
              "Waiting for a new Claude Code status-line update. Refresh rereads the last report; it cannot query Claude's account directly.",
          }
        : {}),
  };
}

export function readClaude(directory: string): Snapshot {
  try {
    const path = claudeFile(directory);
    if (statSync(path).size > 65536) throw new Error("Oversized report");
    return adaptClaude(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return {
      provider: "claude",
      usage: null,
      syncState: "offline",
      error:
        "Waiting for Claude Code. Open Settings > Providers to set up the local status-line bridge.",
    };
  }
}
