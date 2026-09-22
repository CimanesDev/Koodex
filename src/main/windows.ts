import {
  app,
  BrowserWindow,
  screen,
  Menu,
  powerMonitor,
  type WebContents,
} from "electron";
import { join } from "node:path";
import type { Settings } from "../shared/types";
import { clampBounds, nearAnchor, snapBounds, type Rect } from "./positioning";
import {
  DOCK_TAB_WIDTH,
  pillSize,
  pinnedPosition,
  pinOffsetForDrag,
} from "../shared/pill";

export class Windows {
  popover?: BrowserWindow;
  pill?: BrowserWindow;
  preferences?: BrowserWindow;
  private anchor?: Rect;
  private blurredAt = 0;
  private ready = new WeakSet<BrowserWindow>();
  private pendingShow = new Map<BrowserWindow, boolean>();
  private releaseTimers = new Map<BrowserWindow, NodeJS.Timeout>();
  private drag?: { cursor: { x: number; y: number }; bounds: Rect };
  private expanded = false;
  private slideTimer?: NodeJS.Timeout;
  private dockMode = "";
  private restoreOverlay = () => {
    const w = this.pill;
    if (!w || w.isDestroyed() || !w.isVisible()) return;
    // Leave settings and usage details above the pill while open.
    if (this.preferences?.isVisible() || this.popover?.isVisible()) return;
    w.setAlwaysOnTop(true, "screen-saver");
    w.moveTop();
  };
  constructor(
    private getSettings: () => Settings,
    private savePosition: (
      p: { x: number; y: number },
      pinOffset?: number,
    ) => void,
    private hidePill: () => void,
  ) {
    const reposition = () => {
      this.syncPill();
      if (this.popover?.isVisible()) this.position();
    };
    screen.on("display-metrics-changed", reposition);
    screen.on("display-removed", reposition);
    powerMonitor.on("resume", this.restoreOverlay);
    powerMonitor.on("unlock-screen", this.restoreOverlay);
  }
  private all() {
    return [this.popover, this.pill, this.preferences].filter(
      (w): w is BrowserWindow => !!w && !w.isDestroyed(),
    );
  }
  owns(contents: WebContents) {
    return this.all().some((w) => w.webContents === contents);
  }
  private create(
    width: number,
    height: number,
    view: string,
    section?: string,
  ) {
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
        backgroundThrottling: true,
        spellcheck: false,
      },
    });
    // Use the overlay level, rather than the default floating-window level.
    w.setAlwaysOnTop(true, "screen-saver");
    w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    w.webContents.on("will-navigate", (e) => e.preventDefault());
    w.once("ready-to-show", () => {
      this.ready.add(w);
      if (this.pendingShow.has(w)) this.show(w, this.pendingShow.get(w)!);
    });
    w.on("hide", () => this.releaseLater(w));
    w.on("closed", () => {
      clearTimeout(this.releaseTimers.get(w));
      this.releaseTimers.delete(w);
      this.pendingShow.delete(w);
      if (this.popover === w) this.popover = undefined;
      if (this.preferences === w) this.preferences = undefined;
      if (this.pill === w) {
        this.pill = undefined;
        this.expanded = false;
        this.drag = undefined;
        clearInterval(this.slideTimer);
      }
    });
    if (!app.isPackaged && process.env.KOODEX_DEV_URL)
      void w.loadURL(
        `${process.env.KOODEX_DEV_URL}/?view=${view}${section ? `&section=${section}` : ""}`,
      );
    else
      void w.loadFile(join(__dirname, "../renderer/index.html"), {
        query: { view, ...(section ? { section } : {}) },
      });
    return w;
  }
  private show(w: BrowserWindow, focus: boolean) {
    clearTimeout(this.releaseTimers.get(w));
    this.releaseTimers.delete(w);
    this.pendingShow.set(w, focus);
    if (!this.ready.has(w)) return;
    if (focus || !w.isVisible()) w.setAlwaysOnTop(true, "screen-saver");
    if (focus) {
      w.show();
      w.focus();
    } else if (!w.isVisible()) w.showInactive();
  }
  private releaseLater(w: BrowserWindow) {
    this.pendingShow.delete(w);
    clearTimeout(this.releaseTimers.get(w));
    // Let the closing IPC reply arrive and quick reopen clicks reuse the window.
    this.releaseTimers.set(
      w,
      setTimeout(() => {
        this.releaseTimers.delete(w);
        if (!w.isDestroyed() && !w.isVisible()) w.destroy();
      }, 1000),
    );
  }
  private hide(w?: BrowserWindow) {
    if (!w || w.isDestroyed()) return;
    w.hide();
    this.releaseLater(w);
  }
  hidePopover() {
    this.hide(this.popover);
  }
  closeSettings() {
    this.hide(this.preferences);
  }
  open(anchor?: Rect, view = "usage") {
    if (view === "settings") {
      this.openSettings();
      return;
    }
    this.anchor = anchor ??
      this.pill?.getBounds() ?? {
        ...screen.getCursorScreenPoint(),
        width: 1,
        height: 1,
      };
    if (!this.popover) {
      const w = this.create(320, 270, "popover");
      this.popover = w;
      w.on("show", () => this.pill?.webContents.send("view", "paused"));
      w.on("hide", () => this.pill?.webContents.send("view", "usage"));
      w.on("blur", () => {
        this.blurredAt = Date.now();
        this.hidePopover();
      });
      w.on("close", (e) => {
        e.preventDefault();
        this.hidePopover();
      });
    }
    this.position();
    this.show(this.popover, true);
  }
  toggle(anchor: Rect) {
    if (this.popover?.isVisible()) this.hidePopover();
    else if (Date.now() - this.blurredAt > 200) this.open(anchor);
  }
  openSettings(section?: "general") {
    this.hidePopover();
    if (!this.preferences) {
      const w = this.create(740, 760, "settings", section);
      this.preferences = w;
      w.on("blur", () => this.closeSettings());
      w.on("close", (e) => {
        e.preventDefault();
        this.closeSettings();
      });
    }
    const area = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    ).workArea;
    const width = Math.min(740, area.width),
      height = Math.min(760, area.height);
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
    if (section) this.preferences.webContents.send("view", "updates");
    this.show(this.preferences, true);
  }
  resize(height: number) {
    if (!this.popover) return;
    this.popover.setSize(320, Math.max(160, Math.min(520, Math.ceil(height))));
    this.position();
  }
  private position() {
    if (!this.popover) return;
    const anchor = this.anchor ?? screen.getPrimaryDisplay().workArea;
    const area = screen.getDisplayMatching(anchor).workArea;
    this.popover.setBounds(
      nearAnchor(anchor, 320, this.popover.getBounds().height, area),
    );
  }
  syncPill() {
    const settings = this.getSettings();
    const mode =
      settings.pillSideHideable &&
      ["left", "right"].includes(settings.pillPlacement)
        ? settings.pillPlacement
        : "";
    if (mode !== this.dockMode) this.expanded = false;
    this.dockMode = mode;
    clearInterval(this.slideTimer);
    if (!settings.floatingPillEnabled || !settings.setupCompleted) {
      this.hide(this.pill);
      return;
    }
    if (!this.pill) {
      const w = this.create(204, 44, "pill");
      this.pill = w;
      w.on("blur", this.restoreOverlay);
      w.on("show", this.restoreOverlay);
      w.on("close", (e) => {
        e.preventDefault();
        this.hidePill();
      });
      w.on("will-move", (event, bounds) => {
        const current = this.getSettings();
        if (current.pillPlacement !== "free") {
          event.preventDefault();
          const area = screen.getDisplayMatching(w.getBounds()).workArea;
          const offset = pinOffsetForDrag(current, bounds, area);
          const p = pinnedPosition({ ...current, pillPinOffset: offset }, area);
          w.setBounds(clampBounds({ ...bounds, ...p }, area));
          this.savePosition(p, offset);
        } else this.savePosition({ x: bounds.x, y: bounds.y });
      });
      w.webContents.on("context-menu", () =>
        Menu.buildFromTemplate([
          { label: "Usage details", click: () => this.open() },
          { label: "Settings", click: () => this.openSettings() },
          { type: "separator" },
          { label: "Hide floating pill", click: this.hidePill },
        ]).popup({ window: w }),
      );
    }
    const { width, height } = pillSize(settings);
    const area = settings.pillPosition
      ? screen.getDisplayNearestPoint(settings.pillPosition).workArea
      : screen.getPrimaryDisplay().workArea;
    const p = pinnedPosition(settings, area);
    this.pill.setBounds(clampBounds({ ...p, width, height }, area));
    if (this.dockMode) this.pill.setBounds(this.dockBounds(this.expanded));
    this.pill.webContents.setBackgroundThrottling(
      settings.pillSwitchSeconds === 0 || settings.pillLayout === "both",
    );
    this.show(this.pill, false);
    this.restoreOverlay();
  }
  private dockBounds(expanded: boolean): Rect {
    const settings = this.getSettings();
    const area = screen.getDisplayMatching(this.pill!.getBounds()).workArea;
    const size = pillSize(settings);
    const width = expanded ? size.width + DOCK_TAB_WIDTH : DOCK_TAB_WIDTH;
    return clampBounds(
      {
        x:
          settings.pillPlacement === "left"
            ? area.x
            : area.x + area.width - width,
        y: pinnedPosition(settings, area).y,
        width,
        height: size.height,
      },
      area,
    );
  }
  expandPill(expanded: boolean) {
    if (!this.pill || !this.dockMode || typeof expanded !== "boolean") return;
    this.expanded = expanded;
    clearInterval(this.slideTimer);
    const w = this.pill,
      from = w.getBounds(),
      to = this.dockBounds(expanded);
    const start = Date.now();
    this.slideTimer = setInterval(() => {
      if (w.isDestroyed()) {
        clearInterval(this.slideTimer);
        return;
      }
      const progress = Math.min(1, (Date.now() - start) / 180);
      const eased = 1 - (1 - progress) ** 3;
      w.setBounds({
        ...to,
        x: Math.round(from.x + (to.x - from.x) * eased),
        width: Math.round(from.width + (to.width - from.width) * eased),
      });
      if (progress === 1) clearInterval(this.slideTimer);
    }, 16);
  }
  dragPill(phase: unknown) {
    const w = this.pill;
    if (!w || !w.isVisible()) return;
    if (phase === "start") {
      clearInterval(this.slideTimer);
      this.drag = {
        cursor: screen.getCursorScreenPoint(),
        bounds: w.getBounds(),
      };
      return;
    }
    if (!this.drag) return;
    if (phase === "cancel") {
      w.setBounds(this.drag.bounds);
      this.drag = undefined;
      return;
    }
    if (phase !== "move" && phase !== "end") return;
    const cursor = screen.getCursorScreenPoint(),
      settings = this.getSettings();
    const bounds = {
      ...this.drag.bounds,
      x: this.drag.bounds.x + cursor.x - this.drag.cursor.x,
      y: this.drag.bounds.y + cursor.y - this.drag.cursor.y,
    };
    const area =
      settings.pillPlacement === "free"
        ? screen.getDisplayNearestPoint(cursor).workArea
        : screen.getDisplayMatching(this.drag.bounds).workArea;
    if (settings.pillPlacement === "free") {
      const next =
        phase === "end" ? snapBounds(bounds, area) : clampBounds(bounds, area);
      w.setBounds(next);
      if (phase === "end") this.savePosition({ x: next.x, y: next.y });
    } else {
      const offset = pinOffsetForDrag(settings, bounds, area);
      const p = pinnedPosition({ ...settings, pillPinOffset: offset }, area);
      w.setBounds(
        clampBounds(
          {
            ...bounds,
            ...p,
            ...(this.dockMode
              ? {
                  x:
                    settings.pillPlacement === "left"
                      ? area.x
                      : area.x + area.width - bounds.width,
                }
              : {}),
          },
          area,
        ),
      );
      if (phase === "end") this.savePosition(p, offset);
    }
    if (phase === "end") this.drag = undefined;
  }
  broadcast(channel: string, data: unknown) {
    for (const w of this.all()) w.webContents.send(channel, data);
  }
  destroy() {
    powerMonitor.removeListener("resume", this.restoreOverlay);
    powerMonitor.removeListener("unlock-screen", this.restoreOverlay);
    clearInterval(this.slideTimer);
    for (const timer of this.releaseTimers.values()) clearTimeout(timer);
    this.releaseTimers.clear();
    for (const w of this.all()) w.destroy();
  }
}
