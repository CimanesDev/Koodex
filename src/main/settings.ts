import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { defaults, type Settings, type CodexUsage } from "../shared/types";
export function validateSettings(value: unknown): Partial<Settings> {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const out: Partial<Settings> = {};
  if (
    ["off", "CommandOrControl+Shift+K", "CommandOrControl+Alt+K"].includes(
      v.pillShortcut as string,
    )
  )
    out.pillShortcut = v.pillShortcut as Settings["pillShortcut"];
  if (["auto", "light", "dark"].includes(v.trayColor as string))
    out.trayColor = v.trayColor as Settings["trayColor"];
  if (v.pillMaterial === "solid" || v.pillMaterial === "glass")
    out.pillMaterial = v.pillMaterial;
  if (
    typeof v.pillOpacity === "number" &&
    Number.isFinite(v.pillOpacity) &&
    v.pillOpacity >= 35 &&
    v.pillOpacity <= 100
  )
    out.pillOpacity = Math.round(v.pillOpacity);
  if (
    v.pillPinOffset === null ||
    (typeof v.pillPinOffset === "number" &&
      Number.isFinite(v.pillPinOffset) &&
      v.pillPinOffset >= 0 &&
      v.pillPinOffset <= 1)
  )
    out.pillPinOffset = v.pillPinOffset;
  if (v.provider === "codex" || v.provider === "claude")
    out.provider = v.provider;
  if (v.pillBothStyle === "separate" || v.pillBothStyle === "combined")
    out.pillBothStyle = v.pillBothStyle;
  if (v.pillContent === "details" || v.pillContent === "indicator")
    out.pillContent = v.pillContent;
  if (
    ["free", "top-left", "top-center", "top-right", "left", "right"].includes(
      v.pillPlacement as string,
    )
  )
    out.pillPlacement = v.pillPlacement as Settings["pillPlacement"];
  if (v.trayStyle === "meter" || v.trayStyle === "ring")
    out.trayStyle = v.trayStyle;
  if (v.trayStyle === "logo") out.trayStyle = "meter";
  if (v.pillLayout === "alternating" || v.pillLayout === "both")
    out.pillLayout = v.pillLayout;
  if (v.pillIndicator === "ring" || v.pillIndicator === "bar")
    out.pillIndicator = v.pillIndicator;
  if (
    v.pillSwitchSeconds === 0 ||
    v.pillSwitchSeconds === 2 ||
    v.pillSwitchSeconds === 3 ||
    v.pillSwitchSeconds === 5
  )
    out.pillSwitchSeconds = v.pillSwitchSeconds;
  if (
    ["neutral", "blue", "mint", "lavender", "rose"].includes(
      v.accentColor as string,
    )
  )
    out.accentColor = v.accentColor as Settings["accentColor"];
  for (const key of [
    "monitorBoth",
    "launchAtStartup",
    "notificationsEnabled",
    "floatingPillEnabled",
    "pillShowReset",
    "showRefreshActivity",
    "pillShowRefresh",
    "pillShowDragHandle",
    "pillSideHideable",
  ] as const)
    if (typeof v[key] === "boolean") out[key] = v[key];
  if (
    v.refreshIntervalSeconds === 10 ||
    v.refreshIntervalSeconds === 30 ||
    v.refreshIntervalSeconds === 60 ||
    v.refreshIntervalSeconds === 300
  )
    out.refreshIntervalSeconds = v.refreshIntervalSeconds;
  const p = v.pillPosition as { x?: number; y?: number } | undefined;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y))
    out.pillPosition = { x: Math.round(p.x!), y: Math.round(p.y!) };
  return out;
}
export class Store {
  constructor(private directory: string) {
    mkdirSync(directory, { recursive: true });
  }
  read<T>(name: string, fallback: T): T {
    try {
      const file = join(this.directory, name + ".json");
      return existsSync(file)
        ? JSON.parse(readFileSync(file, "utf8"))
        : fallback;
    } catch {
      return fallback;
    }
  }
  write(name: string, value: unknown) {
    const file = join(this.directory, name + ".json");
    writeFileSync(file + ".tmp", JSON.stringify(value), "utf8");
    renameSync(file + ".tmp", file);
  }
  settings(): Settings {
    const saved = this.read<Record<string, unknown> | null>("settings", null);
    return migrateSettings(saved);
  }
  cache(): CodexUsage | null {
    const data = this.read<{ usage?: CodexUsage }>("usage", {}).usage;
    if (
      !data ||
      !Number.isFinite(data.fetchedAt) ||
      !Array.isArray(data.windows)
    )
      return null;
    if (
      !data.windows.every(
        (w) =>
          w &&
          typeof w.id === "string" &&
          typeof w.label === "string" &&
          (w.remainingPercent === null ||
            (Number.isFinite(w.remainingPercent) &&
              w.remainingPercent >= 0 &&
              w.remainingPercent <= 100)) &&
          (w.resetsAt === null || Number.isFinite(w.resetsAt)),
      )
    )
      return null;
    return data;
  }
}
export function migrateSettings(
  saved: Record<string, unknown> | null,
): Settings {
  const settings = { ...defaults, ...validateSettings(saved) };
  if (saved && typeof saved === "object") {
    // Legacy automatic cycling was implicit. Upgrades start with deliberate clicks.
    if (saved.settingsVersion !== 2) settings.pillSwitchSeconds = 0;
    settings.setupCompleted =
      saved.settingsVersion === 2 ? saved.setupCompleted === true : true;
  }
  return settings;
}
