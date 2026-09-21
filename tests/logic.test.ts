import { test } from "node:test";
import assert from "node:assert/strict";
import { adaptUsage } from "../src/main/codex/usageAdapter";
import { priority, resetIn } from "../src/shared/format";
import { validateSettings, migrateSettings } from "../src/main/settings";
import { defaults } from "../src/shared/types";
import {
  pillSize,
  pinnedPosition,
  hasGrip,
  pinOffsetForDrag,
} from "../src/shared/pill";
import { trayLevels, orderedQuotas } from "../src/shared/quotas";
import { collectAlerts } from "../src/main/notifications";
import { nearAnchor, clampBounds, snapBounds } from "../src/main/positioning";
const raw = (used = 32) => ({
  rateLimits: {
    primary: {
      usedPercent: used,
      windowDurationMins: 300,
      resetsAt: 2000000000,
    },
    secondary: {
      usedPercent: 72,
      windowDurationMins: 10080,
      resetsAt: 2000500000,
    },
  },
});
test("new users get setup and deliberate, click-only switching", () => {
  const settings = migrateSettings(null);
  assert.equal(settings.setupCompleted, false);
  assert.equal(settings.pillSwitchSeconds, 0);
});
test("dual indicators keep quota identity instead of urgency ordering", () => {
  const windows = adaptUsage(raw(90)).windows.reverse();
  assert.deepEqual(trayLevels(windows), [1, 3]);
  assert.equal(orderedQuotas(windows)[0].id, "five-hour");
  assert.deepEqual(
    trayLevels(windows.filter((w) => w.id === "weekly")),
    [-1, 3],
  );
});
test("pins use work area and leave free positions untouched", () => {
  const area = { x: -1920, y: 40, width: 1920, height: 1040 };
  const settings = {
    ...defaults,
    pillPosition: { x: -700, y: 800 },
    pillPlacement: "top-right" as const,
  };
  const position = pinnedPosition(settings, area);
  assert.equal(position.x, area.x + area.width - pillSize(settings).width - 12);
  assert.equal(position.y, 52);
  assert.equal(hasGrip(settings), true);
  assert.deepEqual(
    pinnedPosition({ ...settings, pillPlacement: "free" }, area),
    { x: -700, y: 800 },
  );
});
test("indicator-only rings and side bars have compact native geometry", () => {
  assert.deepEqual(
    pillSize({
      ...defaults,
      pillContent: "indicator",
      pillShowDragHandle: false,
    }),
    { width: 44, height: 40 },
  );
  assert.deepEqual(
    pillSize({
      ...defaults,
      pillContent: "indicator",
      pillPlacement: "left",
      pillIndicator: "bar",
    }),
    { width: 36, height: 132 },
  );
  assert.deepEqual(
    pillSize({
      ...defaults,
      pillContent: "indicator",
      pillPlacement: "right",
      pillIndicator: "ring",
      pillLayout: "both",
      pillBothStyle: "combined",
    }),
    { width: 44, height: 64 },
  );
});
test("legacy installs migrate once without reopening setup", () => {
  const settings = migrateSettings({
    pillSwitchSeconds: 3,
    pillLayout: "both",
    floatingPillEnabled: false,
  });
  assert.equal(settings.setupCompleted, true);
  assert.equal(settings.pillSwitchSeconds, 0);
  assert.equal(settings.pillLayout, "both");
  assert.equal(settings.floatingPillEnabled, false);
  const optedIn = migrateSettings({ ...settings, pillSwitchSeconds: 5 });
  assert.equal(optedIn.pillSwitchSeconds, 5);
});
test("legacy static icons become meters and pinned dragging stays on its edge", () => {
  assert.equal(migrateSettings({ trayStyle: "logo" }).trayStyle, "meter");
  const area = { x: -1200, y: 20, width: 1200, height: 800 };
  const settings = {
    ...defaults,
    pillPlacement: "left" as const,
    pillPosition: { x: 200, y: 300 },
  };
  const offset = pinOffsetForDrag(settings, { x: 500, y: 450 }, area);
  const p = pinnedPosition({ ...settings, pillPinOffset: offset }, area);
  assert.equal(p.x, -1188);
  assert.equal(p.y, 450);
  assert.deepEqual(settings.pillPosition, { x: 200, y: 300 });
  assert.equal(pinOffsetForDrag(settings, { x: 500, y: -100 }, area), 0);
  assert.equal(pinOffsetForDrag(settings, { x: 500, y: 2000 }, area), 1);
});
test("interrupted setup stays pending on next launch", () => {
  assert.equal(
    migrateSettings({ ...defaults, pillShowReset: true }).setupCompleted,
    false,
  );
});
test("pill size matches optional countdown and refresh affordances", () => {
  assert.deepEqual(
    pillSize({
      ...defaults,
      pillLayout: "both",
      pillIndicator: "bar",
      pillShowReset: true,
      pillShowRefresh: true,
    }),
    { width: 316, height: 68 },
  );
  assert.deepEqual(pillSize({ ...defaults, pillShowReset: true }), {
    width: 176,
    height: 62,
  });
});
test("new preferences validate narrowly; internal setup fields cannot be changed through updateSettings", () => {
  assert.deepEqual(
    validateSettings({
      pillShowReset: true,
      pillShowRefresh: true,
      trayStyle: "meter",
      setupCompleted: true,
      settingsVersion: 99,
    }),
    { pillShowReset: true, pillShowRefresh: true, trayStyle: "meter" },
  );
  assert.deepEqual(
    validateSettings({ pillShowReset: "yes", trayStyle: "file://bad" }),
    {},
  );
});
test("remaining percentage and seconds to milliseconds", () => {
  const w = adaptUsage(raw()).windows[0];
  assert.equal(w.remainingPercent, 68);
  assert.equal(w.resetsAt, 2000000000000);
});
test("clamps both ends and handles unknown percentages", () => {
  assert.equal(adaptUsage(raw(-3)).windows[0].remainingPercent, 100);
  assert.equal(adaptUsage(raw(104)).windows[0].remainingPercent, 0);
  assert.equal(adaptUsage(raw(NaN)).windows[0].remainingPercent, null);
});
test("most urgent quota first without mutating", () => {
  const windows = adaptUsage(raw(28)).windows;
  assert.equal(priority(windows)[0].id, "weekly");
  assert.equal(windows[0].id, "five-hour");
});
test("reset formatting and expired resets", () => {
  assert.equal(resetIn(45 * 60000, 0), "45m");
  assert.equal(resetIn(135 * 60000, 0), "2h 15m");
  assert.equal(resetIn(28 * 3600000, 0), "1d 4h");
  assert.equal(resetIn(0, 1), "soon");
});
test("single and missing windows are preserved without empty placeholders", () => {
  for (const slot of ["primary", "secondary"] as const) {
    const r = raw();
    const s = { ...r.rateLimits, [slot]: null };
    assert.equal(adaptUsage({ rateLimits: s }).windows.length, 1);
  }
  assert.deepEqual(
    adaptUsage({ rateLimits: { primary: null, secondary: null } }).windows,
    [],
  );
});
test("prefers the codex bucket and rejects malformed root", () => {
  assert.equal(
    adaptUsage({ ...raw(), rateLimitsByLimitId: { codex: raw(80).rateLimits } })
      .windows[0].remainingPercent,
    20,
  );
  assert.throws(() => adaptUsage(null as never));
});
test("settings reject unexpected or invalid fields", () => {
  assert.deepEqual(
    validateSettings({
      pillLayout: "both",
      pillIndicator: "bar",
      pillSwitchSeconds: 0,
      accentColor: "mint",
    }),
    {
      pillLayout: "both",
      pillIndicator: "bar",
      pillSwitchSeconds: 0,
      accentColor: "mint",
    },
  );
  assert.deepEqual(
    validateSettings({
      pillLayout: "grid",
      pillIndicator: "sparkline",
      pillSwitchSeconds: -1,
      accentColor: "url(bad)",
    }),
    {},
  );
  assert.deepEqual(
    validateSettings({
      refreshIntervalSeconds: 1,
      launchAtStartup: "yes",
      exec: "bad",
      pillPosition: { x: Infinity, y: 0 },
    }),
    {},
  );
  assert.deepEqual(
    validateSettings({
      refreshIntervalSeconds: 300,
      notificationsEnabled: true,
    }),
    { refreshIntervalSeconds: 300, notificationsEnabled: true },
  );
});
test("alerts deduplicate thresholds within a reset cycle", () => {
  const ledger = {};
  assert.equal(collectAlerts(adaptUsage(raw(80)), ledger).length, 1);
  assert.equal(collectAlerts(adaptUsage(raw(81)), ledger).length, 0);
  assert.equal(collectAlerts(adaptUsage(raw(91)), ledger).length, 1);
  assert.equal(collectAlerts(adaptUsage(raw(96)), ledger).length, 0);
  assert.equal(collectAlerts(adaptUsage(raw(97)), ledger).length, 0);
  const r = raw(97);
  r.rateLimits.primary.resetsAt++;
  assert.equal(collectAlerts(adaptUsage(r), ledger).length, 0);
  assert.equal(collectAlerts(adaptUsage(raw(100)), ledger).length, 1);
  assert.equal(collectAlerts(adaptUsage(raw(100)), ledger).length, 0);
});
test("exhaustion survives reset drift, restart and overdue reports; recovery rearms", () => {
  let ledger = {};
  const report = (used: number, reset: number) => {
    const r = raw(used);
    r.rateLimits.primary.resetsAt = reset;
    return adaptUsage(r);
  };
  assert.equal(
    collectAlerts(report(100, 2000000000), ledger, 1999990000000).length,
    1,
  );
  ledger = JSON.parse(JSON.stringify(ledger));
  assert.equal(
    collectAlerts(report(100, 2000001000), ledger, 2000000001000).length,
    0,
  );
  assert.equal(
    collectAlerts(report(10, 2000020000), ledger, 2000000002000).length,
    0,
  );
  assert.equal(
    collectAlerts(report(75, 2000020000), ledger, 2000000003000).length,
    1,
  );
  assert.equal(
    collectAlerts(report(90, 2000020000), ledger, 2000000004000).length,
    1,
  );
  assert.equal(
    collectAlerts(report(100, 2000020000), ledger, 2000000005000).length,
    1,
  );
});
test("free pill snaps to sides and top center on negative-coordinate displays", () => {
  const area = { x: -1920, y: 40, width: 1920, height: 1040 };
  const rect = { x: -1910, y: 400, width: 176, height: 44 };
  assert.equal(snapBounds(rect, area).x, -1908);
  assert.equal(snapBounds({ ...rect, x: -180 }, area).x, -188);
  assert.deepEqual(snapBounds({ ...rect, x: -1060, y: 60 }, area), {
    ...rect,
    x: -1048,
    y: 52,
  });
  assert.deepEqual(snapBounds({ ...rect, x: -800 }, area), {
    ...rect,
    x: -800,
  });
});
test("positions above bottom taskbar and clamps negative-coordinate monitors", () => {
  const area = { x: -1920, y: 0, width: 1920, height: 1040 };
  const p = nearAnchor(
    { x: -40, y: 1040, width: 20, height: 40 },
    320,
    270,
    area,
  );
  assert.equal(p.y, 762);
  assert.equal(p.x, -340);
  assert.equal(
    clampBounds({ x: 20, y: 2000, width: 204, height: 44 }, area).x,
    -204,
  );
});
