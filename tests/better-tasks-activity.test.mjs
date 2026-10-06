import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_LOG_CONTAINER_TITLES,
  buildStatusActivityProps,
  createBetterTasksActivityRecorder,
  renderStatusActivityLine,
  statusLabelFromTaskText,
  statusLabelFromTagTitle,
} from "../src/better-tasks-activity.js";

// Fake graph modelled on Better Tasks' activity log (better-tasks
// src/index.js `ensureHistoryContainer` / `recordActivity`): the task block
// has a child whose string is the locale container title, and each event is
// a child of that container with text `YYYY-MM-DD HH:MM — <label>` and
// `:block/props` `{ bt: { kind: "event", … } }`. Pull results use Roam's
// keyword keys and unordered children.
function fakeGraph(blocks) {
  const byUid = new Map(Object.entries(blocks).map(([uid, b]) => [uid, { children: [], props: null, ...b }]));
  const calls = [];
  let uidCounter = 0;
  const roamAlphaAPI = {
    util: { generateUID: () => `gen-${++uidCounter}` },
    data: {
      async: {
        async pull(pattern, [, uid]) {
          calls.push(["pull", uid]);
          const block = byUid.get(uid);
          if (!block) return null;
          const children = block.children
            .map((childUid, index) => ({
              ":block/uid": childUid,
              ":block/string": byUid.get(childUid)?.string ?? "",
              ":block/order": index,
            }))
            .reverse();
          return { ":block/uid": uid, ":block/children": children };
        },
      },
      block: {
        async create({ location, block }) {
          calls.push(["create", location["parent-uid"], block.string, block.uid, block.props]);
          const parent = byUid.get(location["parent-uid"]);
          if (!parent) throw new Error("no parent");
          byUid.set(block.uid, { string: block.string, children: [], props: block.props ?? null });
          parent.children.push(block.uid);
        },
        async update({ block }) {
          calls.push(["update", block.uid, block.props]);
          const target = byUid.get(block.uid);
          if (!target) throw new Error("no block");
          if (block.props) target.props = block.props;
        },
      },
    },
  };
  return { roamAlphaAPI, calls, byUid };
}

const NOW = new Date(2026, 9, 4, 15, 29).getTime();

function taskWithLog() {
  return fakeGraph({
    task: { string: "{{[[TODO]]}} Call the lab", children: ["due", "log"] },
    due: { string: "BT_attrDue:: [[October 6th, 2026]]", children: [] },
    log: { string: "**Activity log**", children: ["created"] },
    created: {
      string: "2026-10-04 15:20 — Created",
      props: { bt: { kind: "event", event: "create", ts: NOW - 9 * 60_000, source: "inline" } },
    },
  });
}

test("container titles cover every Better Tasks locale and the line mirrors its templates", () => {
  assert.ok(ACTIVITY_LOG_CONTAINER_TITLES.includes("**Activity log**"));
  assert.ok(ACTIVITY_LOG_CONTAINER_TITLES.includes("**Aktivitätsprotokoll**"));
  assert.equal(renderStatusActivityLine({ to: "Waiting", ts: NOW }), "2026-10-04 15:29 — status → Waiting");
  assert.equal(renderStatusActivityLine({ to: null, ts: NOW }), "2026-10-04 15:29 — status removed");
  assert.deepEqual(buildStatusActivityProps({ from: "Active", to: "Waiting", ts: NOW }), {
    bt: { kind: "event", event: "attr_change", ts: NOW, field: "status", source: "task-status-tags", from: "Active", to: "Waiting" },
  });
  // Better Tasks `parseEventFromText` accepts exactly this shape.
  assert.match(
    renderStatusActivityLine({ to: "Waiting", ts: NOW }),
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\s*[—\-]\s*(.+)$/
  );
});

test("status labels are read from the task prefix only", () => {
  assert.equal(statusLabelFromTaskText("{{[[TODO]]}} #[[task-status/Waiting]] Call"), "Waiting");
  assert.equal(statusLabelFromTaskText("{{[[TODO]]}} #task-status/Active Call"), "Active");
  assert.equal(statusLabelFromTaskText("{{[[TODO]]}} Call #[[task-status/Waiting]]"), null);
  assert.equal(statusLabelFromTaskText("Call #[[task-status/Waiting]]"), null);
  assert.equal(statusLabelFromTagTitle("task-status/In Review"), "In Review");
  assert.equal(statusLabelFromTagTitle("Waiting"), null);
  assert.equal(statusLabelFromTagTitle(null), null);
});

test("a status change appends exactly one event line with Better Tasks props", async () => {
  const graph = taskWithLog();
  const recorder = createBetterTasksActivityRecorder({ roamAlphaAPI: graph.roamAlphaAPI, now: () => NOW });
  const result = await recorder.record({
    uid: "task",
    previousString: "{{[[TODO]]}} Call the lab",
    nextString: "{{[[TODO]]}} #[[task-status/Waiting]] Call the lab",
    statusTagTitle: "task-status/Waiting",
  });

  assert.equal(result.recorded, true);
  assert.equal(result.reason, "recorded");
  assert.equal(result.containerUid, "log");
  assert.deepEqual(graph.byUid.get("log").children, ["created", "gen-1"]);
  assert.equal(graph.byUid.get("gen-1").string, "2026-10-04 15:29 — status → Waiting");
  assert.deepEqual(graph.byUid.get("gen-1").props, {
    bt: { kind: "event", event: "attr_change", ts: NOW, field: "status", source: "task-status-tags", to: "Waiting" },
  });
  const creates = graph.calls.filter(([kind]) => kind === "create");
  assert.equal(creates.length, 1);
  assert.deepEqual(creates[0][4], graph.byUid.get("gen-1").props, "props travel in the single create");
  assert.equal(graph.calls.filter(([kind]) => kind === "update").length, 0, "no props update for the entry");
  assert.equal(graph.byUid.get("task").string, "{{[[TODO]]}} Call the lab", "task string is never touched");
  assert.deepEqual(graph.byUid.get("task").children, ["due", "log"], "no new task children");
});

