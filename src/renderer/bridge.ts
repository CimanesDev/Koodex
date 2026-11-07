// Implements window.Koodex on top of Tauri IPC (see src-tauri/src/main.rs).
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Bridge } from "../shared/types";

function subscribe<T>(event: string, cb: (data: T) => void) {
  let unlisten: (() => void) | undefined;
  let disposed = false;
  void getCurrentWebviewWindow()
    .listen<T>(event, (e) => cb(e.payload))
    .then((off) => (disposed ? off() : (unlisten = off)));
  return () => {
    disposed = true;
    unlisten?.();
  };
}

const bridge: Bridge = {
  getShortcutError: () => invoke("get_shortcut_error"),
  getUpdateState: () => invoke("get_update_state"),
  checkForUpdates: () => invoke("check_for_updates"),
  downloadUpdate: () => invoke("download_update"),
  installUpdate: () => invoke("install_update"),
  openReleases: () => invoke("open_releases"),
  onUpdateState: (cb) => subscribe("updates", cb),
  dragPill: (phase) => invoke("drag_pill", { phase }),
  expandPill: (expanded) => invoke("expand_pill", { expanded }),
  showPillMenu: () => invoke("pill_menu"),
  getUsage: () => invoke("get_usage"),
  getAllUsage: () => invoke("get_all_usage"),
  getShownUsage: () => invoke("get_shown_usage"),
  onShownUsage: (cb) => subscribe("usage-all", cb),
  refreshUsage: () => invoke("refresh_usage"),
  onUsageUpdated: (cb) => subscribe("usage", cb),
  getSettings: () => invoke("get_settings"),
  updateSettings: (patch) => invoke("update_settings", { patch }),
  onSettingsUpdated: (cb) => subscribe("settings", cb),
  openSettings: () => invoke("open_settings"),
  closeSettings: () => invoke("close_settings"),
  finishSetup: () => invoke("finish_setup"),
  openPopover: () => invoke("open_popover"),
  hidePopover: () => invoke("hide_popover"),
  quit: () => invoke("quit"),
  resizePopover: (height) => invoke("resize_popover", { height }),
  onView: (cb) => subscribe("view", cb),
};

window.Koodex = bridge;

// A tray utility has no browser chrome: no reload, print or default menus.
window.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement | null;
  if (!target?.closest("input, textarea")) e.preventDefault();
});
window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (
    key === "f5" ||
    key === "f7" ||
    ((e.ctrlKey || e.metaKey) && ["r", "p", "f", "g", "j", "u"].includes(key))
  )
    e.preventDefault();
});
