import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { getPage, openPopover } from "./windows.mjs";
const executable = process.argv.find((a) => a.startsWith("--exe="))?.slice(6);
for (const scenario of [
  "normal",
  "low",
  "critical",
  "single-window",
  "offline",
  "loading",
]) {
  const testData = resolve(".smoke-data", scenario);
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
    KOODEX_MOCK: scenario,
    KOODEX_TEST_DATA: resolve(".smoke-data", scenario),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    ...(executable
      ? { executablePath: resolve(executable), args: [] }
      : { args: ["."] }),
    env,
  });
  try {
    const page = await openPopover(app);
    assert.ok(page);
    await page.waitForFunction(() => !!window.Koodex);
    await page.evaluate(() => window.Koodex.openPopover());
    const count =
      scenario === "loading" ? 0 : scenario === "single-window" ? 1 : 2;
    await page.waitForFunction(
      (n) => document.querySelectorAll('[role="progressbar"]').length === n,
      count,
    );
    assert.equal(await page.getByRole("progressbar").count(), count);
    if (scenario === "offline")
      assert.ok(
        await page
          .getByText("Showing saved usage")
          .count(),
      );
    if (scenario === "loading")
      assert.ok(await page.getByText("Connecting to Codex…").count());
    if (scenario === "critical")
      assert.equal(await page.locator(".bar.critical").count(), 2);
    if (scenario === "low")
      assert.equal(await page.locator(".bar.low").count(), 2);
    if (scenario === "normal") {
      await page.evaluate(() =>
        window.Koodex.updateSettings({
          floatingPillEnabled: true,
          pillSwitchSeconds: 3,
        }),
      );
      await page.evaluate(() => window.Koodex.finishSetup());
      const pill = await getPage(app, "pill");
      assert.ok(pill);
      await page.evaluate(() => window.Koodex.hidePopover());
      const first = await pill.locator(".metric").textContent();
      assert.ok(first.includes("Weekly"), "Most urgent quota starts first");
      await pill.waitForFunction(() =>
        document.querySelector(".metric").textContent.includes("5h"),
      );
      assert.equal(
        await pill.evaluate(() => typeof window.require),
        "undefined",
      );
    }
    console.log("Scenario passed:", scenario);
  } finally {
    await app.close();
  }
}
