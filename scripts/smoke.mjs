import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { getPage, openPopover, visible } from "./windows.mjs";
const testData = resolve(".smoke-data", "smoke");
mkdirSync(testData, { recursive: true });
writeFileSync(
  resolve(testData, "settings.json"),
  JSON.stringify({
    settingsVersion: 2,
    setupCompleted: true,
    floatingPillEnabled: false,
  }),
);
const executable = process.argv.find((a) => a.startsWith("--exe="))?.slice(6);
const env = {
  ...process.env,
  KOODEX_MOCK: process.env.KOODEX_MOCK || "normal",
  KOODEX_TEST_DATA: testData,
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  ...(executable
    ? { executablePath: resolve(executable), args: [] }
    : { args: ["."] }),
  env,
});
try {
  let page = await openPopover(app);
  assert.ok(page, "Popover renderer must load");
  page.on("pageerror", (error) => console.error("Renderer:", error.message));
  await page.waitForFunction(() => !!window.Koodex);
  await page.evaluate(() => window.Koodex.openPopover());
  await page
    .getByRole("heading", { name: "Koodex · Codex", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll('[role="progressbar"]').length === 2,
  );
  assert.equal(await page.getByRole("progressbar").count(), 2);
  assert.ok(await page.getByText("68", { exact: false }).count());
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const preferences = await getPage(app, "settings");
  await preferences.getByRole("heading", { name: "Make it yours" }).waitFor();
  const pillSwitch = preferences.getByRole("switch", {
    name: "Show floating pill",
    exact: true,
  });
  await pillSwitch.check();
  assert.equal(
    await preferences.evaluate(
      async () => (await window.Koodex.getSettings()).floatingPillEnabled,
    ),
    true,
  );
  await preferences
    .getByRole("button", { name: "General", exact: true })
    .click();
  await preferences
    .getByRole("combobox", { name: /Refresh interval/ })
    .selectOption("300");
  await expect
    .poll(
      async () =>
        (await preferences.evaluate(() => window.Koodex.getSettings()))
          .refreshIntervalSeconds,
    )
    .toBe(300);
  await preferences.getByRole("button", { name: "Done", exact: false }).click();
  page = await openPopover(app);
  await page
    .getByRole("heading", { name: "Koodex · Codex", exact: true })
    .waitFor();
  mkdirSync("assets/screenshots", { recursive: true });
  await page.screenshot({
    path: "assets/screenshots/popover.png",
    omitBackground: true,
  });
  await page.keyboard.press("Escape");
  assert.equal(
    await app.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes("view=popover"))
          ?.isVisible() ?? false,
    ),
    false,
  );
  page = await openPopover(app);
  await app.evaluate(({ BrowserWindow }) => {
    const other = new BrowserWindow({ width: 80, height: 80, show: false });
    other.show();
    other.focus();
    setTimeout(() => other.destroy(), 500);
  });
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(
    await app.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes("view=popover"))
          ?.isVisible() ?? false,
    ),
    false,
  );
  const pill = await getPage(app, "pill");
  const settings = await pill.evaluate(() => window.Koodex.getSettings());
  assert.equal(settings.refreshIntervalSeconds, 300);
  console.log(
    "Electron smoke passed: usage, settings, floating pill, Escape, click-away.",
  );
} finally {
  await app.close();
}
