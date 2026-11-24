import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCK_CHILDREN_PULL_PATTERN,
  BLOCK_STRING_PULL_PATTERN,
  createBlockChildStringsReader,
  createCertifiedBlockStringWriter,
  createFreshBlockStringReader,
  hasManagedTaskPrefix,
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

test("requireExistingTask rejects plain blocks and mid-line TODOs without writing", async () => {
  assert.equal(hasManagedTaskPrefix("{{[[TODO]]}} Do it"), true);
  assert.equal(hasManagedTaskPrefix("  {{[[DONE]]}} Done"), true);
  assert.equal(hasManagedTaskPrefix("{{TODO}} Plain"), true);
  assert.equal(hasManagedTaskPrefix("Plain block"), false);
  assert.equal(hasManagedTaskPrefix("Mention [[TODO]] mid-line"), false);
  assert.equal(hasManagedTaskPrefix("Mention {{[[TODO]]}} mid-line"), false);

  for (const text of [
    "Plain block",
    "Mention [[TODO]] mid-line",
    "Mention {{[[TODO]]}} mid-line",
  ]) {
    let writes = 0;
    const writer = createCertifiedBlockStringWriter({
      readFresh: async () => text,
      updateBlock: async () => { writes += 1; },
    });
    const setRes = await writer.apply({
      uid: "abc",
      expectedString: text,
      nextString: `{{[[TODO]]}} #[[task-status/Active]] ${text}`,
      requireExistingTask: true,
    });
    assert.equal(setRes.status, "rejected");
    assert.equal(setRes.didWrite, false);
    assert.equal(setRes.reason, "not-a-task");

    const clearRes = await writer.apply({
      uid: "abc",
      expectedString: text,
      nextString: text,
      requireExistingTask: true,
    });
    assert.equal(clearRes.status, "rejected");
    assert.equal(clearRes.didWrite, false);
    assert.equal(clearRes.reason, "not-a-task");
    assert.equal(writes, 0);
  }
});

test("userUid is forwarded to updateBlock only when present", async () => {
  const updateCalls = [];
  let value = "{{[[TODO]]}} Ship it";
  const writer = createCertifiedBlockStringWriter({
    readFresh: async () => value,
    updateBlock: async (...args) => {
      updateCalls.push(args);
      value = args[1];
    },
  });

  const withUser = await writer.apply({
    uid: "abc",
    expectedString: value,
    nextString: "{{[[TODO]]}} #[[task-status/Active]] Ship it",
    userUid: "ai-user-1",
    requireExistingTask: true,
  });
  assert.equal(withUser.status, "updated");
  assert.deepEqual(updateCalls[0], [
    "abc",
    "{{[[TODO]]}} #[[task-status/Active]] Ship it",
    { userUid: "ai-user-1" },
  ]);

  const withoutUser = await writer.apply({
    uid: "abc",
    expectedString: value,
    nextString: "{{[[TODO]]}} #[[task-status/Waiting]] Ship it",
  });
  assert.equal(withoutUser.status, "updated");
  assert.deepEqual(updateCalls[1], [
    "abc",
    "{{[[TODO]]}} #[[task-status/Waiting]] Ship it",
  ]);
});

test("createBlockChildStringsReader pulls child strings through async.pull", async () => {
  const calls = [];
  const readChildren = createBlockChildStringsReader({
    data: {
      async: {
        pull: async (...args) => {
          calls.push(args);
          return {
            ":block/uid": "task-1",
            ":block/children": [
              { ":block/string": "BT_attrDue:: [[Tomorrow]]" },
              { ":block/string": "Note" },
            ],
          };
        },
      },
    },
  });
  assert.deepEqual(await readChildren("task-1"), ["BT_attrDue:: [[Tomorrow]]", "Note"]);
  assert.deepEqual(calls, [[BLOCK_CHILDREN_PULL_PATTERN, [":block/uid", "task-1"]]]);
});
