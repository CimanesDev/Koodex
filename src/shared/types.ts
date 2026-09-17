export interface UsageWindow {
  id: string;
  label: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetsAt: number | null;
  windowMinutes: number | null;
}
export interface CodexUsage {
  windows: UsageWindow[];
  planType?: string;
  credits?: number | null;
  fetchedAt: number;
}
export type SyncState =
  "connecting" | "synced" | "refreshing" | "stale" | "offline" | "error";
export interface Snapshot {
  provider?: "codex" | "claude";
  usage: CodexUsage | null;
  syncState: SyncState;
  error?: string;
}
export interface Settings {
  provider: "codex" | "claude";
  launchAtStartup: boolean;
  notificationsEnabled: boolean;
  refreshIntervalSeconds: 10 | 30 | 60 | 300;
  floatingPillEnabled: boolean;
  pillLayout: "alternating" | "both";
  pillBothStyle: "separate" | "combined";
  pillIndicator: "ring" | "bar";
  pillContent: "details" | "indicator";
  pillShowDragHandle: boolean;
  pillPinOffset: number | null;
  pillPlacement:
    "free" | "top-left" | "top-center" | "top-right" | "left" | "right";
  pillSwitchSeconds: 0 | 2 | 3 | 5;
  accentColor: "neutral" | "blue" | "mint" | "lavender" | "rose";
  pillShowReset: boolean;
  pillShowRefresh: boolean;
  trayStyle: "meter" | "ring";
  setupCompleted: boolean;
  settingsVersion: number;
  pillPosition?: { x: number; y: number };
}
export const defaults: Settings = {
  provider: "codex",
  launchAtStartup: false,
  notificationsEnabled: false,
  refreshIntervalSeconds: 10,
  floatingPillEnabled: true,
  pillLayout: "alternating",
  pillBothStyle: "separate",
  pillIndicator: "ring",
  pillContent: "details",
  pillShowDragHandle: true,
  pillPinOffset: null,
  pillPlacement: "free",
  pillSwitchSeconds: 0,
  accentColor: "neutral",
  pillShowReset: false,
  pillShowRefresh: false,
  trayStyle: "meter",
  setupCompleted: false,
  settingsVersion: 2,
};
export interface Bridge {
  prepareClaudeBridge(): Promise<string>;
  getUsage(): Promise<Snapshot>;
  refreshUsage(): Promise<void>;
  onUsageUpdated(cb: (s: Snapshot) => void): () => void;
  getSettings(): Promise<Settings>;
  updateSettings(s: Partial<Settings>): Promise<Settings>;
  onSettingsUpdated(cb: (s: Settings) => void): () => void;
  openSettings(): Promise<void>;
  closeSettings(): Promise<void>;
  finishSetup(): Promise<void>;
  openPopover(): Promise<void>;
  hidePopover(): Promise<void>;
  quit(): Promise<void>;
  resizePopover(height: number): Promise<void>;
  onView(cb: (view: string) => void): () => void;
}
