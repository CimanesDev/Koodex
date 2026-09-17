import { app, BrowserWindow, screen, Menu } from "electron";
import { join } from "node:path";
import type { Settings } from "../shared/types";
import { clampBounds, nearAnchor, type Rect } from "./positioning";
import { pillSize, pinnedPosition } from "../shared/pill";
export class Windows {
  popover: BrowserWindow;
  pill: BrowserWindow;
  preferences: BrowserWindow;
  private anchor?: Rect;
  private ready = false;
  private pendingView = "usage";
  private blurredAt = 0;
  constructor(
    private getSettings: () => Settings,
    savePosition: (p: { x: number; y: number }) => void,
    hidePill: () => void,
  ) {
    this.popover = this.create(320, 270, "popover");
    this.pill = this.create(204, 44, "pill");
    this.preferences = this.create(680, 640, "settings");
    this.preferences.on("close", (e) => {
      e.preventDefault();
      this.preferences.hide();
    });
    this.popover.on("show", () => this.pill.webContents.send("view", "paused"));
    this.popover.on("hide", () => this.pill.webContents.send("view", "usage"));
    this.popover.on("blur", () => {
      this.blurredAt = Date.now();
      this.popover.hide();
    });
    this.popover.on("close", (e) => {
      e.preventDefault();
      this.popover.hide();
    });
    this.pill.on("close", (e) => {
      e.preventDefault();
      hidePill();
    });
    this.popover.webContents.on("did-finish-load", () => {
      this.ready = true;
      this.popover.webContents.send("view", this.pendingView);
    });
    this.pill.once("ready-to-show", () => this.syncPill());
    this.pill.on("will-move", (event, bounds) => {
      if (
        this.getSettings().pillPlacement !== "free" ||
        !this.getSettings().pillShowDragHandle
      ) {
        event.preventDefault();
        return;
      }
      const { x, y } = bounds;
      savePosition({ x, y });
    });
    this.pill.webContents.on("context-menu", () =>
      Menu.buildFromTemplate([
        { label: "Usage details", click: () => this.open() },
        { label: "Settings", click: () => this.openSettings() },
        { type: "separator" },
        { label: "Hide floating pill", click: hidePill },
      ]).popup({ window: this.pill }),
    );
    const reposition = () => {
      this.syncPill();
      if (this.popover.isVisible()) this.position();
    };
    screen.on("display-metrics-changed", reposition);
    screen.on("display-removed", reposition);
  }
  private create(width: number, height: number, view: string) {
    const w = new BrowserWindow({
      width,
      height,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      roundedCorners: true,
      hasShadow: true,
      icon: join(app.getAppPath(), "assets/icons/koodex.ico"),
      webPreferences: {
        preload: join(__dirname, "../preload/preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Keep the visible, unfocused pill's rotation timer responsive.
        backgroundThrottling: view !== "pill",
      },
    });
    w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    w.webContents.on("will-navigate", (e) => e.preventDefault());
    if (!app.isPackaged && process.env.KOODEX_DEV_URL)
      void w.loadURL(`${process.env.KOODEX_DEV_URL}/?view=${view}`);
    else
      void w.loadFile(join(__dirname, "../renderer/index.html"), {
        query: { view },
      });
    return w;
  }
  open(anchor?: Rect, view = "usage") {
    if (view === "settings") {
      this.openSettings();
      return;
    }
    this.anchor = anchor ?? this.pill.getBounds();
    this.pendingView = view;
    this.position();
    if (this.ready) this.popover.webContents.send("view", view);
    this.popover.show();
    this.popover.focus();
  }
  toggle(anchor: Rect) {
    if (this.popover.isVisible()) this.popover.hide();
    // Windows blurs the popover before delivering a second tray click.
    else if (Date.now() - this.blurredAt > 200) this.open(anchor);
  }
  openSettings() {
    this.popover.hide();
    const area = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    ).workArea;
    const width = Math.min(680, area.width),
      height = Math.min(640, area.height);
    this.preferences.setBounds(
      clampBounds(
        {
          x: area.x + (area.width - width) / 2,
          y: area.y + (area.height - height) / 2,
          width,
          height,
        },
        area,
      ),
    );
    this.preferences.show();
    this.preferences.focus();
  }
  resize(height: number) {
    this.popover.setSize(320, Math.max(160, Math.min(520, Math.ceil(height))));
    this.position();
  }
  private position() {
    const anchor = this.anchor ?? screen.getPrimaryDisplay().workArea;
    const area = screen.getDisplayMatching(anchor).workArea;
    this.popover.setBounds(
      nearAnchor(anchor, 320, this.popover.getBounds().height, area),
    );
  }
  syncPill() {
    const settings = this.getSettings();
    if (!settings.floatingPillEnabled || !settings.setupCompleted) {
      this.pill.webContents.setBackgroundThrottling(true);
      this.pill.hide();
      return;
    }
    const primary = screen.getPrimaryDisplay().workArea;
    const { width, height } = pillSize(settings);
    const area = settings.pillPosition
      ? screen.getDisplayNearestPoint(settings.pillPosition).workArea
      : primary;
    const p = pinnedPosition(settings, area);
    this.pill.setBounds(clampBounds({ ...p, width, height }, area));
    this.pill.webContents.setBackgroundThrottling(false);
    if (!this.pill.isVisible()) this.pill.showInactive();
  }
  broadcast(channel: string, data: unknown) {
    for (const w of [this.popover, this.pill, this.preferences])
      if (!w.isDestroyed()) w.webContents.send(channel, data);
  }
  destroy() {
    this.popover.destroy();
    this.pill.destroy();
    this.preferences.destroy();
  }
}
