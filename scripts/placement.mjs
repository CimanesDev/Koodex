import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { getPage, openSettings } from "./windows.mjs";
mkdirSync(".smoke-data", { recursive: true });
const directory = mkdtempSync(resolve(".smoke-data", "placement-"));
writeFileSync(
  join(directory, "settings.json"),
  JSON.stringify({
    settingsVersion: 2,
    setupCompleted: true,
    pillPosition: { x: 250, y: 180 },
  }),
);
const env = {
  ...process.env,
  KOODEX_MOCK: "normal",
  KOODEX_TEST_DATA: directory,
};
delete env.ELECTRON_RUN_AS_NODE;
const executable = process.argv.find((a) => a.startsWith("--exe="))?.slice(6);
const app = await electron.launch({
  ...(executable
    ? { executablePath: resolve(executable), args: [] }
    : { args: ["."] }),
  env,
});
try {
  const pill = await getPage(app, "pill");
  const prefs = await openSettings(app, pill);
  await expect(pill.locator(".metric")).toBeVisible();
  const update = (patch) =>
    pill.evaluate((patch) => window.Koodex.updateSettings(patch), patch);
  const bounds = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("view=pill"))
        .getBounds(),
    );
  await prefs.evaluate(() => window.Koodex.openSettings());
  await prefs
    .getByRole("button", { name: "Both limits Always visible" })
    .click();
  await prefs
    .getByRole("button", { name: "Nested rings", exact: true })
    .click();
  await prefs
    .getByRole("button", { name: "Indicator only", exact: true })
    .click();
  await prefs.getByRole("button", { name: "Placement", exact: true }).click();
  await prefs
    .getByLabel("Placement", { exact: true })
    .selectOption("top-right");
  await expect(pill.locator(".dual-ring")).toBeVisible();
  await expect(pill.locator(".drag-handle")).toHaveCount(1);
  const area = await app.evaluate(
    ({ screen }) => screen.getPrimaryDisplay().workArea,
  );
  const pinned = await bounds();
  assert.ok(
    Math.abs(pinned.x - (area.x + area.width - pinned.width - 12)) <= 1,
  );
  assert.ok(Math.abs(pinned.y - (area.y + 12)) <= 1);
  await prefs.screenshot({
    path: "assets/screenshots/preferences-placement.png",
  });
  // Dispatch the native drag event: the visible grip must move along its pinned edge.
  const dragged = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("view=pill"),
    );
    const b = w.getBounds();
    let prevented = false;
    w.emit(
      "will-move",
      {
        preventDefault() {
          prevented = true;
        },
      },
      { ...b, x: b.x - 80, y: b.y + 80 },
    );
    return { prevented, bounds: w.getBounds() };
  });
  assert.equal(dragged.prevented, true);
  assert.ok(Math.abs(dragged.bounds.x - (pinned.x - 80)) <= 1);
  assert.equal(dragged.bounds.y, pinned.y);
  assert.equal(
    (await pill.evaluate(() => window.Koodex.getSettings())).pillPlacement,
    "top-right",
  );
  let combinations = 0;
  for (const pillPlacement of ["free", "left", "right", "top-center"]) {
    for (const pillContent of ["details", "indicator"]) {
      for (const pillIndicator of ["ring", "bar"]) {
        for (const pillBothStyle of ["separate", "combined"]) {
          for (const pillLayout of ["both", "alternating"]) {
            await update({
              pillPlacement,
              pillContent,
              pillIndicator,
              pillBothStyle,
              pillLayout,
              pillShowReset: true,
              pillShowRefresh: true,
            });
            await expect(pill.locator(".pill")).toHaveClass(
              new RegExp(`pill-${pillIndicator}`),
            );
            // Native geometry and renderer commit independently over IPC.
            await expect
              .poll(async () => {
                const native = await bounds();
                return pill.locator(".pill").evaluate((el, native) => {
                  const rect = el.getBoundingClientRect();
                  return (
                    Math.abs(rect.height - native.height) < 2 &&
                    Math.abs(rect.width - native.width) < 2
                  );
                }, native);
              })
              .toBe(true);
            const clipped = await pill.locator(".pill").evaluate((el) => {
              const parent = el.getBoundingClientRect();
              return [
                ...el.querySelectorAll(
                  ".ring, .dual-ring, .bar, .metric, .pill-reset, .pill-refresh",
                ),
              ]
                .filter((child) => {
                  const r = child.getBoundingClientRect();
                  return (
                    r.width &&
                    r.height &&
                    (r.left < parent.left - 1 ||
                      r.top < parent.top - 1 ||
                      r.right > parent.right + 1 ||
                      r.bottom > parent.bottom + 1)
                  );
                })
                .map((child) => child.className.baseVal ?? child.className);
            });
            assert.deepEqual(
              clipped,
              [],
              JSON.stringify({
                pillPlacement,
                pillContent,
                pillIndicator,
                pillBothStyle,
                pillLayout,
              }),
            );
            combinations++;
          }
        }
      }
    }
  }
  await update({ pillPlacement: "free", pillShowDragHandle: false });
  await expect(pill.locator(".drag-handle")).toHaveCount(0);
  assert.equal((await bounds()).x, 250);
  assert.equal((await bounds()).y, 180);
  await prefs.getByRole("button", { name: "General", exact: true }).click();
  await prefs.getByLabel("Refresh interval").selectOption("10");
  assert.equal(
    (await pill.evaluate(() => window.Koodex.getSettings()))
      .refreshIntervalSeconds,
    10,
  );
  await prefs.getByRole("button", { name: "Providers", exact: true }).click();
  await prefs.getByLabel("Provider", { exact: true }).selectOption("claude");
  await expect
    .poll(
      async () =>
        (await pill.evaluate(() => window.Koodex.getUsage())).provider,
    )
    .toBe("claude");
  assert.equal(
    (await pill.evaluate(() => window.Koodex.getUsage())).usage,
    null,
  );
  await prefs.getByRole("button", { name: "Prepare Claude bridge" }).click();
  await expect(
    prefs.getByLabel("Claude status-line configuration"),
  ).toHaveValue(/statusLine/);
  const send = (amount) =>
    spawnSync(process.execPath, [join(directory, "claude-bridge.cjs")], {
      input: JSON.stringify({
        rate_limits: {
          five_hour: {
            used_percentage: amount,
            resets_at: Date.now() / 1000 + 3600,
          },
        },
      }),
      encoding: "utf8",
    });
  assert.equal(send(23).status, 0);
  await expect
    .poll(
      async () =>
        (await pill.evaluate(() => window.Koodex.getUsage())).usage?.windows[0]
          ?.remainingPercent,
      { timeout: 4000 },
    )
    .toBe(77);
  await expect(prefs.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "77",
  );
  send(51);
  await expect
    .poll(
      async () =>
        (await pill.evaluate(() => window.Koodex.getUsage())).usage?.windows[0]
          ?.remainingPercent,
      { timeout: 4000 },
    )
    .toBe(49);
  await expect(prefs.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "49",
  );
  const timestamp = (await pill.evaluate(() => window.Koodex.getUsage())).usage
    .fetchedAt;
  await pill.evaluate(() => window.Koodex.refreshUsage());
  assert.equal(
    (await pill.evaluate(() => window.Koodex.getUsage())).usage.fetchedAt,
    timestamp,
  );
  await prefs.getByLabel("Provider", { exact: true }).selectOption("codex");
  await expect
    .poll(
      async () =>
        (await pill.evaluate(() => window.Koodex.getUsage())).provider,
    )
    .toBe("codex");
  await update({
    pillLayout: "both",
    pillBothStyle: "combined",
    pillContent: "indicator",
    pillIndicator: "bar",
    pillPlacement: "top-center",
    pillShowRefresh: false,
  });
  await expect(pill.locator(".dual-bars")).toBeVisible();
  await pill.screenshot({
    path: "assets/screenshots/pill-dual-bars.png",
    omitBackground: true,
  });
  await update({ pillIndicator: "ring" });
  await expect(pill.locator(".dual-ring")).toBeVisible();
  await pill.screenshot({
    path: "assets/screenshots/pill-dual-ring.png",
    omitBackground: true,
  });
  await update({
    pillIndicator: "bar",
    pillPlacement: "left",
    pillShowDragHandle: true,
  });
  await expect(pill.locator(".dual-bars-vertical")).toBeVisible();
  const barRects = await pill.locator(".dual-bars .bar").evaluateAll((bars) =>
    bars.map((bar) => {
      const r = bar.getBoundingClientRect();
      return { width: r.width, height: r.height, x: r.x, y: r.y };
    }),
  );
  assert.ok(barRects.every((r) => r.height > r.width * 5));
  assert.ok(barRects[0].x < barRects[1].x && barRects[0].y === barRects[1].y);
  await pill.screenshot({
    path: "assets/screenshots/pill-side-bars.png",
    omitBackground: true,
  });
  console.log(
    `Passed ${combinations} layouts, native pinning, free position restore, hidden grip, live setting, Claude bridge events and provider isolation.`,
  );
} finally {
  await app.close();
}
