import assert from "node:assert/strict";
import test from "node:test";

import {
  addDays,
  createFollowUpPrompt,
  dailyNoteTitle,
  isFollowUpStatusKey,
  parseDueValue,
  parseIsoDate,
  quickPicks,
  readFollowUpState,
  resolveFollowUpSurface,
  toIsoDate,
  writeFollowUpDate,
} from "../src/follow-up-date.js";

// --- a tiny DOM, enough for the prompt -------------------------------------

class FakeNode extends EventTarget {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.className = "";
    this.textContent = "";
    this.value = "";
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  focus() { focused.node = this; }
  *walk() {
    for (const child of this.children) {
      yield child;
      yield* child.walk();
    }
  }
  querySelectorAll(selector) {
    const classes = selector.split(",").map((part) => part.trim().replace(/^\./, ""));
    return [...this.walk()].filter((node) => {
      const own = String(node.className).split(/\s+/);
      return classes.some((cls) => own.includes(cls));
    });
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

const focused = { node: null };
const fakeDocument = { createElement: (tag) => new FakeNode(tag) };

function key(target, keyName) {
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperty(event, "key", { value: keyName });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

const TODAY = new Date(2026, 10, 11, 9, 30); // Wed Nov 11 2026

function makePrompt(options = {}) {
  const decisions = [];
  const prompt = createFollowUpPrompt({
    document: fakeDocument,
    statusLabel: "Waiting",
    existingDue: null,
    today: TODAY,
    onDecision: (decision) => decisions.push(decision),
    ...options,
  });
  return { prompt, decisions };
}

function itemByAction(prompt, action) {
  return prompt.element
    .querySelectorAll(".ts-follow-up-item")
    .find((node) => node.getAttribute("data-follow-up-action") === action);
}

// --- a fake Better Tasks + Roam graph --------------------------------------

function makeGraph({
  string = "{{[[TODO]]}} #[[task-status/Waiting]] Call the vendor",
  children = [],
  kind = "task",
  dueName = "BT_attrDue",
  dueAliases = [],
  modifyResult = null,
  withTools = true,
  withV2 = true,
} = {}) {
  const block = { uid: "task00001", string, children: children.map((c) => ({ ...c })) };
  const calls = { modify: [], classify: 0 };
  const tools = [
    {
      name: "bt_get_attributes",
      execute: async () => ({
        surface: "Child",
        attributes: [{ id: "due", name: dueName, aliases: dueAliases }],
      }),
    },
    {
      name: "bt_modify",
      execute: async (args) => {
        calls.modify.push(args);
        if (modifyResult) return modifyResult;
        const due = block.children.find((child) => child.string.startsWith(`${dueName}::`));
        const d = parseIsoDate(args.attributes.due);
        const value = `${dueName}:: [[${dailyNoteTitle(d)}]]`;
        if (due) due.string = value;
        else block.children.push({ uid: "newdue001", string: value });
        return { uid: args.uid, due: `[[${dailyNoteTitle(d)}]]` };
      },
    },
  ];
  const windowLike = {
    roamAlphaAPI: {
      data: {
        async: {
          pull: async (_pattern, eid) => {
            if (eid[1] !== block.uid) return null;
            return {
              ":block/uid": block.uid,
              ":block/string": block.string,
              ":block/children": block.children.map((c) => ({ ":block/uid": c.uid, ":block/string": c.string })),
            };
          },
        },
      },
    },
    betterTasks: withV2
      ? { v2: { classifyBlock: async () => { calls.classify += 1; return { kind }; } } }
      : undefined,
    RoamExtensionTools: withTools ? { "better-tasks": { tools } } : undefined,
  };
  return { windowLike, block, calls };
}

// --- tests -----------------------------------------------------------------

test("only Waiting and In Review ask for a follow-up date", () => {
  assert.equal(isFollowUpStatusKey("WAITING"), true);
  assert.equal(isFollowUpStatusKey("IN_REVIEW"), true);
  for (const other of ["ACTIVE", "HOLDING", "ALERT", "SERIES", "WATCHING", null]) {
    assert.equal(isFollowUpStatusKey(other), false);
  }
});

test("quick picks are tomorrow, in three days and in a week, as local dates", () => {
  const picks = quickPicks(TODAY);
  assert.deepEqual(picks.map((p) => p.label), ["Tomorrow", "In 3 days", "Next week"]);
  assert.deepEqual(picks.map((p) => toIsoDate(p.date)), ["2026-11-12", "2026-11-14", "2026-11-18"]);
  assert.deepEqual(picks.map((p) => p.hint), ["Thu", "Sat", "Nov 18"]);
  assert.equal(toIsoDate(addDays(new Date(2026, 11, 30), 3)), "2027-01-02");
});

test("dates parse from ISO and Roam daily-note titles", () => {
  assert.equal(parseIsoDate("2026-02-30"), null);
  assert.equal(toIsoDate(parseIsoDate("2026-02-28")), "2026-02-28");
  assert.equal(dailyNoteTitle(new Date(2026, 10, 1)), "November 1st, 2026");
  assert.equal(dailyNoteTitle(new Date(2026, 10, 12)), "November 12th, 2026");
  assert.equal(dailyNoteTitle(new Date(2026, 10, 22)), "November 22nd, 2026");
  assert.equal(toIsoDate(parseDueValue("[[November 14th, 2026]]")), "2026-11-14");
  assert.equal(toIsoDate(parseDueValue("[[2026-11-14]]")), "2026-11-14");
  assert.equal(toIsoDate(parseDueValue("2026-11-14")), "2026-11-14");
  assert.equal(parseDueValue("someday"), null);
});

test("no Better Tasks, no v2 or no bt_modify means no prompt", async () => {
  assert.equal(resolveFollowUpSurface({}), null);
  assert.equal(resolveFollowUpSurface(makeGraph({ withTools: false }).windowLike), null);
  assert.equal(resolveFollowUpSurface(makeGraph({ withV2: false }).windowLike), null);
  const state = await readFollowUpState({ windowLike: {}, uid: "task00001" });
  assert.deepEqual(state, { eligible: false, reason: "better-tasks-unavailable" });
});

test("asks only for an open Better Tasks task", async () => {
  const ordinary = makeGraph({ kind: "ordinary" });
  assert.equal((await readFollowUpState({ windowLike: ordinary.windowLike, uid: "task00001" })).reason, "not-a-better-tasks-task");
  const done = makeGraph({ string: "{{[[DONE]]}} #[[task-status/Waiting]] Call" });
  assert.equal((await readFollowUpState({ windowLike: done.windowLike, uid: "task00001" })).reason, "not-an-open-task");
  const open = makeGraph();
  const state = await readFollowUpState({ windowLike: open.windowLike, uid: "task00001" });
  assert.equal(state.eligible, true);
  assert.equal(state.existingDue, null);
});

test("reads the existing due date under the configured attribute name", async () => {
  const { windowLike } = makeGraph({
    dueName: "Due",
    children: [
      { uid: "proj00001", string: "BT_attrProject:: [[Ops]]" },
      { uid: "due000001", string: "Due:: [[November 20th, 2026]]" },
    ],
  });
  const state = await readFollowUpState({ windowLike, uid: "task00001" });
  assert.equal(state.eligible, true);
  assert.equal(state.existingDue.uid, "due000001");
  assert.equal(state.existingDue.value, "[[November 20th, 2026]]");
  assert.equal(toIsoDate(state.existingDue.date), "2026-11-20");
});

test("writes the date through Better Tasks once, keeping the due block's uid", async () => {
  const { windowLike, block, calls } = makeGraph({
    children: [{ uid: "due000001", string: "BT_attrDue:: [[November 20th, 2026]]" }],
  });
  const result = await writeFollowUpDate({ windowLike, uid: "task00001", date: new Date(2026, 10, 14) });
  assert.deepEqual(calls.modify, [{ uid: "task00001", attributes: { due: "2026-11-14" } }]);
  assert.equal(result.status, "updated");
  assert.equal(result.dueUid, "due000001");
  assert.equal(result.sameUid, true);
  assert.equal(block.children[0].string, "BT_attrDue:: [[November 14th, 2026]]");
  assert.equal(block.string, "{{[[TODO]]}} #[[task-status/Waiting]] Call the vendor");
});

test("adds a due date when there was none", async () => {
  const { windowLike, calls } = makeGraph();
  const result = await writeFollowUpDate({ windowLike, uid: "task00001", date: new Date(2026, 10, 12) });
  assert.equal(calls.modify.length, 1);
  assert.equal(result.status, "updated");
  assert.equal(result.sameUid, null);
});

test("the same date writes nothing; refusals and unconfirmed writes are reported", async () => {
  const same = makeGraph({ children: [{ uid: "due000001", string: "BT_attrDue:: [[November 14th, 2026]]" }] });
  const unchanged = await writeFollowUpDate({ windowLike: same.windowLike, uid: "task00001", date: new Date(2026, 10, 14) });
  assert.equal(unchanged.status, "unchanged");
  assert.equal(same.calls.modify.length, 0);

  const refused = makeGraph({ modifyResult: { error: "Task not found" } });
  const r = await writeFollowUpDate({ windowLike: refused.windowLike, uid: "task00001", date: new Date(2026, 10, 14) });
  assert.equal(r.status, "rejected");

  const silent = makeGraph({ modifyResult: { uid: "task00001" } });
  const s = await writeFollowUpDate({ windowLike: silent.windowLike, uid: "task00001", date: new Date(2026, 10, 14) });
  assert.equal(s.status, "unknown");
  assert.equal(s.reason, "due-not-confirmed");
});

test("prompt: quick picks, a date field and Skip; Enter picks", () => {
  const { prompt, decisions } = makePrompt();
  const actions = prompt.element
    .querySelectorAll(".ts-follow-up-item")
    .map((node) => node.getAttribute("data-follow-up-action"));
  assert.deepEqual(actions, ["tomorrow", "in-3-days", "next-week", "skip"]);
  assert.ok(prompt.element.querySelector(".ts-follow-up-date"));

  prompt.focusFirst();
  assert.equal(focused.node, itemByAction(prompt, "tomorrow"));
  const event = key(focused.node, "Enter");
  assert.equal(prompt.handleKey(event), true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].action, "set");
  assert.equal(toIsoDate(decisions[0].date), "2026-11-12");
  // A decided prompt decides once.
  prompt.handleKey(key(itemByAction(prompt, "skip"), "Enter"));
  assert.equal(decisions.length, 1);
});

test("prompt: Escape cancels and Skip writes nothing", () => {
  const first = makePrompt();
  first.prompt.handleKey(key(itemByAction(first.prompt, "tomorrow"), "Escape"));
  assert.deepEqual(first.decisions, [{ action: "cancel" }]);

  const second = makePrompt();
  second.prompt.handleKey(key(itemByAction(second.prompt, "skip"), " "));
  assert.deepEqual(second.decisions, [{ action: "skip" }]);
});

test("prompt: arrow keys move through the choices and wrap", () => {
  const { prompt } = makePrompt();
  prompt.focusFirst();
  prompt.handleKey(key(focused.node, "ArrowDown"));
  assert.equal(focused.node, itemByAction(prompt, "in-3-days"));
  prompt.handleKey(key(focused.node, "ArrowUp"));
  prompt.handleKey(key(focused.node, "ArrowUp"));
  assert.equal(focused.node, itemByAction(prompt, "skip"));
});

test("prompt: the date field sets the typed date on Enter", () => {
  const { prompt, decisions } = makePrompt();
  const input = prompt.element.querySelector(".ts-follow-up-date");
  assert.equal(input.value, "2026-11-12");
  input.value = "2026-12-01";
  assert.equal(prompt.handleKey(key(input, "ArrowDown")), false);
  prompt.handleKey(key(input, "Enter"));
  assert.equal(decisions[0].action, "set");
  assert.equal(toIsoDate(decisions[0].date), "2026-12-01");

  const bad = makePrompt();
  const badInput = bad.prompt.element.querySelector(".ts-follow-up-date");
  badInput.value = "";
  bad.prompt.handleKey(key(badInput, "Enter"));
  assert.equal(bad.decisions.length, 0);
  assert.equal(badInput.getAttribute("aria-invalid"), "true");
});

test("prompt: an existing due date is shown first and can be kept", () => {
  const { prompt, decisions } = makePrompt({
    existingDue: { uid: "due000001", value: "[[November 14th, 2026]]", date: new Date(2026, 10, 14, 12) },
  });
  const actions = prompt.element
    .querySelectorAll(".ts-follow-up-item")
    .map((node) => node.getAttribute("data-follow-up-action"));
  // In 3 days is Nov 14 too, so it is not offered twice.
  assert.deepEqual(actions, ["keep", "tomorrow", "next-week", "skip"]);
  assert.equal(itemByAction(prompt, "keep").children[0].textContent, "Keep due Nov 14");
  assert.equal(prompt.element.querySelector(".ts-follow-up-date").value, "2026-11-14");
  prompt.focusFirst();
  prompt.handleKey(key(focused.node, "Enter"));
  assert.deepEqual(decisions, [{ action: "keep" }]);
});
