import type { Snapshot } from "../shared/types";

/** One independent polling loop per provider; obsolete reads never publish. */
export class UsageMonitor {
  private active = false;
  private generation = 0;
  private running?: Promise<void>;
  private pending = false;
  private failures = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    public snapshot: Snapshot,
    private read: () => Promise<Snapshot> | Snapshot,
    private changed: (snapshot: Snapshot) => void,
    private interval: () => number,
    private failed: (error: unknown) => Promise<string>,
  ) {}
  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    this.generation++;
    this.pending = false;
    this.failures = 0;
    clearTimeout(this.timer);
    if (active) void this.refresh();
  }
  reschedule() {
    clearTimeout(this.timer);
    if (!this.active || this.running) return;
    const delay = this.failures
      ? Math.min(300000, 5000 * 2 ** Math.min(this.failures - 1, 6))
      : this.interval();
    this.timer = setTimeout(() => void this.refresh(), delay);
  }
  disconnect() {
    if (!this.active) return;
    this.snapshot = {
      ...this.snapshot,
      syncState: this.snapshot.usage ? "stale" : "offline",
    };
    this.changed(this.snapshot);
    if (!this.running) {
      this.failures++;
      this.reschedule();
    }
  }
  refresh(): Promise<void> {
    if (!this.active) return Promise.resolve();
    if (this.running) {
      this.pending = true;
      return this.running;
    }
    clearTimeout(this.timer);
    const generation = this.generation;
    this.snapshot = {
      ...this.snapshot,
      syncState: this.snapshot.usage ? "refreshing" : "connecting",
    };
    this.changed(this.snapshot);
    // Defer read until running is assigned, including synchronous local readers.
    this.running = Promise.resolve().then(async () => {
      try {
        if (generation !== this.generation || !this.active) return;
        const next = await this.read();
        if (generation !== this.generation) return;
        this.snapshot = next;
        this.failures = 0;
      } catch (error) {
        if (generation !== this.generation) return;
        let message: string;
        try {
          message = await this.failed(error);
        } catch {
          message =
            error instanceof Error
              ? error.message
              : "Unable to refresh usage. Retrying automatically.";
        }
        if (generation !== this.generation) return;
        this.failures++;
        this.snapshot = {
          ...this.snapshot,
          syncState: this.snapshot.usage ? "stale" : "error",
          error: message,
        };
      } finally {
        this.running = undefined;
        if (generation === this.generation && this.active)
          this.changed(this.snapshot);
        if (this.pending && this.active) {
          this.pending = false;
          void this.refresh();
        } else this.reschedule();
      }
    });
    return this.running;
  }
}
