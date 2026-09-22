import { Tray, Menu, nativeImage, nativeTheme, app } from "electron";
import { join } from "node:path";
import type { Settings, Snapshot, UpdateState } from "../shared/types";
import type { Windows } from "./windows";
import { trayLevels } from "../shared/quotas";
export class KoodexTray {
  readonly tray: Tray;
  private style: Settings["trayStyle"] = "meter";
  private amounts: readonly [number, number] = [-1, -1];
  private color: Settings["trayColor"] = "auto";
  private iconKey = "";
  private menuKey = "";
  constructor(
    private windows: Windows,
    private refresh: () => void,
    private update: (s: Partial<Settings>) => void,
  ) {
    this.tray = new Tray(this.icon());
    this.tray.on("click", () => windows.toggle(this.tray.getBounds()));
    nativeTheme.on("updated", () => {
      this.iconKey = "";
      this.tray.setImage(this.icon());
    });
  }
  private icon() {
    return nativeImage.createFromPath(
      join(
        app.getAppPath(),
        "assets/tray",
        `${this.color === "auto" ? (nativeTheme.shouldUseDarkColorsForSystemIntegratedUI ? "light" : "dark") : this.color}-${this.style}-dual-${this.amounts[0]}-${this.amounts[1]}.png`,
      ),
    );
  }
  render(state: Snapshot, settings: Settings, updates?: UpdateState) {
    this.style = settings.trayStyle;
    this.color = settings.trayColor;
    this.amounts = trayLevels(state.usage?.windows ?? []);
    const key = this.color + "-" + `${this.style}-${this.amounts.join("-")}`;
    if (key !== this.iconKey) {
      this.tray.setImage(this.icon());
      this.iconKey = key;
    }
    const lines =
      state.usage?.windows.map(
        (w) =>
          `${w.id === "five-hour" ? "5h" : w.label}: ${w.remainingPercent === null ? "unavailable" : `${Math.round(w.remainingPercent)}% left`}`,
      ) ?? [];
    this.tray.setToolTip(
      [
        `Koodex · ${settings.provider === "claude" ? "Claude Code" : "Codex"}`,
        ...lines,
        ...(state.syncState === "synced"
          ? []
          : [
              state.syncState === "stale"
                ? "Offline · cached usage"
                : state.syncState,
            ]),
      ]
        .join("\n")
        .slice(0, 127),
    );
    const menuKey = JSON.stringify([
      lines,
      settings.launchAtStartup,
      settings.floatingPillEnabled,
      updates?.status,
      updates?.version,
    ]);
    if (menuKey === this.menuKey) return;
    this.menuKey = menuKey;
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Koodex", enabled: false },
        ...lines.map((label) => ({ label, enabled: false })),
        { type: "separator" },
        {
          label: "Open",
          click: () => this.windows.open(this.tray.getBounds()),
        },
        { label: "Refresh", click: this.refresh },
        { type: "separator" },
        {
          label: "Launch at startup",
          type: "checkbox",
          checked: settings.launchAtStartup,
          enabled: app.isPackaged,
          click: (item) => this.update({ launchAtStartup: item.checked }),
        },
        {
          label: "Show floating pill",
          type: "checkbox",
          checked: settings.floatingPillEnabled,
          click: (item) => this.update({ floatingPillEnabled: item.checked }),
        },
        {
          label: "Settings",
          click: () => this.windows.openSettings(),
        },
        {
          label:
            updates?.status === "ready"
              ? "Update ready to install..."
              : updates?.status === "available"
                ? `Update ${updates.version} available...`
                : "App updates...",
          click: () => this.windows.openSettings("general"),
        },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ]),
    );
  }
}
