import {
  copyFileSync,
  readFileSync,
  statSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  constants,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Snapshot, UsageWindow } from "../shared/types";

export const claudeFile = (directory: string) =>
  join(directory, "claude-usage.json");

export function connectClaude(
  appPath: string,
  directory: string,
  configDirectory = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"),
): string {
  const path = join(configDirectory, "settings.json");
  const existed = existsSync(path);
  const original = existed ? readFileSync(path, "utf8") : "{}";
  let settings;
  try {
    settings = JSON.parse(original.replace(/^\uFEFF/, ""));
    if (!settings || typeof settings !== "object" || Array.isArray(settings))
      throw new Error();
  } catch {
    throw new Error(
      "Claude settings contain invalid JSON. Fix settings.json, then reconnect.",
    );
  }
  try {
    execFileSync("node", ["--version"], {
      windowsHide: true,
      timeout: 3000,
      stdio: "ignore",
    });
  } catch {
    throw new Error(
      "Claude connection needs Node.js on PATH. Install Node.js, then reconnect.",
    );
  }
  const config = JSON.parse(prepareClaudeBridge(appPath, directory));
  const previous = settings.statusLine;
  if (
    previous &&
    (previous.type !== "command" || typeof previous.command !== "string")
  )
    throw new Error(
      "Claude has an unsupported status line. Its settings were left unchanged.",
    );
  // Recognize our original manual bridge and this installation's managed bridge.
  const base = config.statusLine.command.slice(0, -1);
  if (
    previous?.command === config.statusLine.command ||
    previous?.command.startsWith(base + ".previousCommand=")
  )
    return "Claude Code is connected. Usage updates after Claude responds.";
  const encoded = Buffer.from(previous?.command || "").toString("base64");
  config.statusLine.command =
    base + ".previousCommand='" + encoded + "'" + String.fromCharCode(34);
  mkdirSync(configDirectory, { recursive: true });
  if (existed) {
    copyFileSync(
      path,
      join(
        configDirectory,
        `settings.koodex-backup-${Date.now()}-${process.pid}.json`,
      ),
      constants.COPYFILE_EXCL,
    );
  }
  const temporary = `${path}.koodex-${process.pid}.tmp`;
  try {
    writeFileSync(
      temporary,
      JSON.stringify(
        { ...settings, statusLine: { ...previous, ...config.statusLine } },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    if (
      existsSync(path) !== existed ||
      (existed && readFileSync(path, "utf8") !== original)
    )
      throw new Error(
        "Claude settings changed during setup. Please reconnect.",
      );
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return "Claude Code is connected. Usage updates after Claude responds.";
}

export function prepareClaudeBridge(
  appPath: string,
  directory: string,
): string {
  mkdirSync(directory, { recursive: true });
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
        "Waiting for Claude Code to report usage. Complete a response in a signed-in Claude Code session.",
    };
  }
}
