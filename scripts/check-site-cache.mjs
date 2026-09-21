import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const staleCSS = execFileSync("git", ["show", "fe2dbf7:docs/site.css"], {
    encoding: "utf8",
  });
  let staleRequests = 0;
  await page.route("https://koodex.test/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (path === "site.css" && !url.search) {
      staleRequests++;
      return route.fulfill({ contentType: "text/css", body: staleCSS });
    }
    const contentType = path.endsWith(".css")
      ? "text/css"
      : path.endsWith(".js")
        ? "application/javascript"
        : path.endsWith(".svg")
          ? "image/svg+xml"
          : "text/html";
    await route.fulfill({ contentType, body: await readFile("docs/" + path) });
  });
  await page.goto("https://koodex.test/");
  await page.frameLocator("iframe").locator(".pill").waitFor();
  const intro = await page.locator(".intro").boundingBox();
  const preview = await page.locator("iframe").boundingBox();
  if (preview.x < intro.x + intro.width || preview.height < 630)
    throw Error("Desktop preview must be full-height and to the right");
  if (staleRequests) throw Error("Requested cached legacy stylesheet");
  const refs = await page
    .locator('link[rel="stylesheet"],iframe')
    .evaluateAll((els) =>
      els.map((e) => e.getAttribute("href") || e.getAttribute("src")),
    );
  if (refs.some((ref) => !ref.includes("?v=")))
    throw Error("Unversioned website asset");
  const frame = page.frameLocator("iframe");
  const nested = await frame
    .locator('link[rel="stylesheet"],script[src]')
    .evaluateAll((els) =>
      els.map((e) => e.getAttribute("href") || e.getAttribute("src")),
    );
  if (nested.some((ref) => !ref.includes("?v=")))
    throw Error("Unversioned preview asset");
  console.log(
    "Passed: legacy cached CSS bypassed; desktop preview on right, visible at full height; nested assets versioned.",
  );
} finally {
  await browser.close();
}
