import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCK_STRING_PULL_PATTERN,
  createCertifiedBlockStringWriter,
  createFreshBlockStringReader,
} from "../src/status-write.js";

test("fresh reader uses async.pull and accepts keyword-shaped blocks", async () => {
  const calls = [];
  const read = createFreshBlockStringReader({
    data: {
      async: {
        pull: async (...args) => {
          calls.push(args);
          return { ":block/uid": "abc", ":block/string": "before" };
        },
      },
    },
  });

  assert.equal(await read("abc"), "before");
  assert.deepEqual(calls, [[BLOCK_STRING_PULL_PATTERN, [":block/uid", "abc"]]]);
});

test("certified writer rejects a stale expected string without writing", async () => {
  let writes = 0;
  const writer = createCertifiedBlockStringWriter({
    readFresh: async () => "newer",
    updateBlock: async () => { writes += 1; },
  });

  assert.deepEqual(await writer.apply({ uid: "abc", expectedString: "old", nextString: "next" }), {
    status: "conflict",
    didWrite: false,
    reason: "stale-expected-string",
    string: "newer",
  });
  assert.equal(writes, 0);
});

test("certified writer reports a successful exact write", async () => {
  let value = "before";
  let writes = 0;
  const writer = createCertifiedBlockStringWriter({
    readFresh: async () => value,
    updateBlock: async (_uid, next) => { writes += 1; value = next; },
  });

  const result = await writer.apply({ uid: "abc", expectedString: "before", nextString: "after" });
  assert.equal(result.status, "updated");
  assert.equal(result.didWrite, true);
  assert.equal(result.reason, "certified");
  assert.equal(writes, 1);
});

test("an update that throws after committing is certified as updated", async () => {
  let value = "before";
  const writer = createCertifiedBlockStringWriter({
    readFresh: async () => value,
    updateBlock: async (_uid, next) => {
      value = next;
      throw new Error("transport lost acknowledgement");
    },
  });

  const result = await writer.apply({ uid: "abc", expectedString: "before", nextString: "after" });
  assert.equal(result.status, "updated");
  assert.equal(result.reason, "write-threw-after-commit");
});

test("a third state after the write is a conflict and is never retried", async () => {
  let value = "before";
  let writes = 0;
  const writer = createCertifiedBlockStringWriter({
    readFresh: async () => value,
    updateBlock: async () => { writes += 1; value = "concurrent"; },
  });

  const result = await writer.apply({ uid: "abc", expectedString: "before", nextString: "after" });
  assert.equal(result.status, "conflict");
  assert.equal(result.reason, "third-state-after-write");
  assert.equal(writes, 1);
});

test("editor handoff writes only while the captured editor value is still exact", async () => {
  let value = "{{[[TODO]]}} Task";
  let live = "{{[[TODO]]}} /task status: Active Task";
  let writes = 0;
  const writer = createCertifiedBlockStringWriter({
    readFresh: async () => value,
    updateBlock: async (_uid, next) => { writes += 1; value = next; },
    getLiveEditorString: () => live,
  });
  const args = {
    uid: "abc",
    expectedString: value,
    nextString: "{{[[TODO]]}} #[[task-status/Active]] Task",
    expectedLiveEditorString: live,
    editorString: "{{[[TODO]]}} Task",
  };

  assert.equal((await writer.apply(args)).status, "updated");
  assert.equal(writes, 1);

  value = "{{[[TODO]]}} Task";
  live = "{{[[TODO]]}} user kept typing";
  const refused = await writer.apply({
    ...args,
    expectedString: value,
    expectedLiveEditorString: "{{[[TODO]]}} /task status: Active Task",
  });
  assert.equal(refused.status, "conflict");
  assert.equal(refused.reason, "active-editor-diverged");
  assert.equal(writes, 1);
});
