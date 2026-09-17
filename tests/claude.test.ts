import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  adaptClaude,
  prepareClaudeBridge,
  readClaude,
} from "../src/main/claude";

test("Claude bridge saves only quota fields, handles absent data, and preserves report age", () => {
  mkdirSync(".smoke-data", { recursive: true });
  const directory = mkdtempSync(resolve(".smoke-data", "claude-unit-"));
  const config = JSON.parse(prepareClaudeBridge(resolve("."), directory));
  assert.equal(config.statusLine.type, "command");
  const send = (input: unknown) =>
    spawnSync(process.execPath, [join(directory, "claude-bridge.cjs")], {
      input: JSON.stringify(input),
      encoding: "utf8",
    });
  assert.equal(
    send({
      secret: "do-not-store",
      transcript_path: "private",
      rate_limits: {
        five_hour: { used_percentage: 24, resets_at: Date.now() / 1000 + 3600 },
        seven_day: {
          used_percentage: 60,
          resets_at: Date.now() / 1000 + 86400,
        },
      },
    }).status,
    0,
  );
  const text = readFileSync(join(directory, "claude-usage.json"), "utf8");
  assert.ok(!text.includes("private") && !text.includes("secret"));
  const data = JSON.parse(text);
  const snapshot = readClaude(directory);
  assert.equal(snapshot.provider, "claude");
  assert.deepEqual(
    snapshot.usage!.windows.map((w) => w.remainingPercent),
    [76, 40],
  );
  const aged = adaptClaude(data, data.receivedAt + 61000);
  assert.equal(aged.syncState, "stale");
  assert.equal(aged.usage!.fetchedAt, data.receivedAt);
  assert.equal(adaptClaude(data, data.receivedAt).syncState, "synced");
  send({ rate_limits: { seven_day: { used_percentage: 0, resets_at: 1 } } });
  assert.equal(
    readClaude(directory).syncState,
    "stale",
    "expired resets need new source data",
  );
  send({});
  assert.deepEqual(
    readClaude(directory).usage!.windows,
    [],
    "absent data must clear previous account values",
  );
  assert.throws(() => adaptClaude({ receivedAt: "now", rate_limits: {} }));
  writeFileSync(join(directory, "claude-usage.json"), "invalid json");
  assert.equal(readClaude(directory).syncState, "offline");
});

test("Claude partial and malformed windows never invent percentages", () => {
  const state = adaptClaude({
    receivedAt: Date.now(),
    rate_limits: {
      seven_day: { used_percentage: "42", resets_at: null },
    },
  });
  assert.equal(state.usage!.windows.length, 1);
  assert.equal(state.usage!.windows[0].id, "weekly");
  assert.equal(state.usage!.windows[0].remainingPercent, null);
});
