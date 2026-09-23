import { test } from "node:test";
import assert from "node:assert/strict";
import { UsageMonitor } from "../src/main/UsageMonitor";
import { PillShortcut } from "../src/main/shortcuts";
import { connectionDiagnostic, paceEstimate } from "../src/shared/insights";
import { migrateSettings, validateSettings } from "../src/main/settings";
import { defaults, type Snapshot, type UsageWindow } from "../src/shared/types";

const initial: Snapshot = {
  provider: "codex",
  usage: null,
  syncState: "offline",
};
const fresh: Snapshot = {
  ...initial,
  usage: { fetchedAt: 1000, windows: [] },
  syncState: "synced",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("provider loops are independent and discard reads from a previous activation", async () => {
  const old = deferred<Snapshot>();
  const updates: Snapshot[] = [];
  let calls = 0;
  const codex = new UsageMonitor(
    initial,
    () => (++calls === 1 ? old.promise : fresh),
    (s) => updates.push(s),
    () => 60000,
    async () => "offline",
  );
  const claude = new UsageMonitor(
    { ...initial, provider: "claude" },
    () => ({ ...fresh, provider: "claude" }),
    () => {},
    () => 60000,
    async () => "offline",
  );
  try {
    codex.setActive(true);
    claude.setActive(true);
    await settle();
    assert.equal(
      claude.snapshot.syncState,
      "synced",
      "a slow Codex read cannot block Claude",
    );
    codex.setActive(false);
    codex.setActive(true);
    old.resolve({ ...fresh, error: "obsolete" });
    await settle();
    assert.equal(calls, 2);
    assert.equal(codex.snapshot.syncState, "synced");
    assert.ok(updates.every((s) => s.error !== "obsolete"));
  } finally {
    codex.setActive(false);
    claude.setActive(false);
  }
});

test("refresh bursts coalesce; disabling before a deferred read prevents I/O", async () => {
  const pending = deferred<Snapshot>();
  let calls = 0;
  const monitor = new UsageMonitor(
    initial,
    () => (++calls === 1 ? pending.promise : fresh),
    () => {},
    () => 60000,
    async () => "offline",
  );
  monitor.setActive(true);
  monitor.setActive(false);
  await settle();
  assert.equal(calls, 0);
  try {
    monitor.setActive(true);
    await settle();
    for (let i = 0; i < 10; i++) void monitor.refresh();
    pending.resolve(fresh);
    await settle();
    assert.equal(calls, 2);
    monitor.setActive(false);
    await monitor.refresh();
    assert.equal(calls, 2);
  } finally {
    monitor.setActive(false);
  }
});

test("failed reads retain saved data and back off, then recover", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const monitor = new UsageMonitor(
    fresh,
    () => {
      calls++;
      if (calls <= 2) throw new Error("offline");
      return fresh;
    },
    () => {},
    () => 60000,
    async () => {
      throw new Error("cleanup failed");
    },
  );
  try {
    monitor.setActive(true);
    await settle();
    assert.equal(monitor.snapshot.syncState, "stale");
    assert.equal(monitor.snapshot.usage, fresh.usage);
    assert.equal(monitor.snapshot.error, "offline");
    t.mock.timers.tick(4999);
    await settle();
    assert.equal(calls, 1);
    t.mock.timers.tick(1);
    await settle();
    assert.equal(calls, 2);
    t.mock.timers.tick(9999);
    await settle();
    assert.equal(calls, 2);
    t.mock.timers.tick(1);
    await settle();
    assert.equal(calls, 3);
    assert.equal(monitor.snapshot.syncState, "synced");
    assert.equal(monitor.snapshot.error, undefined);
    monitor.setActive(false);
    t.mock.timers.tick(600000);
    await settle();
    assert.equal(calls, 3);
  } finally {
    monitor.setActive(false);
  }
});

test("deactivating during error cleanup cannot publish an obsolete failure", async () => {
  const cleanup = deferred<string>();
  const updates: Snapshot[] = [];
  const monitor = new UsageMonitor(
    initial,
    () => {
      throw new Error("old");
    },
    (s) => updates.push(s),
    () => 60000,
    () => cleanup.promise,
  );
  monitor.setActive(true);
  await settle();
  monitor.setActive(false);
  cleanup.resolve("old");
  await settle();
  assert.ok(updates.every((s) => !s.error));
});

