import type { Settings } from "../shared/types";
type Shortcut = Settings["pillShortcut"];
interface Registry {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}
export class PillShortcut {
  private current: Shortcut = "off";
  error = "";
  constructor(
    private registry: Registry,
    private toggle: () => void,
  ) {}
  set(next: Shortcut) {
    if (next === this.current) {
      this.error = "";
      return;
    }
    if (next !== "off" && !this.registry.register(next, this.toggle)) {
      this.error =
        "That shortcut is already in use or unavailable. Choose another combination.";
      throw new Error(this.error);
    }
    if (this.current !== "off") this.registry.unregister(this.current);
    this.current = next;
    this.error = "";
  }
}
