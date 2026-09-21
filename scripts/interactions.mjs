import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { getPage } from "./windows.mjs";
mkdirSync(".smoke-data", { recursive: true });
const directory = mkdtempSync(resolve(".smoke-data", "interactions-"));
writeFileSync(
  join(directory, "settings.json"),
  JSON.stringify({
    settingsVersion: 2,
    setupCompleted: true,
    pillShowDragHandle: false,
    pillPosition: { x: 250, y: 180 },
  }),
);
const env = {
  ...process.env,
  KOODEX_MOCK: "normal",
  KOODEX_TEST_DATA: directory,
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ["."], env });
try {
  const page = await getPage(app, "pill");
  const bounds = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("view=pill"))
        .getBounds(),
    );
  const update = (patch) =>
    page.evaluate((p) => window.Koodex.updateSettings(p), patch);
  const content = page.getByRole("button", { name: "Switch usage limit" });
  await expect(content).toBeVisible();
  const before = await content.innerText();
  await content.click();
  assert.notEqual(await content.innerText(), before);
  const selected = await content.innerText();
  // Deterministic native coordinates exercise the main process without moving
  // the user's physical cursor. Renderer events still test click suppression.
  await app.evaluate(({ screen }) => {
    globalThis.testCursor = { x: 300, y: 200 };
    screen.getCursorScreenPoint = () => globalThis.testCursor;
  });
  await page.evaluate(() => window.Koodex.dragPill("start"));
  await page.evaluate(() => window.Koodex.getSettings());
  await app.evaluate(() => {
    globalThis.testCursor = { x: 400, y: 300 };
  });
  // Synthetic pointer IDs cannot be captured; use a real mouse gesture below
  // for the renderer's capture path, and IPC here for native placement.
  await page.evaluate(() => window.Koodex.dragPill("move"));
  await page.evaluate(() => window.Koodex.dragPill("end"));
  assert.equal((await bounds()).x, 350);
  assert.equal((await bounds()).y, 280);
  const box = await content.boundingBox();
  await page.mouse.move(box.x + 15, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + 45, box.y + 18, { steps: 4 });
  await page.mouse.up();
  assert.equal(
    await content.innerText(),
    selected,
    "drag must not switch quota",
  );
  await content.click();
  assert.notEqual(
    await content.innerText(),
    selected,
    "next click still switches",
  );
  for (const side of ["left", "right"]) {
    await update({ pillPlacement: side, pillSideHideable: true });
    await expect.poll(async () => (await bounds()).width).toBe(36);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), "hidden");
    await page.getByRole("button", { name: "Show usage pill" }).click();
    await expect.poll(async () => (await bounds()).width).toBe(168);
    await expect(
      page.getByRole("button", { name: "Hide usage pill" }),
    ).toHaveAttribute("aria-expanded", "true");
    await page.screenshot({ path: join(directory, `${side}-expanded.png`) });
    await page.getByRole("button", { name: "Hide usage pill" }).click();
    await expect.poll(async () => (await bounds()).width).toBe(36);
    await page.screenshot({ path: join(directory, `${side}-collapsed.png`) });
  }
  assert.equal(
    JSON.parse(readFileSync(join(directory, "settings.json"))).pillSideHideable,
    true,
  );
  await update({ pillPlacement: "free" });
  await expect(page.locator(".dock-tab")).toHaveCount(0);
  assert.equal((await bounds()).x, 350);
  console.log(
    `Passed grip-free movement, drag/click distinction, side tabs and persistence. Screenshots: ${directory}`,
  );
} finally {
  await app.close();
}
