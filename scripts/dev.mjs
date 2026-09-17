import { spawn } from "node:child_process";
import { build } from "esbuild";
import { createServer } from "vite";
import electron from "electron";
await build({
  entryPoints: ["src/main/main.ts", "src/preload/preload.ts"],
  outdir: "dist",
  outbase: "src",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  sourcemap: true,
});
const server = await createServer({
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
await server.listen();
const env = {
  ...process.env,
  KOODEX_DEV_URL: "http://127.0.0.1:5173",
  ...(process.argv.includes("--mock")
    ? { KOODEX_MOCK: process.env.KOODEX_MOCK || "normal" }
    : {}),
};
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ["."], {
  stdio: "inherit",
  env,
  windowsHide: true,
});
child.on("exit", async () => {
  await server.close();
  process.exit();
});
process.on("SIGINT", () => child.kill());
