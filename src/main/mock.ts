import type { Snapshot } from "../shared/types";
export function mockSnapshot(scenario: string): Snapshot {
  const now = Date.now();
  const values =
    scenario === "critical" ? [4, 8] : scenario === "low" ? [22, 14] : [68, 42];
  const windows = [
    {
      id: "five-hour",
      label: "5-hour",
      usedPercent: 100 - values[0],
      remainingPercent: values[0],
      resetsAt: now + 138 * 60000,
      windowMinutes: 300,
    },
    {
      id: "weekly",
      label: "Weekly",
      usedPercent: 100 - values[1],
      remainingPercent: values[1],
      resetsAt: now + 86 * 3600000,
      windowMinutes: 10080,
    },
  ];
  return {
    usage:
      scenario === "loading"
        ? null
        : {
            windows: scenario === "single-window" ? windows.slice(1) : windows,
            fetchedAt: scenario === "offline" ? now - 8 * 60000 : now,
          },
    syncState:
      scenario === "offline"
        ? "stale"
        : scenario === "loading"
          ? "connecting"
          : "synced",
    error:
      scenario === "offline"
        ? "Unable to read Codex usage. Retrying automatically."
        : undefined,
  };
}
