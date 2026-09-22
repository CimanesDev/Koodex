import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
import { mkdirSync } from "node:fs";
mkdirSync("test-results", { recursive: true });
await build({
  entryPoints: ["scripts/updater-harness.ts"],
  outfile: "test-results/updater-harness.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  electron,
  ["test-results/updater-harness.cjs", ...process.argv.slice(2)],
  {
    env,
    stdio: "inherit",
    windowsHide: true,
  },
);
child.on("exit", (code) => process.exit(code ?? 1));
