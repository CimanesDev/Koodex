import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
const executable = process.argv.find((s) => s.startsWith("--exe="))?.slice(6);
const label =
  process.argv.find((s) => s.startsWith("--label="))?.slice(8) || "current";
mkdirSync(".smoke-data", { recursive: true });
const directory = mkdtempSync(resolve(".smoke-data", "profile-"));
writeFileSync(
  join(directory, "settings.json"),
  JSON.stringify({
    settingsVersion: 2,
    setupCompleted: true,
    floatingPillEnabled: false,
  }),
);
const env = {
  ...process.env,
  KOODEX_MOCK: "normal",
  KOODEX_TEST_DATA: directory,
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  ...(executable
    ? { executablePath: resolve(executable), args: [] }
    : { args: ["."] }),
  env,
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = { label, samples: [] };
async function sample(stage) {
  await wait(2500);
  const metrics = await app.evaluate(({ app, BrowserWindow }) => ({
    processes: app
      .getAppMetrics()
      .map((p) => ({ type: p.type, memory: p.memory })),
    windows: BrowserWindow.getAllWindows().length,
  }));
  const privateMiB =
    metrics.processes.reduce(
      (sum, p) => sum + (p.memory.privateBytes ?? 0),
      0,
    ) / 1024;
  const workingSetMiB =
    metrics.processes.reduce((sum, p) => sum + p.memory.workingSetSize, 0) /
    1024;
  const row = {
    stage,
    windows: metrics.windows,
    renderers: metrics.processes.filter((p) => p.type === "Tab").length,
    privateMiB: +privateMiB.toFixed(1),
    workingSetMiB: +workingSetMiB.toFixed(1),
  };
  results.samples.push(row);
  if (process.argv.includes("--expect-lazy")) {
    const expected =
      stage === "pill and settings"
        ? 2
        : stage === "pill only" || stage === "settings closed"
          ? 1
          : 0;
    assert.equal(
      row.windows,
      expected,
      `${stage}: hidden windows should be released`,
    );
    assert.equal(
      row.renderers,
      expected,
      `${stage}: hidden renderers should exit`,
    );
  }
  console.log(JSON.stringify(row));
}
const page = async (view) => {
  await expect
    .poll(() => app.windows().some((p) => p.url().includes(`view=${view}`)))
    .toBe(true);
  return app.windows().find((p) => p.url().includes(`view=${view}`));
};
try {
  await sample("tray only at startup");
  await app.evaluate(({ app }) => app.emit("second-instance", {}, [], ""));
  const popup = await page("popover");
  await popup.evaluate(() =>
    window.Koodex.updateSettings({ floatingPillEnabled: true }),
  );
  const pill = await page("pill");
  await pill.evaluate(() => window.Koodex.hidePopover());
  await sample("pill only");
  await pill.evaluate(() => window.Koodex.openSettings());
  const settings = await page("settings");
  await sample("pill and settings");
  await settings.evaluate(() => window.Koodex.closeSettings());
  await sample("settings closed");
  if (process.argv.includes("--expect-lazy")) {
    await pill.evaluate(async () => {
      await window.Koodex.openSettings();
      await window.Koodex.closeSettings();
    });
    await expect
      .poll(() =>
        app.evaluate(
          ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
        ),
      )
      .toBe(1);
    for (let i = 0; i < 3; i++) {
      await pill.evaluate(() => window.Koodex.openSettings());
      const reopened = await page("settings");
      await expect(
        reopened.getByRole("heading", { name: "Make it yours" }),
      ).toBeVisible();
      await reopened.evaluate(() => window.Koodex.closeSettings());
      await expect
        .poll(() =>
          app.evaluate(
            ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
          ),
        )
        .toBe(1);
    }
  }
  await pill.evaluate(() =>
    window.Koodex.updateSettings({ floatingPillEnabled: false }),
  );
  await sample("back to tray only");
  writeFileSync(
    resolve(".smoke-data", `profile-${label}.json`),
    JSON.stringify(results, null, 2),
  );
} finally {
  await app.close();
}
