import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { getPage, openSettings } from "./windows.mjs";
mkdirSync(".smoke-data", { recursive: true });
mkdirSync("test-results/update-ui", { recursive: true });
const directory = mkdtempSync(resolve(".smoke-data", "update-ui-"));
writeFileSync(
  join(directory, "settings.json"),
  JSON.stringify({ settingsVersion: 2, setupCompleted: true }),
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
  await app.evaluate(({ Menu }) => {
    const original = Menu.buildFromTemplate;
    Menu.buildFromTemplate = (template) => {
      globalThis.trayTemplate = template;
      return original.call(Menu, template);
    };
  });
  await pill.evaluate(() =>
    window.Koodex.updateSettings({ floatingPillEnabled: false }),
  );
  await app.evaluate(() => {
    const entry = globalThis.trayTemplate.find(
      (item) => item.label === "App updates...",
    );
    if (!entry) throw new Error("Missing tray update action");
    entry.click();
  });
  const prefs = await getPage(app, "settings");
  await expect(
    prefs.getByRole("button", { name: "General", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    prefs.getByRole("region", { name: "App updates" }),
  ).toBeVisible();
  await expect(
    prefs.getByRole("button", { name: "Check for updates" }),
  ).toHaveCount(0);
  assert.equal(
    (await prefs.evaluate(() => window.Koodex.getUpdateState())).status,
    "disabled",
  );
  // Replace only IPC handlers in this isolated test process. Production builds
  // never accept a test feed URL or run a mock installer.
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    globalThis.updateTest = { status: "idle", currentVersion: "1.7.0" };
    globalThis.updateInstalls = 0;
    globalThis.updateLinks = 0;
    globalThis.updatePublish = (patch) => {
      Object.assign(globalThis.updateTest, patch);
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.send("updates", globalThis.updateTest);
      return { ...globalThis.updateTest };
    };
    for (const name of ["get", "check", "download", "install", "releases"])
      ipcMain.removeHandler(`updates:${name}`);
    ipcMain.handle("updates:get", () => globalThis.updateTest);
    ipcMain.handle("updates:check", () => {
      globalThis.updatePublish({ status: "checking" });
      setTimeout(
        () =>
          globalThis.updatePublish({ status: "available", version: "1.7.1" }),
        80,
      );
      return globalThis.updateTest;
    });
    ipcMain.handle("updates:download", () => {
      globalThis.updatePublish({ status: "downloading", percent: 42 });
      return globalThis.updateTest;
    });
    ipcMain.handle("updates:install", () => {
      globalThis.updateInstalls++;
      return globalThis.updatePublish({ status: "installing" });
    });
    ipcMain.handle("updates:releases", () => {
      globalThis.updateLinks++;
    });
    globalThis.updatePublish({});
  });
  await prefs
    .getByRole("button", { name: "Check for updates", exact: true })
    .click();
  await prefs
    .getByRole("button", { name: "Download update", exact: true })
    .click();
  await expect(
    prefs.getByRole("progressbar", { name: "Update download progress" }),
  ).toHaveAttribute("value", "42");
  await prefs.screenshot({ path: "test-results/update-ui/downloading.png" });
  await app.evaluate(() =>
    globalThis.updatePublish({
      status: "error",
      failedAction: "download",
      message:
        "The update could not be downloaded or verified. Please try again.",
    }),
  );
  await expect(prefs.getByRole("button", { name: "Try again" })).toBeEnabled();
  await prefs.getByRole("button", { name: "Try again" }).click();
  await app.evaluate(() =>
    globalThis.updatePublish({
      status: "ready",
      version: "1.7.1",
      percent: 100,
    }),
  );
  await prefs.screenshot({ path: "test-results/update-ui/ready.png" });
  assert.equal(await app.evaluate(() => globalThis.updateInstalls), 0);
  await prefs.getByRole("button", { name: "View releases" }).click();
  assert.equal(await app.evaluate(() => globalThis.updateLinks), 1);
  await prefs.getByRole("button", { name: "Restart and install" }).click();
  assert.equal(await app.evaluate(() => globalThis.updateInstalls), 1);
  await expect(prefs.getByRole("status")).toContainText("Restarting");
  console.log(
    "Update UI passed: disabled development mode, check, download progress, retry, release link, and explicit restart.",
  );
} finally {
  await app.close();
}
