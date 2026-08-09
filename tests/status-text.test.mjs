import assert from "node:assert/strict";
import test from "node:test";

import {
  createTaskStatusTextHelpers,
  resolveTaskStatusTargetUids,
} from "../src/extension.js";

const helpers = createTaskStatusTextHelpers();

test("replaces a managed status while preserving task prose", () => {
  const input = "{{[[TODO]]}} #[[task-status/Active]] Call  Bob\n  next line";
  const expected = "{{[[TODO]]}} #[[task-status/Waiting]] Call  Bob\n  next line";

  assert.equal(helpers.applyStatusToText(input, "WAITING"), expected);
});

test("removes only the managed status slot and preserves later tags", () => {
  const input =
    "{{[[TODO]]}} #[[task-status/Active]] Discuss #[[task-status/Alert]] in prose";
  const expected = "{{[[TODO]]}} Discuss #[[task-status/Alert]] in prose";

  assert.equal(helpers.removeStatusFromText(input), expected);
});

test("does not treat old macro statuses as managed status tags", () => {
  const input = "{{[[TODO]]}} {{[[ALERT]]}} Mention {{[[ALERT]]}} later";
  const expected =
    "{{[[TODO]]}} #[[task-status/Waiting]] {{[[ALERT]]}} Mention {{[[ALERT]]}} later";

  assert.equal(helpers.applyStatusToText(input, "WAITING"), expected);
});

test("leaves old macros in prose untouched", () => {
  const input = "{{[[TODO]]}} Mention {{[[ALERT]]}} later";

  assert.equal(helpers.removeStatusFromText(input), input);
});

test("removes managed status from DONE blocks locally", () => {
  const input = "{{[[DONE]]}} #[[task-status/Active]] Done  text";
  const expected = "{{[[DONE]]}} Done  text";

  assert.equal(helpers.removeStatusFromText(input), expected);
});

test("removes slash command fragments before applying status", () => {
  const input = "Call /task status: Active landlord";
  const start = input.indexOf("task status");
  const end = start + "task status: Active".length;

  const withoutSlashCommand = helpers.removeSlashCommandFragment(input, [start, end]);

  assert.equal(withoutSlashCommand, "Call  landlord");
  assert.equal(
    helpers.applyStatusToText(withoutSlashCommand, "ACTIVE"),
    "{{[[TODO]]}} #[[task-status/Active]] Call  landlord"
  );
});

test("ignores non-canonical status tags in the managed slot", () => {
  const canonicalHelpers = createTaskStatusTextHelpers({
    cycleOrder: ["ACTIVE", "WAITING"],
    statuses: {
      ACTIVE: {
        name: "Active",
        label: "Active",
        tagTitle: "task-status/Active",
        tagTitles: ["task-status/Active"],
      },
      WAITING: {
        name: "Waiting",
        label: "Waiting",
        tagTitle: "task-status/Waiting",
        tagTitles: ["task-status/Waiting"],
      },
    },
  });

  const input = "{{[[TODO]]}} #[[Active]] Alias example";

  assert.equal(canonicalHelpers.hasManagedStatusTag(input, "ACTIVE"), false);
  assert.equal(
    canonicalHelpers.applyStatusToText(input, "ACTIVE"),
    "{{[[TODO]]}} #[[task-status/Active]] #[[Active]] Alias example"
  );
});

test("applies custom status tags", () => {
  const customHelpers = createTaskStatusTextHelpers({
    cycleOrder: ["ACTIVE", "CUSTOM_DEEP_WORK"],
    statuses: {
      ACTIVE: {
        name: "Active",
        label: "Active",
        tagTitle: "task-status/Active",
        tagTitles: ["task-status/Active"],
      },
      CUSTOM_DEEP_WORK: {
        name: "Deep Work",
        label: "Deep Work",
        tagTitle: "task-status/Deep Work",
        tagTitles: ["task-status/Deep Work"],
      },
    },
  });

  assert.equal(
    customHelpers.applyStatusToText("Draft essay", "CUSTOM_DEEP_WORK"),
    "{{[[TODO]]}} #[[task-status/Deep Work]] Draft essay"
  );
});

test("leaves removed statuses as ordinary prose when they are no longer configured", () => {
  const activeOnlyHelpers = createTaskStatusTextHelpers({
    cycleOrder: ["ACTIVE"],
    statuses: {
      ACTIVE: {
        name: "Active",
        label: "Active",
        tagTitle: "task-status/Active",
        tagTitles: ["task-status/Active"],
      },
    },
  });

  const input = "{{[[TODO]]}} #[[task-status/Waiting]] Old waiting task";

  assert.equal(activeOnlyHelpers.getCurrentStatus(input), null);
  assert.equal(activeOnlyHelpers.getNextStatus("WAITING"), "ACTIVE");
  assert.equal(
    activeOnlyHelpers.applyStatusToText(input, "ACTIVE"),
    "{{[[TODO]]}} #[[task-status/Active]] #[[task-status/Waiting]] Old waiting task"
  );
});

