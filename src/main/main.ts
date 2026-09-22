import {
  app,
  ipcMain,
  Notification,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { join, dirname } from "node:path";
import { watchFile, unwatchFile, existsSync } from "node:fs";
import { claudeFile, connectClaude, readClaude } from "./claude";
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
let timer: NodeJS.Timeout | undefined;
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
    clearTimeout(timer);
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
    let state: Snapshot =
      settings.provider === "claude"
        ? readClaude(app.getPath("userData"))
        : { provider: "codex", usage: store.cache(), syncState: "stale" };
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
    if (settings.provider === "claude") {
      try {
        setupClaude();
      } catch {
        /* Report the actionable setup error through usage state. */
      }
    }
    let busy = false;
    let generation = 0;
    let pendingRefresh = false;
    let failures = 0;
    let cacheFingerprint = "";
    let cacheSavedAt = 0;
    if (!state.usage) state.syncState = "connecting";
    function alertFile() {
      return settings.provider === "claude" ? "alerts-claude" : "alerts";
    }
    function loadLedger() {
      const data = store.read<AlertLedger>(alertFile(), {});
      return data && typeof data === "object" && !Array.isArray(data)
        ? data
        : {};
    }
    let ledger = loadLedger();
    const persist = (name: string, value: unknown) => {
      try {
        store.write(name, value);
      } catch {
        console.warn("Koodex could not persist " + name);
      }
    };
    persist("settings", settings);
    const publish = () => {
      if (quitting) return;
      windows?.broadcast("usage", state);
      tray?.render(state, settings, updates?.get());
    };
    const schedule = () => {
      clearTimeout(timer);
      if (!quitting)
        timer = setTimeout(
          () => void refresh(),
          failures
            ? Math.min(300000, 5000 * 2 ** Math.min(failures - 1, 6))
            : (settings.provider === "claude"
                ? 10
                : settings.refreshIntervalSeconds) * 1000,
        );
    };
    async function refresh() {
      if (busy || quitting) return;
      const currentGeneration = generation;
      const provider = settings.provider;
      busy = true;
      clearTimeout(timer);
      state = {
        ...state,
        syncState: state.usage ? "refreshing" : "connecting",
      };
      publish();
      try {
        if (provider === "claude")
          state = claudeSetupError
            ? {
                provider,
                usage: null,
                syncState: "error",
                error: claudeSetupError,
              }
            : readClaude(app.getPath("userData"));
        else if (mock) state = { ...mockSnapshot(mock), provider };
        else {
          const usage = adaptUsage(await server.read());
          if (currentGeneration !== generation) return;
          state = { provider, usage, syncState: "synced" };
          const fingerprint = JSON.stringify({ ...usage, fetchedAt: 0 });
          if (
            fingerprint !== cacheFingerprint ||
            Date.now() - cacheSavedAt >= 60000
          ) {
            persist("usage", { usage, fetchedAt: usage.fetchedAt });
            cacheFingerprint = fingerprint;
            cacheSavedAt = Date.now();
          }
        }
        if (
          !mock &&
          state.syncState === "synced" &&
          state.usage &&
          settings.notificationsEnabled &&
          Notification.isSupported()
        ) {
          const previousLedger = JSON.stringify(ledger);
          for (const a of collectAlerts(state.usage, ledger))
            new Notification({
              title: "Koodex",
              body: `Your ${a.label} ${provider === "claude" ? "Claude Code" : "Codex"} limit has ${Math.round(a.remaining)}% remaining. Resets in ${resetIn(a.resetsAt)}.`,
            }).show();
          if (JSON.stringify(ledger) !== previousLedger)
            persist(alertFile(), ledger);
        }
        failures = 0;
      } catch (error) {
        if (currentGeneration !== generation) return;
        failures++;
        state = {
          ...state,
          syncState: state.usage ? "stale" : "error",
          error: explainError(error),
        };
        await server.stop();
      } finally {
        busy = false;
        publish();
        if (pendingRefresh) {
          pendingRefresh = false;
          void refresh();
        } else schedule();
      }
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
      if (next.provider === "claude" && next.provider !== settings.provider)
        setupClaude();
      store.write("settings", next);
      const providerChanged = next.provider !== settings.provider;
      settings = next;
      if (providerChanged) {
        syncClaudeWatcher();
        ledger = loadLedger();
        generation++;
        failures = 0;
        state =
          settings.provider === "claude"
            ? readClaude(app.getPath("userData"))
            : {
                provider: "codex",
                usage: store.cache(),
                syncState: "connecting",
              };
        publish();
        if (settings.provider === "claude") void server.stop();
        if (busy) pendingRefresh = true;
        else void refresh();
      }
      windows?.broadcast("settings", settings);
      windows?.syncPill();
      tray?.render(state, settings, updates?.get());
      if (!busy) schedule();
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
        tray?.render(state, settings, updateState);
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
    handle("usage:get", () => state);
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
      tray!.render(state, settings, updates?.get());
    });
    handle("popover:open", () => windows!.open());
    handle("popover:hide", () => windows!.hidePopover());
    handle("quit", () => app.quit());
    handle("popover:resize", (h) => {
      if (typeof h === "number" && Number.isFinite(h)) windows!.resize(h);
    });
    server.on("updated", () => {
      if (settings.provider === "codex" && !busy) void refresh();
    });
    server.on("disconnect", () => {
      if (quitting || settings.provider !== "codex") return;
      state = { ...state, syncState: state.usage ? "stale" : "offline" };
      publish();
      if (!busy) {
        failures++;
        schedule();
      }
    });
    function syncClaudeWatcher() {
      unwatchFile(claudeFile(app.getPath("userData")));
      if (settings.provider !== "claude") return;
      watchFile(
        claudeFile(app.getPath("userData")),
        { interval: 500, persistent: false },
        (current, previous) => {
          if (
            quitting ||
            settings.provider !== "claude" ||
            current.mtimeMs === previous.mtimeMs
          )
            return;
          if (busy) pendingRefresh = true;
          else void refresh();
        },
      );
    }
    syncClaudeWatcher();
    void refresh();
    windows.syncPill();
    if (!settings.setupCompleted && !process.argv.includes("--startup"))
      windows.openSettings();
  });
}
