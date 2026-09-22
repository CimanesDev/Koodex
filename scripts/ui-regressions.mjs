import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { getPage, openSettings } from "./windows.mjs";
mkdirSync(".smoke-data", { recursive: true });
mkdirSync("test-results/ui-regressions", { recursive: true });
const directory = mkdtempSync(resolve(".smoke-data", "ui-regressions-"));
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
const app = await electron.launch({ args: ["."], env });
try {
  const pill = await getPage(app, "pill");
  const prefs = await openSettings(app, pill);
  for (const width of [760, 560]) {
    await app.evaluate(({ BrowserWindow }, width) => {
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes("view=settings"),
      );
      window.setMinimumSize(0, 0);
      window.setSize(width, 800);
    }, width);
    const tray = prefs.locator(".tray-section");
    await tray.scrollIntoViewIfNeeded();
    const boxes = await tray.evaluate((el) => {
      const select = el.querySelector("select").getBoundingClientRect();
      const cards = [...el.querySelectorAll(".tray-choice")].map((e) => {
        const r = e.getBoundingClientRect();
        return {
          top: r.top,
          right: r.right,
          left: r.left,
          bottom: r.bottom,
          clipped: e.scrollWidth > e.clientWidth,
        };
      });
      return { bottom: select.bottom, cards, viewport: innerWidth };
    });
    for (const card of boxes.cards) {
      assert.ok(
        card.top >= boxes.bottom + 12,
        "Tray controls must have a visible gap",
      );
      assert.ok(
        card.left >= 0 && card.right <= boxes.viewport && !card.clipped,
        "Tray choices must fit",
      );
    }
    await prefs.getByLabel("Tray icon color").selectOption("dark");
    await prefs.getByRole("button", { name: /Usage ring/ }).click();
    await expect(
      prefs.getByRole("button", { name: /Usage ring/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await prefs.screenshot({
      path: `test-results/ui-regressions/tray-${width}.png`,
    });
  }
  await prefs.evaluate(() => window.Koodex.closeSettings());
  for (const side of ["left", "right"]) {
    await pill.evaluate(
      (side) =>
        window.Koodex.updateSettings({
          pillPlacement: side,
          pillSideHideable: true,
          pillLayout: "both",
          pillShowReset: true,
          pillShowDragHandle: false,
        }),
      side,
    );
    await pill.getByRole("button", { name: "Show usage pill" }).click();
    await expect(pill.locator(".dock-tab")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect.poll(() => pill.evaluate(() => innerWidth)).toBe(164);
    await pill.screenshot({
      path: `test-results/ui-regressions/${side}-expanded.png`,
    });
    await pill.getByRole("button", { name: "Hide usage pill" }).click();
    await expect.poll(() => pill.evaluate(() => innerWidth)).toBe(32);
    await pill.screenshot({
      path: `test-results/ui-regressions/${side}-collapsed.png`,
    });
  }
  console.log(
    "Passed tray spacing at 760px and 560px, color/style controls, and left/right drawer states.",
  );
} finally {
  await app.close();
}
