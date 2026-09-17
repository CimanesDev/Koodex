// Claude Code status-line bridge. Never persist transcripts, prompts or credentials.
const { writeFileSync, renameSync, unlinkSync } = require("node:fs");
const { join } = require("node:path");
let input = "";
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
        used_percentage: typeof value.used_percentage === "number" && Number.isFinite(value.used_percentage)
          ? Math.max(0, Math.min(100, value.used_percentage)) : null,
        resets_at: typeof value.resets_at === "number" && Number.isFinite(value.resets_at) && value.resets_at > 0
          ? value.resets_at : null,
      };
    }
    writeFileSync(temporary, JSON.stringify({ receivedAt: Date.now(), rate_limits: limits }), { mode: 0o600 });
    renameSync(temporary, join(__dirname, "claude-usage.json"));
    const labels = Object.entries(limits).map(([key, value]) =>
      `${key === "five_hour" ? "5h" : "Weekly"}: ${value.used_percentage === null ? "unavailable" : `${Math.round(100 - value.used_percentage)}% left`}`);
    process.stdout.write(labels.length ? labels.join(" | ") : "Koodex: waiting for Claude quota data");
  } catch {
    // A malformed update must not break the user's terminal status line.
    process.stdout.write("Koodex: quota update unavailable");
  } finally {
    try { unlinkSync(temporary); } catch {}
  }
});
