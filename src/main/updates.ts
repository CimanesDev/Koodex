import type { UpdateState } from "../shared/types";

export interface UpdateDriver {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  disableWebInstaller: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(silent: boolean, restart: boolean): void;
}

export class Updates {
  private state: UpdateState;
  private driver?: UpdateDriver;
  private busy = false;
  private action: "check" | "download" | "install" = "check";
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  constructor(
    currentVersion: string,
    private createDriver: () => UpdateDriver,
    private publish: (state: UpdateState) => void,
    disabledReason?: string,
  ) {
    this.state = {
      currentVersion,
      status: disabledReason ? "disabled" : "idle",
      message: disabledReason,
    };
  }
  get() {
    return { ...this.state };
  }
  private set(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch };
    if (!this.stopped) this.publish(this.get());
  }
  private fail() {
    const messages = {
      check:
        "Could not check for updates. Check your connection and try again.",
      download:
        "The update could not be downloaded or verified. Please try again.",
      install:
        "The installer could not start. Try again or download the installer from Releases.",
    };
    this.set({
      status: "error",
      message: messages[this.action],
      failedAction: this.action,
    });
  }
  private getDriver() {
    if (this.driver) return this.driver;
    const driver = this.createDriver();
    driver.autoDownload = false;
    driver.autoInstallOnAppQuit = false;
    driver.allowPrerelease = false;
    driver.allowDowngrade = false;
    driver.disableWebInstaller = true;
    driver.on("error", () => this.fail());
    driver.on("update-available", (info: { version: string }) => {
      this.set({
        status: "available",
        version: info.version,
        percent: undefined,
        checkedAt: Date.now(),
        message: undefined,
      });
    });
    driver.on("update-not-available", () =>
      this.set({
        status: "current",
        version: undefined,
        checkedAt: Date.now(),
        message: undefined,
      }),
    );
    driver.on("download-progress", (progress: { percent: number }) => {
      if (
        this.state.status === "downloading" &&
        Number.isFinite(progress.percent)
      ) {
        const percent = Math.round(
          Math.max(0, Math.min(100, progress.percent)),
        );
        if (percent !== this.state.percent) this.set({ percent });
      }
    });
    driver.on("update-downloaded", (info: { version: string }) =>
      this.set({
        status: "ready",
        version: info.version,
        percent: 100,
        message: undefined,
      }),
    );
    this.driver = driver;
    return driver;
  }
  async check() {
    if (
      this.stopped ||
      this.busy ||
      ["disabled", "ready", "installing"].includes(this.state.status)
    )
      return this.get();
    this.busy = true;
    this.action = "check";
    this.set({
      status: "checking",
      message: undefined,
      failedAction: undefined,
      percent: undefined,
    });
    try {
      const result = await this.getDriver().checkForUpdates();
      if (!result && this.state.status === "checking") this.fail();
    } catch {
      this.fail();
    } finally {
      this.busy = false;
    }
    return this.get();
  }
  async download() {
    if (
      this.stopped ||
      this.busy ||
      !(
        this.state.status === "available" ||
        (this.state.status === "error" &&
          this.state.failedAction === "download")
      )
    )
      return this.get();
    this.busy = true;
    this.action = "download";
    this.set({
      status: "downloading",
      percent: 0,
      message: undefined,
      failedAction: undefined,
    });
    try {
      await this.getDriver().downloadUpdate();
    } catch {
      this.fail();
    } finally {
      this.busy = false;
    }
    return this.get();
  }
  install() {
    if (this.stopped || this.busy || this.state.status !== "ready")
      return this.get();
    this.action = "install";
    this.set({ status: "installing", message: undefined });
    try {
      this.getDriver().quitAndInstall(true, true);
    } catch {
      this.fail();
    }
    return this.get();
  }
  start() {
    if (this.stopped || this.timer || this.state.status === "disabled") return;
    const tick = async () => {
      if (["idle", "current", "error"].includes(this.state.status))
        await this.check();
      if (!this.stopped) {
        this.timer = setTimeout(tick, 6 * 60 * 60 * 1000);
        this.timer.unref();
      }
    };
    this.timer = setTimeout(tick, 30000);
    this.timer.unref();
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}
