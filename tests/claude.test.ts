import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  adaptClaude,
  connectClaude,
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

function setupFixture() {
  mkdirSync(".smoke-data", { recursive: true });
  const root = mkdtempSync(resolve(".smoke-data", "claude-setup-"));
  const config = join(root, "config");
  mkdirSync(config);
  return { root, config, path: join(config, "settings.json") };
}

test("automatic Claude setup preserves settings, original output and input, and is idempotent", () => {
  const { root, config, path } = setupFixture();
  const previousCommand = `node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>process.stdout.write('original:'+JSON.parse(s).model.id))"`;
  const original = JSON.stringify({
    permissions: { allow: ["Read"] },
    statusLine: { type: "command", command: previousCommand, padding: 3 },
  });
  writeFileSync(path, original);
  connectClaude(resolve("."), root, config);
  const saved = readFileSync(path, "utf8");
  const settings = JSON.parse(saved);
  assert.deepEqual(settings.permissions, { allow: ["Read"] });
  assert.equal(settings.statusLine.padding, 3);
  const backups = readdirSync(config).filter((name) => name.includes("backup"));
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(join(config, backups[0]), "utf8"), original);
  connectClaude(resolve("."), root, config);
  assert.equal(readFileSync(path, "utf8"), saved);
  assert.equal(
    readdirSync(config).filter((name) => name.includes("backup")).length,
    1,
  );
  // Exercise the installed command, including its preservation of stdin and stdout.
  const result = spawnSync(settings.statusLine.command, {
    shell: true,
    encoding: "utf8",
    input: JSON.stringify({
      model: { id: "test-model" },
      rate_limits: { five_hour: { used_percentage: 12 } },
    }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "original:test-model");
  assert.equal(readClaude(root).usage!.windows[0].remainingPercent, 88);
});

test("automatic Claude setup handles a new install and refuses invalid settings without changing them", () => {
  const { root, config, path } = setupFixture();
  connectClaude(resolve("."), root, config);
  assert.equal(
    JSON.parse(readFileSync(path, "utf8")).statusLine.type,
    "command",
  );
  assert.equal(
    readdirSync(config).filter((name) => name.includes("backup")).length,
    0,
  );
  for (const invalid of [
    "{broken",
    "null",
    "[]",
    '{"statusLine":{"type":"unknown"}}',
  ]) {
    writeFileSync(path, invalid);
    assert.throws(() => connectClaude(resolve("."), root, config));
    assert.equal(readFileSync(path, "utf8"), invalid);
  }
});

test("an intentionally empty existing status line stays empty", () => {
  const { root, config, path } = setupFixture();
  writeFileSync(
    path,
    JSON.stringify({
      statusLine: { type: "command", command: 'node -e "process.exit(0)"' },
    }),
  );
  connectClaude(resolve("."), root, config);
  const command = JSON.parse(readFileSync(path, "utf8")).statusLine.command;
  const result = spawnSync(command, {
    shell: true,
    encoding: "utf8",
    input: "{}",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});
