import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { openPopover } from "./windows.mjs";
const testData = resolve(".smoke-data", "packaged-live");
mkdirSync(testData, { recursive: true });
writeFileSync(
  resolve(testData, "settings.json"),
  JSON.stringify({
    settingsVersion: 2,
    setupCompleted: true,
    floatingPillEnabled: false,
  }),
);
const env = {
  ...process.env,
  KOODEX_TEST_DATA: resolve(".smoke-data", "packaged-live"),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.KOODEX_MOCK;
const app = await electron.launch({
  executablePath: resolve("release/1.5.0/win-unpacked/Koodex.exe"),
  args: [],
  env,
});
try {
  assert.equal(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
    0,
    "Tray-only startup must create no renderers",
  );
  const page = await openPopover(app);
  assert.ok(page);
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(() => window.Koodex.getUsage());
        return state.syncState;
      },
      { timeout: 30000 },
    )
    .toBe("synced");
  const state = await page.evaluate(() => window.Koodex.getUsage());
  assert.ok(state.usage.windows.some((w) => w.id === "five-hour"));
  assert.ok(state.usage.windows.some((w) => w.id === "weekly"));
  await page.evaluate(() => window.Koodex.refreshUsage());
  assert.equal(
    (await page.evaluate(() => window.Koodex.getUsage())).syncState,
    "synced",
  );
  // Changing providers while a Codex read is in flight must not leak its result.
  await page.evaluate(async () => {
    const pending = window.Koodex.refreshUsage();
    await window.Koodex.updateSettings({ provider: "claude" });
    await pending;
  });
  const switched = await page.evaluate(() => window.Koodex.getUsage());
  assert.equal(switched.provider, "claude");
  assert.equal(switched.usage, null);
  await page.evaluate(() =>
    window.Koodex.updateSettings({ provider: "codex" }),
  );
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.Koodex.getUsage())).syncState,
      { timeout: 30000 },
    )
    .toBe("synced");
  assert.equal(
    (await page.evaluate(() => window.Koodex.getUsage())).provider,
    "codex",
  );
  // Verify the startup setting reaches Electron with the correct executable/args,
  // without registering this test copy in the user's Windows startup list.
  await app.evaluate(({ app }) => {
    globalThis.originalLoginSetter = app.setLoginItemSettings;
    app.setLoginItemSettings = (options) => {
      globalThis.loginOptions = options;
    };
  });
  try {
    await page.evaluate(() =>
      window.Koodex.updateSettings({ launchAtStartup: true }),
    );
    const options = await app.evaluate(() => globalThis.loginOptions);
    assert.equal(options.openAtLogin, true);
    assert.deepEqual(options.args, ["--startup"]);
    assert.ok(options.path.endsWith("Koodex.exe"));
    await page.evaluate(() =>
      window.Koodex.updateSettings({ launchAtStartup: false }),
    );
  } finally {
    await app.evaluate(({ app }) => {
      app.setLoginItemSettings = globalThis.originalLoginSetter;
    });
  }
  console.log(
    "Packaged live check passed: both quotas, refresh, provider isolation during in-flight reads, reconnect, silent startup, startup API wiring.",
  );
} finally {
  await app.close();
}
