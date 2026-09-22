import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Updates, type UpdateDriver } from "../src/main/updates";
import type { UpdateState } from "../src/shared/types";
class Driver extends EventEmitter implements UpdateDriver {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowPrerelease = true;
  allowDowngrade = true;
  disableWebInstaller = false;
  checks = 0;
  downloads = 0;
  installs: boolean[][] = [];
  checkError = false;
  downloadError = false;
  installError = false;
  async checkForUpdates() {
    this.checks++;
    if (this.checkError) throw new Error("offline");
    this.emit("update-available", { version: "1.7.1" });
    return {};
  }
  async downloadUpdate() {
    this.downloads++;
    if (this.downloadError) {
      this.emit("error", new Error("checksum mismatch"));
      throw new Error("bad download");
    }
    this.emit("download-progress", { percent: 42.3 });
    this.emit("update-downloaded", { version: "1.7.1" });
    return [];
  }
  quitAndInstall(silent: boolean, restart: boolean) {
    if (this.installError) throw new Error("denied");
    this.installs.push([silent, restart]);
  }
}
function fixture(reason?: string) {
  const driver = new Driver();
  const states: UpdateState[] = [];
  let created = 0;
  const updates = new Updates(
    "1.7.0",
    () => {
      created++;
      return driver;
    },
    (state) => states.push(state),
    reason,
  );
  return { driver, states, updates, created: () => created };
}
test("updates are lazy and never download or install without an explicit action", async () => {
  const { driver, updates, created, states } = fixture();
  assert.equal(created(), 0);
  updates.install();
  await updates.download();
  assert.equal(created(), 0);
  assert.equal((await updates.check()).status, "available");
  assert.equal(driver.autoDownload, false);
  assert.equal(driver.autoInstallOnAppQuit, false);
  assert.equal(driver.allowDowngrade, false);
  assert.equal(driver.allowPrerelease, false);
  assert.equal(driver.disableWebInstaller, true);
  assert.equal(driver.downloads, 0);
  assert.equal(driver.installs.length, 0);
  assert.equal((await updates.download()).status, "ready");
  assert.ok(states.some((s) => s.percent === 42));
  await updates.check();
  assert.equal(driver.checks, 1, "checks cannot discard a downloaded update");
  assert.equal(driver.installs.length, 0);
  updates.install();
  updates.install();
  assert.deepEqual(
    driver.installs,
    [[true, true]],
    "one silent installer with restart",
  );
});
test("failed checks and corrupt downloads recover without allowing installation", async () => {
  const { driver, updates } = fixture();
  driver.checkError = true;
  assert.equal((await updates.check()).failedAction, "check");
  driver.checkError = false;
  await updates.check();
  driver.downloadError = true;
  assert.equal((await updates.download()).failedAction, "download");
  updates.install();
  assert.equal(driver.installs.length, 0);
  driver.downloadError = false;
  assert.equal((await updates.download()).status, "ready");
  driver.installError = true;
  assert.equal(updates.install().failedAction, "install");
  driver.installError = false;
  await updates.check();
  await updates.download();
  updates.install();
  assert.equal(driver.installs.length, 1);
});
test("disabled portable/development modes cannot create a driver or install", async () => {
  const { updates, created } = fixture("Use the installer");
  updates.start();
  await updates.check();
  await updates.download();
  updates.install();
  updates.stop();
  assert.equal(created(), 0);
  assert.equal(updates.get().status, "disabled");
});
test("concurrent checks are coalesced and shutdown prevents further actions", async () => {
  const { driver, updates } = fixture();
  let finish!: () => void;
  driver.checkForUpdates = () => {
    driver.checks++;
    return new Promise((resolve) => {
      finish = () => {
        driver.emit("update-not-available", {});
        resolve({});
      };
    });
  };
  const first = updates.check();
  await updates.check();
  await updates.download();
  updates.install();
  assert.equal(driver.checks, 1);
  assert.equal(driver.downloads, 0);
  finish();
  await first;
  assert.equal(updates.get().status, "current");
  updates.stop();
  await updates.check();
  assert.equal(driver.checks, 1);
});

test("automatic checks start after 30 seconds and stop on shutdown", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { updates, driver } = fixture();
  updates.start();
  context.mock.timers.tick(29999);
  assert.equal(driver.checks, 0);
  context.mock.timers.tick(1);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(driver.checks, 1);
  assert.equal(driver.downloads, 0);
  updates.stop();
  context.mock.timers.tick(6 * 60 * 60 * 1000);
  assert.equal(driver.checks, 1);
});
