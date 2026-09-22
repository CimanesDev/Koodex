import { contextBridge, ipcRenderer } from "electron";
import type { Bridge } from "../shared/types";
function subscribe<T>(channel: string, cb: (data: T) => void) {
  const listener = (_event: Electron.IpcRendererEvent, data: T) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
const bridge: Bridge = {
  getUpdateState: () => ipcRenderer.invoke("updates:get"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  openReleases: () => ipcRenderer.invoke("updates:releases"),
  onUpdateState: (cb) => subscribe("updates", cb),
  dragPill: (phase) => ipcRenderer.invoke("pill:drag", phase),
  expandPill: (expanded) => ipcRenderer.invoke("pill:expand", expanded),
  prepareClaudeBridge: () => ipcRenderer.invoke("claude:prepare"),
  getUsage: () => ipcRenderer.invoke("usage:get"),
  refreshUsage: () => ipcRenderer.invoke("usage:refresh"),
  onUsageUpdated: (cb) => subscribe("usage", cb),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (s) => ipcRenderer.invoke("settings:update", s),
  onSettingsUpdated: (cb) => subscribe("settings", cb),
  openSettings: () => ipcRenderer.invoke("settings:open"),
  closeSettings: () => ipcRenderer.invoke("settings:close"),
  finishSetup: () => ipcRenderer.invoke("settings:finish"),
  openPopover: () => ipcRenderer.invoke("popover:open"),
  hidePopover: () => ipcRenderer.invoke("popover:hide"),
  quit: () => ipcRenderer.invoke("quit"),
  resizePopover: (h) => ipcRenderer.invoke("popover:resize", h),
  onView: (cb) => subscribe("view", cb),
};
contextBridge.exposeInMainWorld("Koodex", bridge);
