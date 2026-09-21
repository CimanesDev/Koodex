import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { getPage, openSettings } from "./windows.mjs";
mkdirSync(".smoke-data", { recursive: true });
mkdirSync("test-results", { recursive: true });
const directory = mkdtempSync(resolve(".smoke-data", "appearance-"));
writeFileSync(
  join(directory, "settings.json"),
  JSON.stringify({
    settingsVersion: 2,
    setupCompleted: true,
    pillPosition: { x: 250, y: 180 },
    pillSwitchSeconds: 0,
  }),
);
const env = {
  ...process.env,
  KOODEX_MOCK: "normal",
  KOODEX_TEST_DATA: directory,
};
delete env.ELECTRON_RUN_AS_NODE;
const executable = process.argv
  .find((arg) => arg.startsWith("--exe="))
  ?.slice(6);
const launch = () =>
  electron.launch({
    ...(executable
      ? { executablePath: resolve(executable), args: [] }
      : { args: ["."] }),
    env,
  });
const app = await launch();
try {
  const pill = await getPage(app, "pill");
  await expect(pill.locator(".pill")).toBeVisible();
  const update = (p) =>
    pill.evaluate((p) => window.Koodex.updateSettings(p), p);
  const settings = await pill.evaluate(() => window.Koodex.getSettings());
  assert.equal(settings.showRefreshActivity, false);
  const usage = await pill.evaluate(() => window.Koodex.getUsage());
  const send = async (syncState) =>
    app.evaluate(
      ({ BrowserWindow }, { usage, syncState }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes("view=pill"))
          .webContents.send("usage", { ...usage, syncState }),
      { usage, syncState },
    );
  await send("refreshing");
  await expect(pill.locator(".pill-stale")).toHaveCount(0);
  await update({ showRefreshActivity: true });
  await send("refreshing");
  await expect(pill.locator(".pill-refreshing")).toHaveCount(1);
  await update({ showRefreshActivity: false });
  await send("error");
  await expect(pill.locator('.pill-stale[title="error"]')).toHaveCount(1);
  await send("synced");
  const prefs = await openSettings(app, pill);
  await prefs.getByLabel("Pill surface", { exact: true }).selectOption("glass");
  await prefs.getByLabel("Pill opacity", { exact: true }).fill("55");
  await prefs
    .getByLabel("Pill opacity", { exact: true })
    .dispatchEvent("input");
  await expect
    .poll(
      async () =>
        (await pill.evaluate(() => window.Koodex.getSettings())).pillOpacity,
    )
    .toBe(55);
  await expect(prefs.locator(".pill-preview")).toHaveAttribute(
    "data-material",
    "glass",
  );
  await expect
    .poll(() =>
      pill.locator(".pill").evaluate((el) => getComputedStyle(el).opacity),
    )
    .toBe("0.55");
  await prefs.getByLabel("Tray icon color").selectOption("light");
  await prefs.getByRole("button", { name: "General", exact: true }).click();
  await expect(
    prefs.getByRole("switch", { name: "Show refresh activity", exact: true }),
  ).not.toBeChecked();
  await prefs
    .getByRole("switch", { name: "Show refresh activity", exact: true })
    .check();
  assert.equal(
    (await pill.evaluate(() => window.Koodex.getSettings()))
      .showRefreshActivity,
    true,
  );
  await prefs
    .getByRole("switch", { name: "Show refresh activity", exact: true })
    .uncheck();
  // Verify the real icon against the Windows taskbar theme.
  await update({ trayColor: "auto" });
  const theme = await app.evaluate(({ nativeTheme, nativeImage }) => {
    const original = nativeImage.createFromPath;
    let path = "";
    nativeImage.createFromPath = function (p) {
      path = p;
      return original.call(this, p);
    };
    const dark = nativeTheme.shouldUseDarkColorsForSystemIntegratedUI;

    nativeTheme.emit("updated");
    nativeImage.createFromPath = original;

    return { path, dark };
  });
  assert.match(
    theme.path,
    new RegExp("[\\\\/]" + (theme.dark ? "light" : "dark") + "-"),
  );
  await update({ trayColor: "light" });
  await prefs.evaluate(() => window.Koodex.closeSettings());
  // Hover reveals a faded pill without changing its saved opacity.
  await pill.locator(".pill").hover();
  await expect
    .poll(() =>
      pill.locator(".pill").evaluate((el) => getComputedStyle(el).opacity),
    )
    .toBe("1");
  let combinations = 0;
  for (const side of ["left", "right"])
    for (const content of ["details", "indicator"])
      for (const indicator of ["bar", "ring"])
        for (const combined of ["separate", "combined"])
          for (const both of ["both", "alternating"])
            for (const extras of [false, true]) {
              await update({
                pillPlacement: side,
                pillContent: content,
                pillIndicator: indicator,
                pillBothStyle: combined,
                pillLayout: both,
                pillShowReset: extras,
                pillShowRefresh: extras,
                pillShowDragHandle: extras,
              });
              await expect
                .poll(() =>
                  pill.locator(".pill").evaluate((el) => {
                    const r = el.getBoundingClientRect();
                    return (
                      Math.abs(r.height - innerHeight) < 2 &&
                      Math.abs(r.width - innerWidth) < 2
                    );
                  }),
                )
                .toBe(true);
              const clipped = await pill.locator(".pill").evaluate((el) => {
                const r = el.getBoundingClientRect();
                return [
                  ...el.querySelectorAll(
                    ".ring,.dual-ring,.bar,.metric,.pill-reset,.pill-refresh",
                  ),
                ]
                  .filter((child) => {
                    const c = child.getBoundingClientRect();
                    return (
                      c.width &&
                      c.height &&
                      (c.left < r.left - 1 ||
                        c.right > r.right + 1 ||
                        c.top < r.top - 1 ||
                        c.bottom > r.bottom + 1)
                    );
                  })
                  .map((e) => e.className.baseVal ?? e.className);
              });
              assert.deepEqual(
                clipped,
                [],
                JSON.stringify({
                  side,
                  content,
                  indicator,
                  combined,
                  both,
                  extras,
                }),
              );
              combinations++;
            }
  await update({
    pillPlacement: "free",
    pillMaterial: "glass",
    pillOpacity: 55,
    pillLayout: "both",
    pillContent: "details",
    pillShowRefresh: false,
    pillShowReset: true,
  });
  // An ordinary focused Chromium window must stay underneath the overlay.
  const handles = await app.evaluate(async ({ BrowserWindow }) => {
    const pill = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("view=pill"),
    );
    const cover = new BrowserWindow({
      x: 200,
      y: 120,
      width: 700,
      height: 500,
      show: false,
    });
    await cover.loadURL(
      "data:text/html,<body style='background:white'>Browser window</body>",
    );
    cover.show();
    cover.focus();
    globalThis.appearanceCover = cover;
    return {
      pill: pill.getNativeWindowHandle().readBigUInt64LE().toString(),
      cover: cover.getNativeWindowHandle().readBigUInt64LE().toString(),
      top: pill.isAlwaysOnTop(),
    };
  });
  assert.equal(handles.top, true);
  const nativeOrder = () =>
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class OverlayOrder { [DllImport(\"user32.dll\")] public static extern IntPtr GetWindow(IntPtr h, uint cmd); }'; $h=[OverlayOrder]::GetWindow([IntPtr]" +
          handles.pill +
          ",3); $above=$false; while($h -ne [IntPtr]::Zero) { if($h -eq [IntPtr]" +
          handles.cover +
          "){$above=$true;break}; $h=[OverlayOrder]::GetWindow($h,3) }; if($above){exit 1}",
      ],
      { windowsHide: true, encoding: "utf8" },
    );
  nativeOrder();
  await app.evaluate(() => globalThis.appearanceCover.setFullScreen(true));
  await expect
    .poll(() => app.evaluate(() => globalThis.appearanceCover.isFullScreen()))
    .toBe(true);
  nativeOrder();
  assert.equal(
    await app.evaluate(() => globalThis.appearanceCover.isFocused()),
    true,
  );
  // Resume repairs a dropped topmost flag, without stealing browser focus.
  await app.evaluate(({ BrowserWindow, powerMonitor }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("view=pill"))
      .setAlwaysOnTop(false);
    powerMonitor.emit("resume");
  });
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("view=pill"))
        .isAlwaysOnTop(),
    ),
    true,
  );
  nativeOrder();
  await app.evaluate(() => globalThis.appearanceCover.destroy());
  await pill.screenshot({
    path: "test-results/app-glass.png",
    omitBackground: true,
  });
  const finalPrefs = await openSettings(app, pill);
  await finalPrefs.screenshot({ path: "test-results/app-appearance.png" });
  console.log(
    "Passed " +
      combinations +
      " vertical layouts, quiet refresh and error visibility, opacity/hover, glass preview, taskbar theme contrast, native browser/fullscreen stacking and resume.",
  );
} finally {
  await app.close();
}
const reopened = await launch();
try {
  const pill = await getPage(reopened, "pill");
  const s = await pill.evaluate(() => window.Koodex.getSettings());
  assert.equal(s.pillOpacity, 55);
  assert.equal(s.pillMaterial, "glass");
  assert.equal(s.showRefreshActivity, false);
  assert.equal(s.trayColor, "light");
  assert.equal(
    JSON.parse(readFileSync(join(directory, "settings.json"))).pillOpacity,
    55,
  );
  console.log("Passed appearance persistence across restart.");
} finally {
  await reopened.close();
}
