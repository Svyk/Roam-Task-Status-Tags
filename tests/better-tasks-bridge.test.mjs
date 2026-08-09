import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createBetterTasksStatusRouter,
  resolveBetterTasksProvider,
} from "../src/better-tasks-bridge.js";

const contract = JSON.parse(
  readFileSync(new URL("./fixtures/better-tasks-capability-v2.json", import.meta.url), "utf8")
);

function directHarness() {
  const calls = [];
  return {
    calls,
    writer: {
      apply: async (args) => {
        calls.push(args);
        return { status: "updated", didWrite: true, owner: "direct" };
      },
    },
  };
}

test("provider resolution prefers v2 and is evaluated from current window state", () => {
  const windowLike = {
    betterTasks: {
      v1: { classifyBlock() {} },
      v2: { classifyBlock() {}, requestStatusTag() {} },
    },
  };
  assert.equal(resolveBetterTasksProvider(windowLike).kind, "v2");
  delete windowLike.betterTasks.v2;
  assert.equal(resolveBetterTasksProvider(windowLike).kind, "v1");
});

test("companion fixture names the exact Better Tasks v2 contract", () => {
  assert.equal(contract.namespace, "betterTasks");
  assert.equal(contract.key, "v2");
  assert.deepEqual(contract.exactMethods, [
    "version",
    "classifyBlock",
    "requestDelete",
    "createSubtask",
    "requestStatusTag",
  ]);
});

test("managed tasks delegate exactly once to Better Tasks v2", async () => {
  const direct = directHarness();
  const providerCalls = [];
  const windowLike = {
    betterTasks: {
      v2: {
        classifyBlock: async () => ({ kind: "task", uid: "task" }),
        requestStatusTag: async (...args) => {
          providerCalls.push(args);
          return { status: "updated", didWrite: true, owner: "better-tasks" };
        },
      },
    },
  };
  const router = createBetterTasksStatusRouter({ windowLike, directWriter: direct.writer });
  const result = await router.apply({
    uid: "task",
    expectedString: "{{[[TODO]]}} task",
    nextString: "unused",
    statusTagTitle: "task-status/Active",
  });

  assert.equal(result.owner, "better-tasks");
  assert.equal(direct.calls.length, 0);
  assert.deepEqual(providerCalls, [["task", {
    expectedString: "{{[[TODO]]}} task",
    statusTagTitle: "task-status/Active",
    source: "task-status-tags",
  }]]);
});

test("managed slash-command handoff is forwarded only to Better Tasks v2", async () => {
  const direct = directHarness();
  const providerCalls = [];
  const windowLike = {
    betterTasks: {
      v2: {
        classifyBlock: async () => ({ kind: "task", uid: "task" }),
        requestStatusTag: async (...args) => {
          providerCalls.push(args);
          return { status: "updated", didWrite: true };
        },
      },
    },
  };
  const router = createBetterTasksStatusRouter({ windowLike, directWriter: direct.writer });
  await router.apply({
    uid: "task",
    expectedString: "{{[[TODO]]}} Task",
    nextString: "{{[[TODO]]}} #[[task-status/Active]] Task",
    statusTagTitle: "task-status/Active",
    expectedLiveEditorString: "{{[[TODO]]}} /task status: Active Task",
    editorString: "{{[[TODO]]}} Task",
  });

  assert.equal(direct.calls.length, 0);
  assert.deepEqual(providerCalls[0][1], {
    expectedString: "{{[[TODO]]}} Task",
    statusTagTitle: "task-status/Active",
    source: "task-status-tags",
    expectedLiveEditorString: "{{[[TODO]]}} /task status: Active Task",
    editorString: "{{[[TODO]]}} Task",
  });
});

test("v1-only Better Tasks fails closed for managed tasks", async () => {
  const direct = directHarness();
  const router = createBetterTasksStatusRouter({
    windowLike: {
      betterTasks: { v1: { classifyBlock: async () => ({ kind: "task" }) } },
    },
    directWriter: direct.writer,
  });

  const result = await router.apply({ uid: "task", expectedString: "a", nextString: "b" });
  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "better-tasks-v2-required");
  assert.equal(direct.calls.length, 0);
});

test("owned children, unknown reads, and managed descendants fail closed", async () => {
  for (const classification of [
    { kind: "task-owned", ownerTaskUid: "task" },
    { kind: "unknown", reason: "ambiguous" },
    { kind: "ordinary", containsManagedTasks: true },
  ]) {
    const direct = directHarness();
    const router = createBetterTasksStatusRouter({
      windowLike: {
        betterTasks: {
          v2: {
            classifyBlock: async () => classification,
            requestStatusTag: async () => assert.fail("must not delegate"),
          },
        },
      },
      directWriter: direct.writer,
    });
    const result = await router.apply({ uid: "x", expectedString: "a", nextString: "b" });
    assert.notEqual(result.status, "updated");
    assert.equal(direct.calls.length, 0);
  }
});

test("ordinary blocks use the direct certified writer", async () => {
  const direct = directHarness();
  const router = createBetterTasksStatusRouter({
    windowLike: {
      betterTasks: {
        v2: {
          classifyBlock: async () => ({ kind: "ordinary", containsManagedTasks: false }),
          requestStatusTag: async () => assert.fail("must not delegate"),
        },
      },
    },
    directWriter: direct.writer,
  });
  const result = await router.apply({ uid: "ordinary", expectedString: "a", nextString: "b" });
  assert.equal(result.owner, "direct");
  assert.equal(direct.calls.length, 1);
});

test("a detectable legacy Better Tasks runtime without capabilities fails closed", async () => {
  const direct = directHarness();
  const router = createBetterTasksStatusRouter({
    windowLike: { RoamExtensionTools: { "better-tasks": { name: "Better Tasks" } } },
    directWriter: direct.writer,
  });
  const result = await router.apply({ uid: "task", expectedString: "a", nextString: "b" });
  assert.equal(result.reason, "better-tasks-capability-unavailable");
  assert.equal(direct.calls.length, 0);
});
