import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { CodexRpcClient } from "../src/main/codex/CodexRpcClient";
function fixture() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  return { child, rpc: new CodexRpcClient(child as never) };
}
test("RPC frames fragmented and coalesced replies and notifications", async () => {
  const { child, rpc } = fixture();
  const first = rpc.request("one");
  const second = rpc.request("two");
  let event = "";
  rpc.on("notification", (m) => (event = m));
  child.stdout.write('{"id":1,"res');
  child.stdout.write(
    'ult":42}\n{"method":"updated","params":{}}\n{"id":2,"result":43}\n',
  );
  assert.equal(await first, 42);
  assert.equal(await second, 43);
  assert.equal(event, "updated");
  rpc.dispose();
});
test("RPC errors reject and exit rejects all pending requests", async () => {
  const { child, rpc } = fixture();
  const error = rpc.request("bad");
  child.stdout.write('{"id":1,"error":{"message":"Denied"}}\n');
  await assert.rejects(error, /Denied/);
  const pending = rpc.request("pending");
  child.emit("exit", 1);
  await assert.rejects(pending, /disconnected/);
  await assert.rejects(rpc.request("after"), /disconnected/);
});
