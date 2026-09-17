import assert from "node:assert/strict";
import { CodexServer } from "../src/main/codex/CodexServer";
import { adaptUsage } from "../src/main/codex/usageAdapter";
async function main() {
  const server = new CodexServer();
  let pid: number | undefined;
  try {
    const raw = await server.read();
    pid = server.pid;
    const usage = adaptUsage(raw);
    assert.ok(usage.windows.length > 0, "No quota windows reported");
    console.log("Live read passed:", usage.windows.map((w) => w.id).join(", "));
    await server.read();
    assert.equal(server.pid, pid, "Connection should reuse one process");
  } finally {
    await server.stop();
  }
  if (pid) {
    await new Promise((r) => setTimeout(r, 300));
    assert.throws(
      () => process.kill(pid!, 0),
      "Owned Codex process should exit",
    );
    console.log("Codex process cleanup passed");
  }
}
void main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
