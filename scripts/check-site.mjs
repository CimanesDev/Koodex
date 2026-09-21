import { mkdir } from "node:fs/promises";
await mkdir("test-results", { recursive: true });
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(pathToFileURL(resolve("docs/index.html")).href);
const frame = page.frameLocator("iframe");
await frame.locator(".pill").waitFor();
for (const width of [1280, 850, 390, 320]) {
  await page.setViewportSize({ width, height: 900 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Page overflow " + width);
  if (await frame.locator("body").evaluate((el) => el.scrollHeight > 630))
    throw Error("Frame height overflow " + width);
}
for (const layout of ["both", "alternating"]) {
  await frame.getByLabel("Display", { exact: true }).selectOption(layout);
  for (const content of ["details", "indicator"]) {
    await frame.getByLabel("Contents", { exact: true }).selectOption(content);
    for (const placement of [
      "free",
      "left",
      "right",
      "top-left",
      "top-center",
      "top-right",
    ]) {
      await frame
        .getByLabel("Placement", { exact: true })
        .selectOption(placement);
      for (const style of layout === "both"
        ? ["bar-separate", "ring-separate", "bar-combined", "ring-combined"]
        : ["bar-separate", "ring-separate"]) {
        await frame
          .getByLabel("Progress style", { exact: true })
          .selectOption(style);
        const fits = await frame.locator(".pill").evaluate((el) => {
          const p = el.getBoundingClientRect(),
            s = el.closest(".stage").getBoundingClientRect();
          return (
            p.left >= s.left &&
            p.right <= s.right &&
            p.top >= s.top &&
            p.bottom <= s.bottom
          );
        });
        if (!fits)
          throw Error("Pill overflow " + [layout, content, placement, style]);
      }
    }
  }
}
await frame.getByRole("button", { name: "Reset", exact: true }).click();
await frame.getByRole("button", { name: "mint", exact: true }).click();
if (
  (await frame
    .locator("main")
    .evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--progress").trim(),
    )) !== "#8ed8b8"
)
  throw Error("Accent failed");
await frame.getByLabel("Display", { exact: true }).selectOption("alternating");
const before = await frame.locator(".metric").innerText();
await frame.getByLabel("Switch usage limit", { exact: true }).click();
if ((await frame.locator(".metric").innerText()) === before)
  throw Error("Switch failed");
await frame.getByRole("button", { name: "Reset", exact: true }).click();
await page.setViewportSize({ width: 1280, height: 1000 });
await page.screenshot({ path: "test-results/site-preview-desktop.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 900 });
await page.screenshot({ path: "test-results/site-preview-mobile.png", fullPage: true });
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "Passed: 4 viewport sizes, 72 pill combinations, accent, reset and limit switching; no browser errors.",
);
await browser.close();
