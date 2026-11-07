// Shared renderer logic. Backend logic is covered by `cargo test` in src-tauri.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { age, priority, resetIn, tone } from "../src/shared/format";
import { orderedQuotas, trayLevels } from "../src/shared/quotas";
import { pillSize, pinnedPosition } from "../src/shared/pill";
import { connectionDiagnostic, paceEstimate } from "../src/shared/insights";
import { defaults, type Settings, type UsageWindow } from "../src/shared/types";

const w = (id: string, remaining: number | null, minutes: number | null) =>
  ({
    id,
    label: id,
    usedPercent: remaining === null ? null : 100 - remaining,
    remainingPercent: remaining,
    resetsAt: null,
    windowMinutes: minutes,
  }) satisfies UsageWindow;

test("formatting", () => {
  assert.equal(resetIn(0, 0), "soon");
  assert.equal(resetIn(90 * 60000, 0), "1h 30m");
  assert.equal(resetIn(50 * 3600000, 0), "2d 2h");
  assert.equal(age(0, 30000), "just now");
  assert.equal(age(0, 3 * 3600000), "3h ago");
  assert.deepEqual([tone(5), tone(20), tone(null)], ["critical", "low", "normal"]);
});

test("quota ordering keeps identity and urgency separate", () => {
  const windows = [w("weekly", 10, 10080), w("five-hour", 80, 300)];
  assert.equal(orderedQuotas(windows)[0].id, "five-hour");
  assert.equal(priority(windows)[0].id, "weekly");
  assert.deepEqual(trayLevels([w("weekly", 26, 10080)]), [-1, 3]);
});

test("pill sizes match the Rust geometry table", () => {
  // Mirrors src-tauri/src/geometry.rs tests and implementation.
  const rust = readFileSync("src-tauri/src/geometry.rs", "utf8");
  assert.match(rust, /\(176\.0, 44\.0\)/);
  assert.deepEqual(pillSize(defaults), { width: 176, height: 44 });
  const badge: Settings = { ...defaults, pillShowProvider: true };
  assert.equal(pillSize(badge).width, 198);
  const side: Settings = { ...defaults, pillPlacement: "right" };
  assert.deepEqual(pillSize(side), { width: 132, height: 64 });
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  assert.deepEqual(pinnedPosition(defaults, area), { x: 1724, y: 976 });
});

test("diagnostics guide sign-in per provider", () => {
  const claude = connectionDiagnostic({
    provider: "claude",
    usage: null,
    syncState: "error",
    error: "Sign in to Claude Code first: run `claude`",
  });
  assert.equal(claude?.title, "Sign in to Claude Code");
  const codex = connectionDiagnostic({
    provider: "codex",
    usage: null,
    syncState: "error",
    error: "Codex not found. Install the Codex CLI, then restart Koodex.",
  });
  assert.equal(codex?.title, "Codex CLI not found");
  assert.equal(
    connectionDiagnostic({ provider: "codex", usage: null, syncState: "connecting" }),
    null,
  );
});

test("pace estimate needs a fresh, mature window", () => {
  const now = 10 * 3600000;
  const quota = { ...w("five-hour", 50, 300), resetsAt: now + 2.5 * 3600000 };
  const state = {
    provider: "claude" as const,
    syncState: "synced" as const,
    usage: { windows: [quota], fetchedAt: now },
  };
  assert.match(paceEstimate(quota, state, now) ?? "", /may run out|left at reset/);
  assert.equal(paceEstimate(quota, { ...state, syncState: "stale" }, now), null);
});
