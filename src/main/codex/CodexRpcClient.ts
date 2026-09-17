import { EventEmitter } from "node:events";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
export class CodexRpcClient extends EventEmitter {
  private sequence = 0;
  private buffer = "";
  private closed = false;
  private pending = new Map<
    number,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  constructor(private child: ChildProcessWithoutNullStreams) {
    super();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.receive(chunk));
    child.stderr.resume();
    child.on("error", () => this.dispose());
    child.on("exit", () => this.dispose());
    child.stdin.on("error", () => this.dispose());
  }
  request<T = unknown>(method: string, params: unknown = {}): Promise<T> {
    if (this.closed) return Promise.reject(new Error("Codex disconnected"));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Codex request timed out"));
      }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  notify(method: string) {
    if (!this.closed) this.child.stdin.write(JSON.stringify({ method }) + "\n");
  }
  private receive(chunk: string) {
    this.buffer += chunk;
    if (this.buffer.length > 4 * 1024 * 1024) {
      this.dispose();
      this.child.kill();
      return;
    }
    let end: number;
    while ((end = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      try {
        const m = JSON.parse(line);
        if (m.id != null && m.method) {
          this.child.stdin.write(
            JSON.stringify({
              id: m.id,
              error: { code: -32601, message: "Unsupported method" },
            }) + "\n",
          );
        } else if (m.id != null) {
          const p = this.pending.get(m.id);
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(m.id);
            m.error
              ? p.reject(new Error(m.error.message ?? "Codex request failed"))
              : p.resolve(m.result);
          }
        } else if (typeof m.method === "string")
          this.emit("notification", m.method, m.params);
      } catch {
        /* Ignore non-protocol output; requests still time out. */
      }
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Codex disconnected"));
    }
    this.pending.clear();
    this.emit("disconnect");
  }
}
