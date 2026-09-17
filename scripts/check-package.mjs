import assert from "node:assert/strict";
import { listPackage } from "@electron/asar";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const directory = resolve("release", version, "win-unpacked");
const archive = join(directory, "resources", "app.asar");
const files = listPackage(archive).map((p) => p.replaceAll("\\", "/"));
for (const path of [
  "/dist/main/main.js",
  "/dist/preload/preload.js",
  "/dist/renderer/index.html",
  "/assets/icons/koodex.ico",
  "/assets/claude-bridge.cjs",
  "/assets/tray/light-logo.png",
  "/assets/tray/dark-logo.png",
])
  assert.ok(files.includes(path), `Missing runtime file: ${path}`);
assert.ok(
  !files.some((p) => /\/node_modules\/|\/screenshots\/|\.map$/.test(p)),
  "Do not ship duplicate dependencies, screenshots or source maps",
);
assert.deepEqual(readdirSync(join(directory, "locales")), ["en-US.pak"]);
for (const theme of ["light", "dark"])
  for (const style of ["ring", "meter"])
    for (let first = -1; first <= 10; first++)
      for (let second = -1; second <= 10; second++) {
        assert.ok(
          files.includes(
            `/assets/tray/${theme}-${style}-dual-${first}-${second}.png`,
          ),
        );
      }
function bytes(path) {
  const stat = statSync(path);
  return stat.isDirectory()
    ? readdirSync(path).reduce((sum, file) => sum + bytes(join(path, file)), 0)
    : stat.size;
}
console.log(
  JSON.stringify(
    {
      version,
      archiveBytes: bytes(archive),
      unpackedBytes: bytes(directory),
      installerBytes: bytes(
        resolve("release", version, `Koodex-${version}-x64-nsis.exe`),
      ),
      portableBytes: bytes(
        resolve("release", version, `Koodex-${version}-x64-portable.exe`),
      ),
    },
    null,
    2,
  ),
);
console.log(
  "Package audit passed: required assets present; only English locale; no duplicate runtime dependencies, screenshots or debug maps.",
);