test("shortcut conflicts keep the existing shortcut; disabling unregisters it", () => {
  const callbacks = new Map<string, () => void>();
  let toggles = 0;
  const registry = {
    register: (key: string, callback: () => void) => {
      if (key.includes("Alt")) return false;
      callbacks.set(key, callback);
      return true;
    },
    unregister: (key: string) => {
      callbacks.delete(key);
    },
  };
  const shortcut = new PillShortcut(registry, () => {
    toggles++;
  });
  shortcut.set("CommandOrControl+Shift+K");
  callbacks.get("CommandOrControl+Shift+K")!();
  assert.equal(toggles, 1);
  assert.throws(() => shortcut.set("CommandOrControl+Alt+K"), /already in use/);
  assert.equal(callbacks.size, 1);
  assert.ok(callbacks.has("CommandOrControl+Shift+K"));
  shortcut.set("off");
  assert.equal(callbacks.size, 0);
  assert.equal(shortcut.error, "");
});

test("new options preserve migration defaults and reject invalid input", () => {
  const migrated = migrateSettings({
    settingsVersion: 2,
    setupCompleted: true,
  });
  assert.equal(migrated.monitorBoth, false);
  assert.equal(migrated.pillShortcut, "off");
  assert.deepEqual(
    validateSettings({
      monitorBoth: true,
      pillShortcut: "CommandOrControl+Alt+K",
    }),
    { monitorBoth: true, pillShortcut: "CommandOrControl+Alt+K" },
  );
  assert.deepEqual(
    validateSettings({ monitorBoth: "yes", pillShortcut: "Alt+F4" }),
    {},
  );
  assert.equal(defaults.monitorBoth, false);
});

test("diagnostics distinguish sign-in, missing CLI, cached data and Claude setup", () => {
  assert.match(
    connectionDiagnostic({ ...initial, error: "Codex not found" })!.title,
    /CLI not found/,
  );
  assert.match(
    connectionDiagnostic({ ...initial, error: "Sign in to Codex first" })!
      .title,
    /sign-in/,
  );
  assert.equal(
    connectionDiagnostic({ ...fresh, syncState: "stale" })!.title,
    "Showing saved usage",
  );
  assert.equal(
    connectionDiagnostic({
      ...initial,
      provider: "claude",
      syncState: "error",
    })!.action,
    "reconnect",
  );
  assert.equal(
    connectionDiagnostic({ ...initial, provider: "claude" })!.action,
    "reconnect",
  );
  assert.equal(
    connectionDiagnostic({ ...initial, syncState: "connecting" }),
    null,
  );
});

test("pace estimates require fresh, consistent windows and remain explicitly approximate", () => {
  const now = 2000000000000;
  const quota: UsageWindow = {
    id: "five-hour",
    label: "5-hour",
    usedPercent: 20,
    remainingPercent: 80,
    windowMinutes: 300,
    resetsAt: now + 150 * 60000,
  };
  const state: Snapshot = {
    provider: "codex",
    usage: { fetchedAt: now, windows: [quota] },
    syncState: "synced",
  };
  assert.equal(
    paceEstimate(quota, state, now),
    "Window-average estimate: ~60% left at reset",
  );
  assert.match(
    paceEstimate(
      { ...quota, usedPercent: 80, remainingPercent: 20 },
      state,
      now,
    )!,
    /may run out/,
  );
  for (const change of [
    { resetsAt: now },
    { usedPercent: null },
    { usedPercent: 100 },
    { windowMinutes: null },
    { resetsAt: now + 299 * 60000 },
  ])
    assert.equal(paceEstimate({ ...quota, ...change }, state, now), null);
  assert.equal(
    paceEstimate(quota, { ...state, syncState: "stale" }, now),
    null,
  );
  assert.equal(paceEstimate(quota, state, now + 600001), null);
  assert.equal(
    paceEstimate(quota, { ...state, provider: "claude" }, now + 60001),
    null,
  );
});
