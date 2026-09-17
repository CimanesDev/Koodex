import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { CodexRpcClient } from "./CodexRpcClient";
import type { RateLimitsResponse } from "./types";
export function locateCodex(): string {
  const roots = (process.env.PATH ?? "")
    .split(";")
    .filter(Boolean)
    .map((p) => p.replace(/^"|"$/g, ""));
  if (process.env.APPDATA) roots.push(join(process.env.APPDATA, "npm"));
  for (const root of roots) {
    const exe = join(root, "codex.exe");
    if (existsSync(exe)) return exe;
    for (const base of [
      join(
        root,
        "node_modules",
        "@openai",
        "codex",
        "node_modules",
        "@openai",
        `codex-win32-${process.arch}`,
        "vendor",
      ),
      join(root, "node_modules", "@openai", "codex", "vendor"),
    ]) {
      if (!existsSync(base)) continue;
      for (const target of readdirSync(base)) {
        for (const dir of ["bin", "codex"]) {
          const path = join(base, target, dir, "codex.exe");
          if (existsSync(path)) return path;
        }
      }
    }
  }
  throw new Error("Codex not found");
}
export class CodexServer extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams;
  private rpc?: CodexRpcClient;
  private starting?: Promise<void>;
  private stopping = false;
  private stopPromise?: Promise<void>;
  async connect() {
    if (this.stopPromise) await this.stopPromise;
    if (this.rpc) return;
    if (this.starting) return this.starting;
    this.starting = this.start();
    try {
      await this.starting;
    } finally {
      this.starting = undefined;
    }
  }
  private async start() {
    this.stopping = false;
    const child = spawn(locateCodex(), ["app-server", "--listen", "stdio://"], {
      windowsHide: true,
      stdio: "pipe",
    });
    this.child = child;
    const rpc = new CodexRpcClient(child);
    rpc.on("disconnect", () => {
      if (this.rpc === rpc) this.rpc = undefined;
      if (!this.stopping) this.emit("disconnect");
    });
    rpc.on("notification", (method: string) => {
      if (
        method === "account/rateLimits/updated" ||
        method === "account/updated"
      )
        this.emit("updated");
    });
    try {
      await rpc.request("initialize", {
        clientInfo: { name: "koodex", title: "Koodex", version: "1.5.0" },
        capabilities: null,
      });
      if (this.stopping) throw new Error("Codex connection stopped");
      rpc.notify("initialized");
      this.rpc = rpc;
    } catch (e) {
      await this.stop();
      throw e;
    }
  }
  async read() {
    await this.connect();
    const account = await this.rpc!.request<{
      account: unknown | null;
      requiresOpenaiAuth: boolean;
    }>("account/read", { refreshToken: false });
    if (!account.account && account.requiresOpenaiAuth)
      throw new Error("Sign in to Codex first");
    return this.rpc!.request<RateLimitsResponse>("account/rateLimits/read");
  }
  async stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopping = true;
    const child = this.child;
    this.child = undefined;
    this.rpc?.dispose();
    this.rpc = undefined;
    if (!child || child.exitCode !== null || !child.pid) return;
    this.stopPromise = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
      }, 1500);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.stdin.end();
    });
    try {
      await this.stopPromise;
    } finally {
      this.stopPromise = undefined;
    }
  }
  get pid() {
    return this.child?.pid;
  }
}
