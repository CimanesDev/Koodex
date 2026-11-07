// Runs the app against sample data in a separate profile; never contacts Codex or Claude.
// Scenarios: normal, low, critical, single-window, offline, loading.
import { spawn } from "node:child_process";
const env = { ...process.env, KOODEX_MOCK: process.env.KOODEX_MOCK || "normal" };
spawn("npx", ["tauri", "dev"], { stdio: "inherit", env, shell: true }).on("exit", (code) =>
  process.exit(code ?? 0),
);
