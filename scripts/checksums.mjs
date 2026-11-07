// Writes SHA256SUMS.txt (read by Koodex 2's updater) and latest.yml (read by
// Koodex 1.x's electron-updater, so 1.x installs are offered 2.x) next to the
// NSIS installer. Upload all three files with every release.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = join(process.env.CARGO_TARGET_DIR || "src-tauri/target", "release/bundle/nsis");
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const name = `Koodex_${version}_x64-setup.exe`;
const data = readFileSync(join(dir, name));
const sha256 = createHash("sha256").update(data).digest("hex");
const sha512 = createHash("sha512").update(data).digest("base64");
writeFileSync(join(dir, "SHA256SUMS.txt"), `${sha256}  ${name}\n`);
writeFileSync(
  join(dir, "latest.yml"),
  [
    `version: ${version}`,
    "files:",
    `  - url: ${name}`,
    `    sha512: ${sha512}`,
    `    size: ${data.length}`,
    `path: ${name}`,
    `sha512: ${sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    "",
  ].join("\n"),
);
console.log(`${name}\n  sha256 ${sha256}\n  size   ${data.length}`);
