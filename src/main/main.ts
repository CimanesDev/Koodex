import {
  app,
  globalShortcut,
  ipcMain,
  Notification,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { join, dirname } from "node:path";
import { watchFile, unwatchFile, existsSync } from "node:fs";
import { claudeFile, connectClaude, readClaude } from "./claude";
import { UsageMonitor } from "./UsageMonitor";
import { PillShortcut } from "./shortcuts";
import { Updates } from "./updates";
import { Store, validateSettings } from "./settings";
import { Windows } from "./windows";
import { KoodexTray } from "./tray";
import { CodexServer } from "./codex/CodexServer";
import { adaptUsage } from "./codex/usageAdapter";
import { explainError } from "./codex/errors";
import { mockSnapshot } from "./mock";
import { setStartup } from "./startup";
import { collectAlerts, type AlertLedger } from "./notifications";
import { resetIn } from "../shared/format";
import type { Settings, Snapshot } from "../shared/types";

const mock = process.env.KOODEX_MOCK;
if (mock) app.setPath("userData", join(app.getPath("appData"), "Koodex-mock"));
if (process.env.KOODEX_TEST_DATA)
  app.setPath("userData", process.env.KOODEX_TEST_DATA);
app.setAppUserModelId("com.koodex.desktop");
const server = new CodexServer();
let quitting = false;
let windows: Windows | undefined;
let tray: KoodexTray | undefined;
let stopMonitoring: (() => void) | undefined;
let updates: Updates | undefined;
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (windows && tray) windows.open(tray.tray.getBounds());
  });
  app.on("window-all-closed", () => {});
  app.on("before-quit", (e) => {
    if (quitting) return;
    e.preventDefault();
    quitting = true;
    stopMonitoring?.();
    globalShortcut.unregisterAll();
    updates?.stop();
    unwatchFile(claudeFile(app.getPath("userData")));
    void server.stop().finally(() => {
      tray?.tray.destroy();
      windows?.destroy();
      app.quit();
    });
  });
  void app.whenReady().then(() => {
    const store = new Store(app.getPath("userData"));
    let settings = store.settings();
    let claudeSetupError = "";
    function setupClaude() {
      try {
        const result = connectClaude(
          app.getAppPath(),
          app.getPath("userData"),
          process.env.KOODEX_TEST_DATA
            ? join(app.getPath("userData"), "claude-config")
            : undefined,
        );
        claudeSetupError = "";
        return result;
      } catch (error) {
        claudeSetupError =
          error instanceof Error
            ? error.message
            : "Could not connect Claude Code.";
        throw error;
      }
    }
    if (settings.provider === "claude" || settings.monitorBoth) {
      try {
        setupClaude();
      } catch {
        /* Report the actionable setup error through usage state. */
      }
    }
    let cacheFingerprint = "";
    let cacheSavedAt = 0;
    const persist = (name: string, value: unknown) => {
      try {
        store.write(name, value);
      } catch {
        console.warn("Koodex could not persist " + name);
      }
    };
    const ledgers: Record<Settings["provider"], AlertLedger> = {
      codex: {},
      claude: {},
    };
    for (const provider of ["codex", "claude"] as const) {
      const saved = store.read<AlertLedger>(
        provider === "claude" ? "alerts-claude" : "alerts",
        {},
      );
      if (saved && typeof saved === "object" && !Array.isArray(saved))
        ledgers[provider] = saved;
    }
    persist("settings", settings);
    const snapshot = (): Snapshot => ({
      ...monitors[settings.provider].snapshot,
      ...(settings.monitorBoth
        ? {
            companion:
              monitors[settings.provider === "codex" ? "claude" : "codex"]
                .snapshot,
          }
        : {}),
    });
    const publish = () => {
      if (quitting) return;
      const state = snapshot();
      windows?.broadcast("usage", state);
      tray?.render(state, settings, updates?.get());
    };
    function changed(state: Snapshot) {
      if (quitting) return;
      const provider = state.provider!;
      if (state.syncState === "synced" && state.usage) {
        if (provider === "codex" && !mock) {
          const fingerprint = JSON.stringify({ ...state.usage, fetchedAt: 0 });
          if (
            fingerprint !== cacheFingerprint ||
            Date.now() - cacheSavedAt >= 60000
          ) {
            persist("usage", {
              usage: state.usage,
              fetchedAt: state.usage.fetchedAt,
            });
            cacheFingerprint = fingerprint;
            cacheSavedAt = Date.now();
          }
        }
        // Existing alerts continue to follow the selected tray provider.
        if (
          !mock &&
          provider === settings.provider &&
          settings.notificationsEnabled &&
          Notification.isSupported()
        ) {
          const ledger = ledgers[provider];
          const before = JSON.stringify(ledger);
          for (const a of collectAlerts(state.usage, ledger))
            new Notification({
              title: "Koodex",
              body: `Your ${a.label} ${provider === "claude" ? "Claude Code" : "Codex"} limit has ${Math.round(a.remaining)}% remaining. Resets in ${resetIn(a.resetsAt)}.`,
            }).show();
          if (JSON.stringify(ledger) !== before)
            persist(provider === "claude" ? "alerts-claude" : "alerts", ledger);
        }
      }
      publish();
    }
    const monitors = {
      codex: new UsageMonitor(
        { provider: "codex", usage: store.cache(), syncState: "stale" },
        async () =>
          mock
            ? { ...mockSnapshot(mock), provider: "codex" }
            : {
                provider: "codex",
                usage: adaptUsage(await server.read()),
                syncState: "synced",
              },
        changed,
        () => settings.refreshIntervalSeconds * 1000,
        async (error) => {
          await server.stop();
          return explainError(error);
        },
      ),
      claude: new UsageMonitor(
        readClaude(app.getPath("userData")),
        () =>
          claudeSetupError
            ? {
                provider: "claude",
                usage: null,
                syncState: "error",
                error: claudeSetupError,
              }
            : readClaude(app.getPath("userData")),
        changed,
        () => 10000,
        async () =>
          "Could not read the local Claude report. Reconnect Claude Code and try again.",
      ),
    };
    stopMonitoring = () => {
      monitors.codex.setActive(false);
      monitors.claude.setActive(false);
    };
    const refresh = async () => {
      await Promise.all([monitors.codex.refresh(), monitors.claude.refresh()]);
    };
    const shortcut = new PillShortcut(globalShortcut, () => {
      try {
        update({ floatingPillEnabled: !settings.floatingPillEnabled });
      } catch {
        /* A failed settings write leaves the previous visibility intact. */
      }
    });
    try {
      shortcut.set(settings.pillShortcut);
    } catch {
      /* Shown in General settings. */
    }
    function syncMonitors() {
      const codexActive = settings.monitorBoth || settings.provider === "codex";
      monitors.codex.setActive(codexActive);
      monitors.claude.setActive(
        settings.monitorBoth || settings.provider === "claude",
      );
      if (!codexActive) void server.stop();
      syncClaudeWatcher();
    }
    function update(patch: Partial<Settings>) {
      const clean = validateSettings(patch);
      if (clean.launchAtStartup !== undefined)
        setStartup(clean.launchAtStartup);
      const next = { ...settings, ...clean };
      if (
        clean.pillPlacement !== undefined &&
        clean.pillPlacement !== settings.pillPlacement
      )
        next.pillPinOffset = null;
      if (
        (next.provider === "claude" || next.monitorBoth) &&
        !(settings.provider === "claude" || settings.monitorBoth)
      ) {
        try {
          setupClaude();
        } catch {
          /* Keep the other provider usable; show recovery guidance. */
        }
      }
      const previousShortcut = settings.pillShortcut;
      if (clean.pillShortcut !== undefined) shortcut.set(next.pillShortcut);
      try {
        store.write("settings", next);
      } catch (error) {
        if (clean.pillShortcut !== undefined) shortcut.set(previousShortcut);
        throw error;
      }
      const monitoringChanged =
        next.provider !== settings.provider ||
        next.monitorBoth !== settings.monitorBoth;
      settings = next;
      if (monitoringChanged) syncMonitors();
      publish();
      windows?.broadcast("settings", settings);
      windows?.syncPill();
      tray?.render(snapshot(), settings, updates?.get());
      monitors.codex.reschedule();
      monitors.claude.reschedule();
      return settings;
    }
    windows = new Windows(
      () => settings,
      (p, pinOffset) => {
        settings =
          pinOffset === undefined
            ? { ...settings, pillPosition: p }
            : { ...settings, pillPinOffset: pinOffset };
        persist("settings", settings);
      },
      () => update({ floatingPillEnabled: false }),
    );
    const disabledUpdates =
      !app.isPackaged || process.env.KOODEX_TEST_DATA || mock
        ? "Update installation is available in the installed Windows app."
        : process.env.PORTABLE_EXECUTABLE_FILE ||
            !existsSync(join(dirname(process.execPath), "Uninstall Koodex.exe"))
          ? "Portable and unpacked copies update by replacing the app. Download the latest release below."
          : undefined;
    updates = new Updates(
      app.getVersion(),
      () => {
        // Keep the updater lazy so tray-only startup stays light.
        const { NsisUpdater } =
          require("electron-updater") as typeof import("electron-updater");
        return new NsisUpdater();
      },
      (updateState) => {
        windows?.broadcast("updates", updateState);
        tray?.render(snapshot(), settings, updateState);
      },
      disabledUpdates,
    );
    tray = new KoodexTray(windows, () => void refresh(), update);
    updates.start();
    publish();
    const handle = (name: string, fn: (arg: any) => unknown) =>
      ipcMain.handle(name, (event: IpcMainInvokeEvent, arg: unknown) => {
        if (
          !windows ||
          !windows.owns(event.sender) ||
          event.senderFrame !== event.sender.mainFrame
        )
          throw new Error("Untrusted IPC");
        return fn(arg);
      });
    handle("updates:get", () => updates!.get());
    handle("updates:check", () => updates!.check());
    handle("updates:download", () => updates!.download());
    handle("updates:install", () => updates!.install());
    handle("updates:releases", () =>
      shell.openExternal(
        "https://github.com/CimanesDev/Koodex/releases/latest",
      ),
    );
    handle("usage:get", snapshot);
    handle("shortcut:error", () => shortcut.error);
    ipcMain.handle("pill:drag", (event, phase) => {
      if (
        event.sender === windows?.pill?.webContents &&
        event.senderFrame === event.sender.mainFrame
      )
        windows.dragPill(phase);
    });
    ipcMain.handle("pill:expand", (event, expanded) => {
      if (
        event.sender === windows?.pill?.webContents &&
        event.senderFrame === event.sender.mainFrame
      )
        windows.expandPill(expanded);
    });
    handle("claude:prepare", () => {
      const result = setupClaude();
      void refresh();
      return result;
    });
    handle("usage:refresh", refresh);
    handle("settings:get", () => settings);
    handle("settings:update", update);
    handle("settings:open", () => windows!.openSettings());
    handle("settings:close", () => windows!.closeSettings());
    handle("settings:finish", () => {
      // Persist before dismissing setup so failed writes can be retried.
      const completed = { ...settings, setupCompleted: true };
      store.write("settings", completed);
      settings = completed;
      windows!.broadcast("settings", settings);
      windows!.syncPill();
      windows!.closeSettings();
      tray!.render(snapshot(), settings, updates?.get());
    });
    handle("popover:open", () => windows!.open());
    handle("popover:hide", () => windows!.hidePopover());
    handle("quit", () => app.quit());
    handle("popover:resize", (h) => {
      if (typeof h === "number" && Number.isFinite(h)) windows!.resize(h);
    });
    server.on("updated", () => {
      void monitors.codex.refresh();
    });
    server.on("disconnect", () => {
      if (!quitting) monitors.codex.disconnect();
    });
    function syncClaudeWatcher() {
      unwatchFile(claudeFile(app.getPath("userData")));
      if (!(settings.monitorBoth || settings.provider === "claude")) return;
      watchFile(
        claudeFile(app.getPath("userData")),
        { interval: 500, persistent: false },
        (current, previous) => {
          if (!quitting && current.mtimeMs !== previous.mtimeMs)
            void monitors.claude.refresh();
        },
      );
    }
    syncMonitors();
    windows.syncPill();
    if (!settings.setupCompleted && !process.argv.includes("--startup"))
      windows.openSettings();
  });
}
