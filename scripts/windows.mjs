import { expect } from "@playwright/test";
export async function getPage(app, view) {
  await expect
    .poll(() => app.windows().some((p) => p.url().includes(`view=${view}`)))
    .toBe(true);
  const page = app.windows().find((p) => p.url().includes(`view=${view}`));
  await page.waitForFunction(() => !!window.Koodex);
  return page;
}
export async function openPopover(app) {
  await app.evaluate(async ({ app }) => {
    await app.whenReady();
  });
  await expect
    .poll(
      async () => {
        await app.evaluate(({ app }) =>
          app.emit("second-instance", {}, [], ""),
        );
        return app.windows().some((p) => p.url().includes("view=popover"));
      },
      { timeout: 10000 },
    )
    .toBe(true);
  return getPage(app, "popover");
}
export async function openSettings(app, source) {
  const caller = source && !source.isClosed() ? source : await openPopover(app);
  await caller.evaluate(() => window.Koodex.openSettings());
  return getPage(app, "settings");
}
export async function visible(app, view) {
  return app.evaluate(
    ({ BrowserWindow }, view) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes(`view=${view}`))
        ?.isVisible() ?? false,
    view,
  );
}
