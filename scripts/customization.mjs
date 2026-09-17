import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdirSync, mkdtempSync } from "node:fs";
import { getPage, openSettings, visible } from "./windows.mjs";
const executable = process.argv.find((a) => a.startsWith("--exe="))?.slice(6);
mkdirSync(".smoke-data", { recursive: true });
const directory = mkdtempSync(resolve(".smoke-data", "onboarding-"));
const env = {
  ...process.env,
  KOODEX_MOCK: "normal",
  KOODEX_TEST_DATA: directory,
};
delete env.ELECTRON_RUN_AS_NODE;
const launch = () =>
  electron.launch({
    ...(executable
      ? { executablePath: resolve(executable), args: [] }
      : { args: ["."] }),
    env,
  });
const app = await launch();
try {
  let prefs = await getPage(app, "settings");
  await expect(prefs.getByRole("heading", { name: "Koodex" })).toBeVisible();
  await expect.poll(() => visible(app, "settings")).toBe(true);
  assert.equal(await visible(app, "pill"), false);
  await expect(prefs.getByLabel("Switch limits")).toHaveValue("0");
  await expect(prefs.getByRole("button", { name: /Back/ })).toHaveCount(0);
  await prefs
    .getByRole("switch", { name: "Reset countdown", exact: true })
    .check();
  await prefs
    .getByRole("switch", { name: "Quick refresh", exact: true })
    .check();
  await expect(prefs.locator(".pill-reset")).toContainText("Resets in");
  const beforePreview = (await prefs.evaluate(() => window.Koodex.getUsage()))
    .usage.fetchedAt;
  await prefs.getByRole("button", { name: "Refresh live preview" }).click();
  await expect(
    prefs.getByRole("button", { name: "Refresh live preview" }),
  ).toBeEnabled();
  await expect
    .poll(
      async () =>
        (await prefs.evaluate(() => window.Koodex.getUsage())).usage.fetchedAt,
    )
    .toBeGreaterThan(beforePreview);
  const live = await prefs.evaluate(() => window.Koodex.getUsage());
  await expect(prefs.locator(".metric")).toContainText(
    `${Math.round(live.usage.windows.find((w) => w.id === "weekly").remainingPercent)}%`,
  );
  await expect(prefs.getByText("Made by cimanesdev")).toBeVisible();
  await prefs.getByRole("button", { name: "Start Koodex" }).click();
  await expect.poll(() => visible(app, "pill")).toBe(true);
  const pill = await getPage(app, "pill");
  assert.equal(await visible(app, "settings"), false);
  assert.equal(await visible(app, "popover"), false);
  await expect(pill.locator(".metric")).toContainText("Weekly");
  await pill.getByRole("button", { name: "Switch usage limit" }).click();
  await expect(pill.locator(".metric")).toContainText("5h", { timeout: 500 });
  await pill.waitForTimeout(3600);
  await expect(pill.locator(".metric")).toContainText("5h");
  const beforeRefresh = (await pill.evaluate(() => window.Koodex.getUsage()))
    .usage.fetchedAt;
  await pill
    .getByRole("button", { name: "Refresh usage", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await pill.evaluate(() => window.Koodex.getUsage())).usage.fetchedAt,
    )
    .toBeGreaterThan(beforeRefresh);
  await expect(pill.locator(".metric")).toContainText("5h");
  assert.equal(await visible(app, "popover"), false);
  await pill.locator(".pill-content").hover();
  const contentHover = await pill
    .locator(".pill")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.equal(
    await pill
      .locator(".pill-content")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgba(0, 0, 0, 0)",
  );
  await pill.locator(".drag-handle").hover();
  assert.equal(
    await pill
      .locator(".pill")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    contentHover,
    "Hover should cover the entire pill",
  );
  prefs = await openSettings(app, pill);
  await expect(prefs.getByRole("heading", { name: "Koodex" })).toBeVisible();
  await prefs.getByLabel("Switch limits").selectOption("2");
  await prefs.getByRole("button", { name: "Done", exact: false }).click();
  await app.evaluate(({ BrowserWindow }) => {
    globalThis.focusTest = new BrowserWindow({
      width: 80,
      height: 80,
      show: true,
    });
    globalThis.focusTest.focus();
  });
  let previous = await pill.locator(".metric").textContent();
  for (let i = 0; i < 2; i++) {
    await expect(pill.locator(".metric")).not.toHaveText(previous, {
      timeout: 2800,
    });
    previous = await pill.locator(".metric").textContent();
  }
  await app.evaluate(() => globalThis.focusTest.destroy());
  prefs = await openSettings(app, pill);
  await prefs.getByLabel("Switch limits").selectOption("0");
  await prefs
    .getByRole("button", { name: "Both limits Always visible" })
    .click();
  await prefs.getByRole("button", { name: "Two bars", exact: true }).click();
  await prefs.getByRole("button", { name: "Mint", exact: true }).click();
  for (const [name, value] of [
    ["Usage ring", "ring"],
    ["Usage meter", "meter"],
  ]) {
    await prefs.getByRole("button", { name: new RegExp(name) }).click();
    await expect
      .poll(
        async () =>
          (await prefs.evaluate(() => window.Koodex.getSettings())).trayStyle,
      )
      .toBe(value);
  }
  await expect(pill.getByRole("progressbar")).toHaveCount(2);
  await expect(pill.locator(".pill-reset")).toHaveCount(2);
  const size = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("view=pill"))
      .getSize(),
  );
  assert.ok(Math.abs(size[0] - 316) <= 1 && Math.abs(size[1] - 68) <= 1);
  await expect(pill.locator('[data-accent="mint"]')).toHaveCount(1);
  // Settings dismisses on focus loss; the pill stays visible.
  await app.evaluate(({ BrowserWindow }) => {
    const w = new BrowserWindow({ width: 80, height: 80, show: true });
    w.focus();
    setTimeout(() => w.destroy(), 200);
  });
  await prefs.waitForTimeout(300);
  assert.equal(await visible(app, "settings"), false);
  assert.equal(await visible(app, "pill"), true);
  prefs = await openSettings(app, pill);
  mkdirSync("assets/screenshots", { recursive: true });
  await prefs.screenshot({
    path: "assets/screenshots/preferences-appearance.png",
    omitBackground: true,
    animations: "disabled",
  });
  await prefs
    .getByRole("button", { name: "Pill & appearance", exact: true })
    .click();
  await prefs.screenshot({
    path: "assets/screenshots/preferences-pill.png",
    omitBackground: true,
    animations: "disabled",
  });
  await prefs.getByRole("button", { name: "Done", exact: false }).click();
  assert.equal(await visible(app, "popover"), false);
  await pill.screenshot({
    path: "assets/screenshots/pill-reset-refresh.png",
    omitBackground: true,
  });
  console.log(
    "Passed: first-run setup, live preview, manual default, explicit auto-switch, countdowns, real refresh, unified hover, tray choices, independent settings.",
  );
} finally {
  await app.close();
}
const reopened = await launch();
try {
  const pill = await getPage(reopened, "pill");
  await expect(pill.getByRole("progressbar")).toHaveCount(2);
  const settings = await pill.evaluate(() => window.Koodex.getSettings());
  assert.equal(settings.setupCompleted, true);
  assert.equal(settings.pillShowReset, true);
  assert.equal(settings.pillShowRefresh, true);
  assert.equal(settings.pillSwitchSeconds, 0);
  assert.equal(settings.trayStyle, "meter");
  assert.equal(await visible(reopened, "settings"), false);
  console.log(
    "Passed: completed setup does not reopen; all preferences survive restart.",
  );
} finally {
  await reopened.close();
}
