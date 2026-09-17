import { app } from "electron";
export function setStartup(enabled: boolean) {
  if (!app.isPackaged)
    throw new Error("Launch at startup is available in the packaged app.");
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
    args: ["--startup"],
  });
}