test("clearing the tag records a removal with the previous label", async () => {
  const graph = taskWithLog();
  graph.byUid.get("task").string = "{{[[TODO]]}} #[[task-status/Waiting]] Call the lab";
  const recorder = createBetterTasksActivityRecorder({ roamAlphaAPI: graph.roamAlphaAPI, now: () => NOW });
  const result = await recorder.record({
    uid: "task",
    previousString: "{{[[TODO]]}} #[[task-status/Waiting]] Call the lab",
    nextString: "{{[[TODO]]}} Call the lab",
    statusTagTitle: null,
  });
  assert.equal(result.recorded, true);
  assert.equal(graph.byUid.get("gen-1").string, "2026-10-04 15:29 — status removed");
  assert.deepEqual(graph.byUid.get("gen-1").props.bt, {
    kind: "event", event: "attr_change", ts: NOW, field: "status", source: "task-status-tags", from: "Waiting",
  });
  assert.equal(graph.calls.filter(([kind]) => kind === "update").length, 0);
});

test("tasks without a Better Tasks activity log are left alone", async () => {
  const graph = fakeGraph({
    task: { string: "{{[[TODO]]}} Legacy", children: ["due"] },
    due: { string: "BT_attrDue:: [[October 6th, 2026]]" },
  });
  const recorder = createBetterTasksActivityRecorder({ roamAlphaAPI: graph.roamAlphaAPI, now: () => NOW });
  const result = await recorder.record({
    uid: "task",
    previousString: "{{[[TODO]]}} Legacy",
    nextString: "{{[[TODO]]}} #[[task-status/Waiting]] Legacy",
    statusTagTitle: "task-status/Waiting",
  });
  assert.deepEqual(result, { recorded: false, reason: "no-activity-log" });
  assert.equal(graph.calls.filter(([kind]) => kind !== "pull").length, 0);
});

test("localized containers are recognised and an identical trailing line is not repeated", async () => {
  const graph = fakeGraph({
    task: { string: "{{[[TODO]]}} Aufgabe", children: ["log"] },
    log: { string: "**Aktivitätsprotokoll**", children: [] },
  });
  const recorder = createBetterTasksActivityRecorder({ roamAlphaAPI: graph.roamAlphaAPI, now: () => NOW });
  const args = {
    uid: "task",
    previousString: "{{[[TODO]]}} Aufgabe",
    nextString: "{{[[TODO]]}} #[[task-status/Waiting]] Aufgabe",
    statusTagTitle: "task-status/Waiting",
  };
  const first = await recorder.record(args);
  assert.equal(first.recorded, true);
  const second = await recorder.record(args);
  assert.equal(second.recorded, false);
  assert.equal(second.reason, "duplicate");
  assert.equal(second.entryUid, "gen-1");
  assert.equal(graph.byUid.get("log").children.length, 1);
});

test("missing block, unchanged status, and write failures are reported without throwing", async () => {
  const graph = taskWithLog();
  const recorder = createBetterTasksActivityRecorder({ roamAlphaAPI: graph.roamAlphaAPI, now: () => NOW });
  assert.deepEqual(
    await recorder.record({ uid: "nope", previousString: "", nextString: "", statusTagTitle: "task-status/Waiting" }),
    { recorded: false, reason: "block-not-found" }
  );
  assert.deepEqual(
    await recorder.record({
      uid: "task",
      previousString: "{{[[TODO]]}} #[[task-status/Waiting]] x",
      nextString: "{{[[TODO]]}} #[[task-status/Waiting]] x",
      statusTagTitle: "task-status/Waiting",
    }),
    { recorded: false, reason: "status-unchanged" }
  );

  graph.roamAlphaAPI.data.block.create = async () => { throw new Error("boom"); };
  const failed = await recorder.record({
    uid: "task",
    previousString: "{{[[TODO]]}} Call the lab",
    nextString: "{{[[TODO]]}} #[[task-status/Waiting]] Call the lab",
    statusTagTitle: "task-status/Waiting",
  });
  assert.equal(failed.recorded, false);
  assert.equal(failed.reason, "activity-write-failed");
  assert.equal(failed.error.message, "boom");
});

test("a Roam API without the write surface degrades to not recorded", async () => {
  const recorder = createBetterTasksActivityRecorder({ roamAlphaAPI: { data: { async: { pull() {} } } } });
  assert.deepEqual(
    await recorder.record({ uid: "task", previousString: "{{[[TODO]]}} x", nextString: "{{[[TODO]]}} #[[task-status/Waiting]] x", statusTagTitle: "task-status/Waiting" }),
    { recorded: false, reason: "roam-api-unavailable" }
  );
});
