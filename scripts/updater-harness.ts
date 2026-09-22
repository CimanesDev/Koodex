import { app } from "electron";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { NsisUpdater } from "electron-updater";
import { ElectronHttpExecutor } from "electron-updater/out/electronHttpExecutor";
import { Updates } from "../src/main/updates";

mkdirSync(".smoke-data", { recursive: true });
const root = mkdtempSync(resolve(".smoke-data", "updater-"));
app.setPath("userData", root);
// A random payload exercises actual HTTP downloading and SHA-512 validation.
// Installation is intercepted below; no executable or user installation is run.
const payload = randomBytes(2 * 1024 * 1024);
const digest = createHash("sha512").update(payload).digest("base64");
let corrupt = false,
  requests = 0,
  failFeed = false;
const server = createServer((req, res) => {
  if (req.url?.startsWith("/latest.yml")) {
    if (failFeed) {
      res.writeHead(503);
      res.end();
      return;
    }
    res.end(
      `version: 1.7.1\nfiles:\n  - url: update.exe\n    sha512: ${digest}\n    size: ${payload.length}\npath: update.exe\nsha512: ${digest}\nreleaseDate: 2026-09-22T00:00:00.000Z\n`,
    );
  } else if (req.url?.startsWith("/update.exe")) {
    requests++;
    const bytes = Buffer.from(payload);
    if (corrupt) bytes[0] ^= 255;
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": bytes.length,
    });
    res.end(bytes);
  } else {
    res.writeHead(404);
    res.end();
  }
});
async function checkPublishedFeed() {
  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  const config = join(root, "github-update.yml");
  writeFileSync(
    config,
    "provider: github\nowner: CimanesDev\nrepo: Koodex\nupdaterCacheDirName: feed-test\n",
  );
  for (const currentVersion of [version, "1.6.1"]) {
    const adapter = {
      version: currentVersion,
      name: "Koodex Feed Test",
      isPackaged: true,
      appUpdateConfigPath: config,
      userDataPath: root,
      baseCachePath: root,
      whenReady: async () => {},
      relaunch: () => {},
      quit: () => {},
      onQuit: () => {},
    };
    const driver = new NsisUpdater(undefined, adapter);
    driver.httpExecutor = new ElectronHttpExecutor();
    driver.logger = null;
    driver.on("error", (error) => console.error(error.message));
    driver.downloadUpdate = async () => {
      throw new Error("A feed check must not download");
    };
    const updates = new Updates(
      currentVersion,
      () => driver,
      () => {},
    );
    const state = await updates.check();
    assert.equal(
      state.status,
      currentVersion === version ? "current" : "available",
      state.message,
    );
    if (state.status === "available") assert.equal(state.version, version);
    updates.stop();
  }
  console.log(
    "Published GitHub feed passed: current version is up to date, older version sees the new release, no download or install.",
  );
}
async function main() {
  await app.whenReady();
  if (process.argv.includes("--github")) return checkPublishedFeed();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const config = join(root, "app-update.yml");
  writeFileSync(
    config,
    `provider: generic\nurl: http://127.0.0.1:${address.port}/\nupdaterCacheDirName: update-test\n`,
  );
  const adapter = {
    version: "1.7.0",
    name: "Koodex Test",
    isPackaged: true,
    appUpdateConfigPath: config,
    userDataPath: root,
    baseCachePath: root,
    whenReady: async () => {},
    relaunch: () => {},
    quit: () => {},
    onQuit: () => {
      throw new Error("Automatic install-on-quit must stay disabled");
    },
  };
  const driver = new NsisUpdater(undefined, adapter);
  driver.httpExecutor = new ElectronHttpExecutor();
  driver.disableDifferentialDownload = true;
  driver.logger = null;
  let installed = false;
  driver.quitAndInstall = (silent, restart) => {
    assert.equal(silent, true);
    assert.equal(restart, true);
    installed = true;
  };
  const updates = new Updates(
    "1.7.0",
    () => driver,
    () => {},
  );
  failFeed = true;
  assert.equal((await updates.check()).status, "error");
  failFeed = false;
  assert.equal((await updates.check()).status, "available");
  assert.equal(requests, 0, "checking must not download");
  corrupt = true;
  assert.equal((await updates.download()).status, "error");
  updates.install();
  assert.equal(installed, false, "corrupt bytes cannot be installed");
  corrupt = false;
  assert.equal((await updates.download()).status, "ready");
  assert.equal(installed, false, "download must not restart the app");
  assert.ok(driver.installerPath);
  assert.deepEqual(readFileSync(driver.installerPath!), payload);
  updates.install();
  assert.equal(installed, true);
  updates.stop();
  console.log(
    "Updater integration passed: feed errors, explicit download, rejected corrupt SHA-512, retry, verified cached file, explicit restart handoff.",
  );
}
main()
  .then(() => {
    server.close();
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    server.close();
    app.exit(1);
  });
