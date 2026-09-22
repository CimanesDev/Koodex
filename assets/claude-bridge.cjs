// Claude Code status-line bridge. Never persist transcripts, prompts or credentials.
const {
  writeFileSync,
  renameSync,
  unlinkSync,
  existsSync,
} = require("node:fs");
const { join, dirname } = require("node:path");
const { spawnSync } = require("node:child_process");
let input = "";
function output(text) {
  if (!module.exports.previousCommand) return process.stdout.write(text);
  // Claude Code runs status-line commands through Bash, including on Windows.
  const command = Buffer.from(
    module.exports.previousCommand,
    "base64",
  ).toString();
  let shell = process.env.CLAUDE_CODE_GIT_BASH_PATH;
  if (!shell && process.platform === "win32") {
    const git = spawnSync("where.exe", ["git"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 1000,
    })
      .stdout?.trim()
      .split(/\r?\n/)[0];
    shell = [
      git && join(dirname(git), "..", "bin", "bash.exe"),
      join(
        process.env.ProgramFiles || "C:/Program Files",
        "Git",
        "bin",
        "bash.exe",
      ),
      process.env.LOCALAPPDATA &&
        join(process.env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe"),
    ].find((path) => path && existsSync(path));
  }
  const result = spawnSync(shell || "bash", ["-c", command], {
    input,
    encoding: "utf8",
    windowsHide: true,
    timeout: 4000,
    maxBuffer: 1024 * 1024,
  });
  process.stdout.write(result.error ? text : (result.stdout ?? ""));
}
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  if (input.length > 1024 * 1024) process.exit(0);
});
process.stdin.on("end", () => {
  const temporary = join(__dirname, `claude-usage-${process.pid}.tmp`);
  try {
    const data = JSON.parse(input);
    const limits = {};
    for (const key of ["five_hour", "seven_day"]) {
      const value = data?.rate_limits?.[key];
      if (!value || typeof value !== "object") continue;
      limits[key] = {
        used_percentage:
          typeof value.used_percentage === "number" &&
          Number.isFinite(value.used_percentage)
            ? Math.max(0, Math.min(100, value.used_percentage))
            : null,
        resets_at:
          typeof value.resets_at === "number" &&
          Number.isFinite(value.resets_at) &&
          value.resets_at > 0
            ? value.resets_at
            : null,
      };
    }
    writeFileSync(
      temporary,
      JSON.stringify({ receivedAt: Date.now(), rate_limits: limits }),
      { mode: 0o600 },
    );
    renameSync(temporary, join(__dirname, "claude-usage.json"));
    const labels = Object.entries(limits).map(
      ([key, value]) =>
        `${key === "five_hour" ? "5h" : "Weekly"}: ${value.used_percentage === null ? "unavailable" : `${Math.round(100 - value.used_percentage)}% left`}`,
    );
    output(
      labels.length
        ? labels.join(" | ")
        : "Koodex: waiting for Claude quota data",
    );
  } catch {
    // A malformed update must not break the user's terminal status line.
    output("Koodex: quota update unavailable");
  } finally {
    try {
      unlinkSync(temporary);
    } catch {}
  }
});
