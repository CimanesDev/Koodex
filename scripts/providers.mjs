import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { getPage, openPopover, openSettings } from "./windows.mjs";

mkdirSync(".smoke-data", { recursive: true });
mkdirSync("test-results/providers", { recursive: true });
const directory = mkdtempSync(resolve(".smoke-data", "providers-"));
writeFileSync(
  join(directory, "settings.json"),
  JSON.stringify({
    settingsVersion: 2,
    setupCompleted: true,
    monitorBoth: true,
    pillShortcut: "CommandOrControl+Shift+K",
  }),
);
const report = (used) =>
  writeFileSync(
    join(directory, "claude-usage.json"),
    JSON.stringify({
      receivedAt: Date.now(),
      rate_limits: {
        five_hour: {
          used_percentage: used,
          resets_at: (Date.now() + 9000000) / 1000,
        },
        seven_day: {
          used_percentage: 25,
          resets_at: (Date.now() + 302400000) / 1000,
        },
      },
    }),
  );
report(30);
const env = {
  ...process.env,
  KOODEX_MOCK: "normal",
  KOODEX_TEST_DATA: directory,
};
delete env.ELECTRON_RUN_AS_NODE;
const executable = process.argv.find((arg) => arg.startsWith("--exe="))?.slice(6);
const app = await electron.launch({
  ...(executable ? { executablePath: resolve(executable), args: [] } : { args: ["."] }),
  env,
});
const errors = [];
app.on("window", (page) => page.on("pageerror", (e) => errors.push(e.message)));
try {
  const pill = await getPage(app, "pill");
  const update = (patch) =>
    pill.evaluate((p) => window.Koodex.updateSettings(p), patch);
  await expect(pill.locator(".provider-pill-row")).toHaveCount(2);
  await expect
    .poll(() =>
      pill.evaluate(
        async () => (await window.Koodex.getUsage()).companion?.syncState,
      ),
    )
    .toBe("synced");
  const combinations = [];
  for (const placement of ["free", "left", "right"]) {
    for (const content of ["details", "indicator"]) {
      for (const indicator of ["ring", "bar"]) {
        for (const style of ["single", "separate", "combined"]) {
          combinations.push({
            pillPlacement: placement,
            pillContent: content,
            pillIndicator: indicator,
            pillLayout: style === "single" ? "alternating" : "both",
            pillBothStyle: style === "combined" ? "combined" : "separate",
            pillShowReset: true,
            pillShowDragHandle: true,
            pillShowRefresh: true,
            pillSideHideable: false,
          });
        }
      }
    }
  }
  for (const patch of combinations) {
    await update(patch);
    await expect
      .poll(
        () =>
          pill.evaluate(() => {
            const root = document.querySelector(".pill-multi");
            if (!root) return false;
            const outer = root.getBoundingClientRect();
            return (
              [
                ...document.querySelectorAll(
                  ".provider-pill-row > .pill, .provider-pill-label",
                ),
              ].every((el) => {
                const r = el.getBoundingClientRect();
                return (
                  r.left >= outer.left - 1 &&
                  r.top >= outer.top - 1 &&
                  r.right <= outer.right + 1 &&
                  r.bottom <= outer.bottom + 1
                );
              }) &&
              outer.width <= innerWidth + 1 &&
              outer.height <= innerHeight + 1
            );
          }),
        { message: JSON.stringify(patch) },
      )
      .toBe(true);
  }
  await update({
    pillPlacement: "free",
    pillContent: "details",
    pillIndicator: "ring",
    pillLayout: "both",
    pillBothStyle: "separate",
  });
  await pill.screenshot({ path: "test-results/providers/pill-horizontal.png" });
  await update({ pillPlacement: "left" });
  await pill.screenshot({ path: "test-results/providers/pill-vertical.png" });
  await update({ pillSideHideable: true });
  await pill.getByRole("button", { name: "Show usage pill" }).click();
  await expect(pill.locator(".dock-tab")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await pill.getByRole("button", { name: "Hide usage pill" }).click();
  await expect.poll(() => pill.evaluate(() => innerWidth)).toBe(32);
  await update({
    pillPlacement: "free",
    pillSideHideable: false,
    pillLayout: "alternating",
  });
  const firstProvider = pill
    .locator(".provider-pill-row")
    .first()
    .getByRole("button", { name: "Switch usage limit" });
  const before = await firstProvider.innerText();
  await firstProvider.click();
  assert.notEqual(await firstProvider.innerText(), before);

  // A local Claude update must not interrupt Codex or replace its identity.
  report(60);
  await expect
    .poll(() =>
      pill.evaluate(
        async () =>
          (await window.Koodex.getUsage()).companion?.usage?.windows[0]
            .remainingPercent,
      ),
    )
    .toBe(40);
  await update({ provider: "claude" });
  const state = await pill.evaluate(() => window.Koodex.getUsage());
  assert.equal(state.provider, "claude");
  assert.equal(state.companion.provider, "codex");
  await expect(pill.locator(".provider-pill-label")).toHaveText([
    "Codex",
    "Claude",
  ]);
  const popover = await openPopover(app);
  await expect(popover.locator(".provider-usage")).toHaveCount(2);
  await expect(popover.locator(".pace-estimate").first()).toBeVisible();
  await expect.poll(() => popover.evaluate(() => innerHeight)).toBe(520);
  await popover.screenshot({ path: "test-results/providers/details.png" });
  const panel = await popover
    .locator(".usage-panel")
    .evaluate((el) => ({ height: el.clientHeight, scroll: el.scrollHeight }));
  assert.ok(panel.height <= 520 && panel.scroll >= panel.height);
  writeFileSync(join(directory, "claude-usage.json"), "{}");
  await expect(
    popover.getByLabel("Claude Code connection diagnostics"),
  ).toBeVisible();
  assert.equal(
    (await popover.evaluate(() => window.Koodex.getUsage())).companion
      .syncState,
    "synced",
  );
  await popover.getByRole("button", { name: "Reconnect Claude Code" }).click();
  await popover.screenshot({ path: "test-results/providers/diagnostics.png" });

  const prefs = await openSettings(app, popover);
  await prefs.getByRole("button", { name: "General", exact: true }).click();
  // Force a deterministic collision without touching any other application's shortcuts.
  await app.evaluate(({ globalShortcut }) => {
    globalThis.originalRegister = globalShortcut.register.bind(globalShortcut);
    globalShortcut.register = (key, callback) =>
      key === "CommandOrControl+Alt+K"
        ? false
        : globalThis.originalRegister(key, callback);
  });
  await prefs
    .getByLabel("Toggle pill shortcut")
    .selectOption("CommandOrControl+Alt+K");
  await expect(prefs.getByRole("alert").first()).toContainText(
    "already in use",
  );
  assert.equal(
    await app.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered("CommandOrControl+Shift+K"),
    ),
    true,
  );
  await prefs.getByLabel("Toggle pill shortcut").selectOption("off");
  assert.equal(
    await app.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered("CommandOrControl+Shift+K"),
    ),
    false,
  );
  await app.evaluate(({ globalShortcut }) => {
    globalShortcut.register = (key, callback) => {
      globalThis.testShortcut = callback;
      return globalThis.originalRegister(key, callback);
    };
  });
  await prefs
    .getByLabel("Toggle pill shortcut")
    .selectOption("CommandOrControl+Shift+K");
  await app.evaluate(() => globalThis.testShortcut());
  await expect
    .poll(() =>
      prefs.evaluate(
        async () => (await window.Koodex.getSettings()).floatingPillEnabled,
      ),
    )
    .toBe(false);
  await app.evaluate(() => globalThis.testShortcut());
  await expect
    .poll(() =>
      prefs.evaluate(
        async () => (await window.Koodex.getSettings()).floatingPillEnabled,
      ),
    )
    .toBe(true);
  await prefs.evaluate(() =>
    window.Koodex.updateSettings({ monitorBoth: false }),
  );
  await expect
    .poll(() =>
      prefs.evaluate(
        async () => (await window.Koodex.getUsage()).companion === undefined,
      ),
    )
    .toBe(true);
  assert.equal(
    JSON.parse(readFileSync(join(directory, "settings.json"), "utf8"))
      .pillShortcut,
    "CommandOrControl+Shift+K",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Passed 36 dual-provider layouts, independent updates, diagnostics, quota switching, side tabs, shortcut conflicts/toggle and persistence.",
  );
} catch (error) {
  const page = app.windows().find((p) => p.url().includes("view=pill"));
  if (page) {
    await page.screenshot({ path: "test-results/providers/failure.png" });
    console.log(
      await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            ".pill, .provider-pill-label, .multi-provider-content",
          ),
        ].map((el) => ({
          classes: el.className,
          bounds: el.getBoundingClientRect().toJSON(),
        })),
      ),
    );
  }
  throw error;
} finally {
  await app.close();
}