test("reordered cycle order changes next status", () => {
  const reorderedHelpers = createTaskStatusTextHelpers({
    cycleOrder: ["CUSTOM_REVIEW", "ACTIVE"],
    statuses: {
      CUSTOM_REVIEW: {
        name: "Review",
        label: "Review",
        tagTitle: "task-status/Review",
        tagTitles: ["task-status/Review"],
      },
      ACTIVE: {
        name: "Active",
        label: "Active",
        tagTitle: "task-status/Active",
        tagTitles: ["task-status/Active"],
      },
    },
  });

  assert.equal(reorderedHelpers.getNextStatus(null), "CUSTOM_REVIEW");
  assert.equal(reorderedHelpers.getNextStatus("CUSTOM_REVIEW"), "ACTIVE");
  assert.equal(reorderedHelpers.getNextStatus("ACTIVE"), null);
});

test("applying status to DONE preserves Better Tasks completion state", () => {
  const input = "{{[[DONE]]}} Finished item";
  const expected = "{{[[DONE]]}} #[[task-status/Active]] Finished item";

  assert.equal(helpers.applyStatusToText(input, "ACTIVE"), expected);
});

test("bulk text transforms apply status to each selected text", () => {
  const inputs = [
    "{{[[TODO]]}} First",
    "{{[[DONE]]}} #[[task-status/Waiting]] Second",
  ];

  assert.deepEqual(helpers.applyStatusToTexts(inputs, "ALERT"), [
    "{{[[TODO]]}} #[[task-status/Alert]] First",
    "{{[[DONE]]}} #[[task-status/Alert]] Second",
  ]);
});

test("target resolver prefers msContextMenu context blocks", async () => {
  const targets = await resolveTaskStatusTargetUids({
    context: {
      blocks: [{ "block-uid": "ctx-one" }, { "block-uid": "ctx-two" }],
      "block-uid": "single",
    },
    roamAlphaAPI: {
      ui: {
        individualMultiselect: {
          getSelectedUids: async () => ["individual"],
        },
        multiselect: {
          getSelected: async () => [{ "block-uid": "drag" }],
        },
        getFocusedBlock: () => ({ "block-uid": "focused" }),
      },
    },
  });

  assert.deepEqual(targets, ["ctx-one", "ctx-two"]);
});

test("target resolver uses individual multiselect uids", async () => {
  const targets = await resolveTaskStatusTargetUids({
    primaryUid: "single",
    roamAlphaAPI: {
      ui: {
        individualMultiselect: {
          getSelectedUids: async () => ["selected-one", { "block-uid": "selected-two" }],
        },
        getFocusedBlock: () => ({ "block-uid": "focused" }),
      },
    },
  });

  assert.deepEqual(targets, ["selected-one", "selected-two"]);
});

test("target resolver falls back to drag multiselect", async () => {
  const targets = await resolveTaskStatusTargetUids({
    primaryUid: "single",
    roamAlphaAPI: {
      ui: {
        individualMultiselect: {
          getSelectedUids: async () => [],
        },
        multiselect: {
          getSelected: async () => [{ "block-uid": "drag-one" }, { uid: "drag-two" }],
        },
        getFocusedBlock: () => ({ "block-uid": "focused" }),
      },
    },
  });

  assert.deepEqual(targets, ["drag-one", "drag-two"]);
});

test("target resolver falls back to explicit then focused block", async () => {
  const explicit = await resolveTaskStatusTargetUids({
    primaryUid: "explicit",
    roamAlphaAPI: {
      ui: {
        individualMultiselect: { getSelectedUids: async () => [] },
        multiselect: { getSelected: async () => [] },
        getFocusedBlock: () => ({ "block-uid": "focused" }),
      },
    },
  });
  const focused = await resolveTaskStatusTargetUids({
    roamAlphaAPI: {
      ui: {
        individualMultiselect: { getSelectedUids: async () => [] },
        multiselect: { getSelected: async () => [] },
        getFocusedBlock: () => ({ "block-uid": "focused" }),
      },
    },
  });

  assert.deepEqual(explicit, ["explicit"]);
  assert.deepEqual(focused, ["focused"]);
});
