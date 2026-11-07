// Writes SHA256SUMS.txt next to the NSIS installer. The in-app updater refuses
// releases whose installer is not listed here, so upload it with every release.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = join(process.env.CARGO_TARGET_DIR || "src-tauri/target", "release/bundle/nsis");
const lines = readdirSync(dir)
  .filter((name) => name.endsWith("-setup.exe"))
  .map((name) => `${createHash("sha256").update(readFileSync(join(dir, name))).digest("hex")}  ${name}`);
if (!lines.length) throw new Error(`No installer found in ${dir}`);
writeFileSync(join(dir, "SHA256SUMS.txt"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
