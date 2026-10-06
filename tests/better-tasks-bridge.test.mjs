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

// ── Activity log on the Better Tasks route ────────────────────────────────

function activityHarness(record = async () => ({ recorded: true, reason: "recorded" })) {
  const calls = [];
  return {
    calls,
    recorder: {
      record: async (args) => {
        calls.push(args);
        return record(args);
      },
    },
  };
}

function v2Window(requestStatusTag, classifyBlock = async () => ({ kind: "task", uid: "task" })) {
  return { betterTasks: { v2: { classifyBlock, requestStatusTag } } };
}

test("a certified Better Tasks write records exactly one activity line", async () => {
  const direct = directHarness();
  const activity = activityHarness();
  const windowLike = v2Window(async () => ({
    status: "updated",
    didWrite: true,
    reason: "certified",
    string: "{{[[TODO]]}} #[[task-status/Waiting]] task",
  }));
  const router = createBetterTasksStatusRouter({
    windowLike,
    directWriter: direct.writer,
    activityRecorder: activity.recorder,
  });
  const result = await router.apply({
    uid: "task",
    expectedString: "{{[[TODO]]}} task",
    nextString: "{{[[TODO]]}} #[[task-status/Waiting]] task",
    statusTagTitle: "task-status/Waiting",
  });

  assert.equal(result.status, "updated");
  assert.equal(result.didWrite, true);
  assert.deepEqual(result.activity, { recorded: true, reason: "recorded" });
  assert.deepEqual(activity.calls, [{
    uid: "task",
    previousString: "{{[[TODO]]}} task",
    nextString: "{{[[TODO]]}} #[[task-status/Waiting]] task",
    statusTagTitle: "task-status/Waiting",
  }]);
  assert.equal(direct.calls.length, 0);
});

test("non-updated Better Tasks outcomes never reach the activity recorder", async () => {
  for (const outcome of [
    { status: "unchanged", didWrite: false, reason: "already-current" },
    { status: "conflict", didWrite: false, reason: "stale-expected-string" },
    { status: "rejected", didWrite: false, reason: "target-not-managed-task" },
    { status: "not-updated", didWrite: false, reason: "write-not-observed" },
    { status: "unknown", didWrite: false, reason: "post-write-read-failed" },
  ]) {
    const activity = activityHarness();
    const router = createBetterTasksStatusRouter({
      windowLike: v2Window(async () => outcome),
      directWriter: directHarness().writer,
      activityRecorder: activity.recorder,
    });
    const result = await router.apply({
      uid: "task",
      expectedString: "{{[[TODO]]}} task",
      nextString: "unused",
      statusTagTitle: "task-status/Waiting",
    });
    assert.equal(activity.calls.length, 0, outcome.status);
    assert.equal(result.activity, undefined, outcome.status);
  }
});

test("Better Tasks reporting its own activity entry suppresses the companion line", async () => {
  const activity = activityHarness();
  const router = createBetterTasksStatusRouter({
    windowLike: v2Window(async () => ({
      status: "updated",
      didWrite: true,
      reason: "certified",
      activity: { recorded: true, reason: "better-tasks" },
    })),
    directWriter: directHarness().writer,
    activityRecorder: activity.recorder,
  });
  const result = await router.apply({
    uid: "task",
    expectedString: "{{[[TODO]]}} task",
    nextString: "unused",
    statusTagTitle: "task-status/Waiting",
  });
  assert.equal(activity.calls.length, 0);
  assert.deepEqual(result.activity, { recorded: true, reason: "better-tasks" });
});

test("a failing activity recorder never changes the certified write result", async () => {
  const router = createBetterTasksStatusRouter({
    windowLike: v2Window(async () => ({ status: "updated", didWrite: true, reason: "certified" })),
    directWriter: directHarness().writer,
    activityRecorder: { record: async () => { throw new Error("graph down"); } },
  });
  const result = await router.apply({
    uid: "task",
    expectedString: "{{[[TODO]]}} task",
    nextString: "unused",
    statusTagTitle: "task-status/Waiting",
  });
  assert.equal(result.status, "updated");
  assert.equal(result.didWrite, true);
  assert.equal(result.reason, "certified");
  assert.equal(result.activity.recorded, false);
  assert.equal(result.activity.reason, "activity-recorder-threw");
});

test("ordinary blocks and routers without a recorder record nothing", async () => {
  const activity = activityHarness();
  const direct = directHarness();
  const router = createBetterTasksStatusRouter({
    windowLike: v2Window(async () => ({ status: "updated", didWrite: true }), async () => ({ kind: "ordinary" })),
    directWriter: direct.writer,
    activityRecorder: activity.recorder,
  });
  const result = await router.apply({
    uid: "plain",
    expectedString: "plain",
    nextString: "#[[task-status/Waiting]] plain",
    statusTagTitle: "task-status/Waiting",
  });
  assert.equal(result.owner, "direct");
  assert.equal(activity.calls.length, 0);

  const bare = createBetterTasksStatusRouter({
    windowLike: v2Window(async () => ({ status: "updated", didWrite: true, reason: "certified" })),
    directWriter: direct.writer,
  });
  const bareResult = await bare.apply({
    uid: "task",
    expectedString: "{{[[TODO]]}} task",
    nextString: "unused",
    statusTagTitle: "task-status/Waiting",
  });
  assert.equal(bareResult.activity, undefined);
  assert.throws(
    () => createBetterTasksStatusRouter({ windowLike: {}, directWriter: direct.writer, activityRecorder: {} }),
    TypeError
  );
});
