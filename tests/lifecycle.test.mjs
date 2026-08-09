import assert from "node:assert/strict";
import test from "node:test";

import { createLifecycle } from "../src/lifecycle.js";

test("dispose is idempotent and cleans resources in reverse order", async () => {
  const calls = [];
  const lifecycle = createLifecycle();
  lifecycle.add(() => calls.push("first"));
  lifecycle.add(async () => calls.push("second"));

  await lifecycle.dispose();
  await lifecycle.dispose();

  assert.equal(lifecycle.disposed, true);
  assert.deepEqual(calls, ["second", "first"]);
});

test("registered commands and pull watches are removed once", async () => {
  const calls = [];
  const commandApi = {
    addCommand: ({ label }) => calls.push(["command:add", label]),
    removeCommand: ({ label }) => calls.push(["command:remove", label]),
  };
  const dataApi = {
    addPullWatch: (...args) => calls.push(["watch:add", ...args]),
    removePullWatch: (...args) => calls.push(["watch:remove", ...args]),
  };
  const pattern = "[:block/uid]";
  const entity = '[:block/uid "abc"]';
  const callback = () => {};
  const lifecycle = createLifecycle();

  await lifecycle.command(commandApi, { label: "Test", callback });
  lifecycle.pullWatch(dataApi, pattern, entity, callback);
  await lifecycle.dispose();
  await lifecycle.dispose();

  assert.deepEqual(calls, [
    ["command:add", "Test"],
    ["watch:add", pattern, entity, callback],
    ["watch:remove", pattern, entity, callback],
    ["command:remove", "Test"],
  ]);
});

test("events, observers, and DOM nodes have explicit cleanup", async () => {
  const lifecycle = createLifecycle();
  const target = new EventTarget();
  let events = 0;
  const listener = () => { events += 1; };
  const observerCalls = [];
  const observer = {
    observe: (...args) => observerCalls.push(["observe", ...args]),
    disconnect: () => observerCalls.push(["disconnect"]),
  };
  const parent = { append: (node) => { node.connected = true; } };
  const node = { connected: false, remove: () => { node.connected = false; } };

  lifecycle.event(target, "ping", listener);
  lifecycle.observer(observer, target, { childList: true });
  lifecycle.node(node, parent);
  target.dispatchEvent(new Event("ping"));
  await lifecycle.dispose();
  target.dispatchEvent(new Event("ping"));

  assert.equal(events, 1);
  assert.equal(node.connected, false);
  assert.deepEqual(observerCalls, [
    ["observe", target, { childList: true }],
    ["disconnect"],
  ]);
});

test("cleanup continues after a disposer fails", async () => {
  const calls = [];
  const lifecycle = createLifecycle();
  lifecycle.add(() => calls.push("still-ran"));
  lifecycle.add(() => { throw new Error("expected"); });

  await assert.rejects(lifecycle.dispose(), AggregateError);
  assert.deepEqual(calls, ["still-ran"]);
});


