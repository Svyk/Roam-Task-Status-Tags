import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createEpisodeCounterController,
  createEpisodeMenu,
  formatEpisode,
  newSeason,
  nextEpisode,
  parseEpisode,
  readEpisodeState,
  writeEpisode,
} from "../src/episode-counter.js";
import { createBetterTasksActivityRecorder } from "../src/better-tasks-activity.js";

// --- fake graph -------------------------------------------------------------

function fakeGraph(blocks) {
  const byUid = new Map(Object.entries(blocks).map(([uid, b]) => [uid, { children: [], ...b }]));
  const calls = [];
  let uidCounter = 0;
  const hooks = { afterWrite: null };
  const snapshot = (uid) => {
    const block = byUid.get(uid);
    if (!block) return null;
    return {
      ":block/uid": uid,
      ":block/string": block.string,
      ":block/children": block.children
        .map((childUid, index) => ({
          ":block/uid": childUid,
          ":block/string": byUid.get(childUid)?.string ?? "",
          ":block/order": index,
        }))
        .reverse(),
    };
  };
  const roamAlphaAPI = {
    util: { generateUID: () => `ep-${++uidCounter}` },
    data: {
      pull: (_pattern, [, uid]) => snapshot(uid),
      async: {
        async pull(_pattern, [, uid]) {
          calls.push(["pull", uid]);
          await Promise.resolve();
          return snapshot(uid);
        },
      },
      block: {
        async create({ location, block }) {
          calls.push(["create", location["parent-uid"], location.order, block.uid, block.string, Object.keys(block).sort()]);
          await Promise.resolve();
          const parent = byUid.get(location["parent-uid"]);
          if (!parent) throw new Error("no parent");
          byUid.set(block.uid, { string: block.string, children: [] });
          parent.children.push(block.uid);
          hooks.afterWrite?.(block.uid);
        },
        async update({ block }) {
          calls.push(["update", block.uid, block.string, Object.keys(block).sort()]);
          await Promise.resolve();
          const target = byUid.get(block.uid);
          if (!target) throw new Error("no block");
          target.string = block.string;
          hooks.afterWrite?.(block.uid);
        },
      },
    },
  };
  return { roamAlphaAPI, calls, byUid, hooks };
}

const writes = (graph) => graph.calls.filter(([kind]) => kind === "create" || kind === "update");

function taskGraph(extra = {}) {
  return fakeGraph({
    task: { string: "{{[[TODO]]}} #[[task-status/Series]] Show", children: ["due"] },
    due: { string: "BT_attrDue:: [[November 20th, 2026]]" },
    ...extra,
  });
}

// --- pure helpers -----------------------------------------------------------

test("parseEpisode accepts any case, zero padding and spaces, and rejects the rest", () => {
  assert.deepEqual(parseEpisode("S2E5"), { season: 2, episode: 5 });
  assert.deepEqual(parseEpisode("  s02e05 "), { season: 2, episode: 5 });
  assert.deepEqual(parseEpisode("S10E120"), { season: 10, episode: 120 });
  for (const bad of ["", "S2", "E5", "S2E", "S0E1", "S1E0", "S1E10000", "S2 E5", "S2E5x", "2x5", null, undefined, 5]) {
    assert.equal(parseEpisode(bad), null, String(bad));
  }
});

test("formatEpisode does not pad; next and new season behave", () => {
  assert.equal(formatEpisode({ season: 2, episode: 5 }), "S2E5");
  assert.equal(formatEpisode(parseEpisode("s02e05")), "S2E5");
  assert.deepEqual(nextEpisode({ season: 2, episode: 5 }), { season: 2, episode: 6 });
  assert.deepEqual(newSeason({ season: 2, episode: 5 }), { season: 3, episode: 1 });
});

// --- writeEpisode -----------------------------------------------------------

test("first use creates exactly one Episode child at the end of the task", async () => {
  const graph = taskGraph();
  const result = await writeEpisode({
    roamAlphaAPI: graph.roamAlphaAPI,
    uid: "task",
    compute: (current) => (current ? nextEpisode(current) : { season: 1, episode: 1 }),
  });
  assert.equal(result.status, "updated");
  assert.equal(result.value, "S1E1");
  assert.deepEqual(writes(graph), [["create", "task", "last", "ep-1", "Episode:: S1E1", ["string", "uid"]]]);
  assert.deepEqual(graph.byUid.get("task").children, ["due", "ep-1"]);
  assert.equal(graph.byUid.get("task").string, "{{[[TODO]]}} #[[task-status/Series]] Show");
  assert.equal(graph.byUid.get("due").string, "BT_attrDue:: [[November 20th, 2026]]");
});

test("an existing child is updated in place: same uid, only its string", async () => {
  const graph = taskGraph({ ep: { string: "Episode:: S2E5" } });
  graph.byUid.get("task").children.push("ep");
  const result = await writeEpisode({
    roamAlphaAPI: graph.roamAlphaAPI,
    uid: "task",
    compute: nextEpisode,
  });
  assert.equal(result.status, "updated");
  assert.equal(result.childUid, "ep");
  assert.deepEqual(writes(graph), [["update", "ep", "Episode:: S2E6", ["string", "uid"]]]);
  assert.deepEqual(graph.byUid.get("task").children, ["due", "ep"]);
});

test("the same value writes nothing and records nothing", async () => {
  const graph = taskGraph({ ep: { string: "episode::  s02e05" } });
  graph.byUid.get("task").children.push("ep");
  const recorded = [];
  const result = await writeEpisode({
    roamAlphaAPI: graph.roamAlphaAPI,
    uid: "task",
    compute: () => ({ season: 2, episode: 5 }),
    activityRecorder: { recordAttributeChange: async (change) => recorded.push(change) },
  });
  assert.equal(result.status, "unchanged");
  assert.equal(writes(graph).length, 0);
  assert.equal(recorded.length, 0);
});

test("an unparseable existing value fails closed", async () => {
  const graph = taskGraph({ ep: { string: "Episode:: season two" } });
  graph.byUid.get("task").children.push("ep");
  const result = await writeEpisode({ roamAlphaAPI: graph.roamAlphaAPI, uid: "task", compute: nextEpisode });
  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "invalid-existing-value");
  assert.equal(writes(graph).length, 0);
  const state = await readEpisodeState({ roamAlphaAPI: graph.roamAlphaAPI, uid: "task" });
  assert.equal(state.invalid, true);
});

test("an out-of-range computed value is rejected before any write", async () => {
  const graph = taskGraph({ ep: { string: "Episode:: S1E9999" } });
  graph.byUid.get("task").children.push("ep");
  const result = await writeEpisode({ roamAlphaAPI: graph.roamAlphaAPI, uid: "task", compute: nextEpisode });
  assert.equal(result.status, "rejected");
  assert.equal(writes(graph).length, 0);
});

test("a first line Episode:: with extra lines is recognised; only the first line's value changes", async () => {
  const graph = taskGraph({ ep: { string: "Episode:: S1E1\nwatched with Sam" } });
  graph.byUid.get("task").children.push("ep");
  const state = await readEpisodeState({ roamAlphaAPI: graph.roamAlphaAPI, uid: "task" });
  assert.deepEqual(state.episode, { season: 1, episode: 1 });
  const result = await writeEpisode({ roamAlphaAPI: graph.roamAlphaAPI, uid: "task", compute: nextEpisode });
  assert.equal(result.status, "updated");
  assert.deepEqual(writes(graph), [["update", "ep", "Episode:: S1E2\nwatched with Sam", ["string", "uid"]]]);
  assert.equal(graph.byUid.get("ep").string, "Episode:: S1E2\nwatched with Sam");
  const upper = taskGraph({ ep: { string: "EPISODE::s02e05\n\nmore" } });
  upper.byUid.get("task").children.push("ep");
  const state2 = await readEpisodeState({ roamAlphaAPI: upper.roamAlphaAPI, uid: "task" });
  assert.deepEqual(state2.episode, { season: 2, episode: 5 });
});

test("two Episode blocks fail closed: invalid state and no write", async () => {
  const graph = taskGraph({ ep1: { string: "Episode:: S1E2" }, ep2: { string: "Episode:: S5E5" } });
  graph.byUid.get("task").children.push("ep1", "ep2");
  const state = await readEpisodeState({ roamAlphaAPI: graph.roamAlphaAPI, uid: "task" });
  assert.equal(state.invalid, true);
  assert.equal(state.duplicate, true);
  const result = await writeEpisode({ roamAlphaAPI: graph.roamAlphaAPI, uid: "task", compute: nextEpisode });
  assert.deepEqual([result.status, result.reason], ["rejected", "duplicate-episode-blocks"]);
  assert.equal(writes(graph).length, 0);
});

test("two Episode blocks show ? on the counter", () => {
  const { controller, pill, graph } = setup({ blocks: { ep1: { string: "Episode:: S1E2" }, ep2: { string: "Episode:: S5E5" } } });
  graph.byUid.get("task").children.push("ep1", "ep2");
  const counter = controller.sync({ pill, uid: "task", kept: new Set() });
  assert.equal(counter.textContent, "?");
  assert.equal(counter.getAttribute("data-ts-episode-state"), "invalid");
});

test("menu number fields carry visible S and E prefixes", () => {
  const { menu } = makeMenu({ season: 2, episode: 5 });
  const prefixes = menu.element.querySelectorAll(".ts-episode-field-prefix").map((n) => n.textContent);
  assert.deepEqual(prefixes, ["S", "E"]);
});

test("only direct children count", async () => {
  const graph = taskGraph({
    nested: { string: "Episode:: S9E9" },
    ep1: { string: "Episode:: S1E2" },
  });
  graph.byUid.get("due").children.push("nested");
  graph.byUid.get("task").children.push("ep1");
  const state = await readEpisodeState({ roamAlphaAPI: graph.roamAlphaAPI, uid: "task" });
  assert.deepEqual(state.episode, { season: 1, episode: 2 });
  assert.equal(state.childUid, "ep1");
});

test("two concurrent increments from none give S1E2 with one block; from S1E1 give S1E3", async () => {
  const fresh = taskGraph();
  const compute = (current) => (current ? nextEpisode(current) : { season: 1, episode: 1 });
  const results = await Promise.all([
    writeEpisode({ roamAlphaAPI: fresh.roamAlphaAPI, uid: "task", compute }),
    writeEpisode({ roamAlphaAPI: fresh.roamAlphaAPI, uid: "task", compute }),
  ]);
  assert.deepEqual(results.map((r) => r.value), ["S1E1", "S1E2"]);
  assert.equal(fresh.calls.filter(([kind]) => kind === "create").length, 1);
  assert.equal(fresh.byUid.get("task").children.length, 2);

  const graph = taskGraph({ ep: { string: "Episode:: S1E1" } });
  graph.byUid.get("task").children.push("ep");
  await Promise.all([
    writeEpisode({ roamAlphaAPI: graph.roamAlphaAPI, uid: "task", compute: nextEpisode }),
    writeEpisode({ roamAlphaAPI: graph.roamAlphaAPI, uid: "task", compute: nextEpisode }),
  ]);
  assert.equal(graph.byUid.get("ep").string, "Episode:: S1E3");
  assert.equal(graph.calls.filter(([kind]) => kind === "create").length, 0);
});

test("a certification mismatch is unknown, and no log line is recorded", async () => {
  const graph = taskGraph({ ep: { string: "Episode:: S1E1" } });
  graph.byUid.get("task").children.push("ep");
  graph.hooks.afterWrite = (uid) => { graph.byUid.get(uid).string = "Episode:: S7E7"; };
  const recorded = [];
  const result = await writeEpisode({
    roamAlphaAPI: graph.roamAlphaAPI,
    uid: "task",
    compute: nextEpisode,
    activityRecorder: { recordAttributeChange: async (change) => recorded.push(change) },
  });
  assert.equal(result.status, "unknown");
  assert.equal(result.reason, "not-confirmed");
  assert.equal(recorded.length, 0);
});

test("a certified update records one attribute change; a failing recorder never fails the write", async () => {
  const graph = taskGraph({ ep: { string: "Episode:: S2E5" } });
  graph.byUid.get("task").children.push("ep");
  const recorded = [];
  const ok = await writeEpisode({
    roamAlphaAPI: graph.roamAlphaAPI,
    uid: "task",
    compute: nextEpisode,
    activityRecorder: { recordAttributeChange: async (change) => recorded.push(change) },
  });
  assert.equal(ok.status, "updated");
  assert.deepEqual(recorded, [{ uid: "task", field: "episode", from: "S2E5", to: "S2E6" }]);

  const failing = await writeEpisode({
    roamAlphaAPI: graph.roamAlphaAPI,
    uid: "task",
    compute: nextEpisode,
    activityRecorder: { recordAttributeChange: async () => { throw new Error("log down"); } },
  });
  assert.equal(failing.status, "updated");
  assert.equal(graph.byUid.get("ep").string, "Episode:: S2E7");
});

test("a first-use write adds the activity line only into an existing log (end to end)", async () => {
  const graph = taskGraph({ log: { string: "**Activity log**", children: [] } });
  graph.byUid.get("task").children.push("log");
  const NOW = new Date(2026, 10, 11, 20, 5).getTime();
  const activityRecorder = createBetterTasksActivityRecorder({ roamAlphaAPI: graph.roamAlphaAPI, now: () => NOW });
  const result = await writeEpisode({
    roamAlphaAPI: graph.roamAlphaAPI,
    uid: "task",
    compute: () => ({ season: 1, episode: 1 }),
    activityRecorder,
  });
  assert.equal(result.status, "updated");
  const line = [...graph.byUid.entries()].find(([, b]) => b.string === "2026-11-11 20:05 — episode → S1E1");
  assert.ok(line, "activity line written");
  assert.deepEqual(graph.byUid.get("log").children.length, 1);
  assert.equal(graph.calls.filter(([kind]) => kind === "create").length, 2);
});

test("missing block and bad input are rejected without writes", async () => {
  const graph = taskGraph();
  assert.equal((await writeEpisode({ roamAlphaAPI: graph.roamAlphaAPI, uid: "nope", compute: nextEpisode })).reason, "block-not-found");
  assert.equal((await writeEpisode({ roamAlphaAPI: graph.roamAlphaAPI, uid: "", compute: nextEpisode })).reason, "invalid-uid");
  assert.equal(writes(graph).length, 0);
});

// --- DOM --------------------------------------------------------------------

class FakeEl extends EventTarget {
  constructor(tag = "div") {
    super();
    this.tagName = tag.toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.isConnected = false;
  }
  get classList() {
    return { contains: (name) => String(this.className).split(/\s+/).includes(name) };
  }
  getElementsByClassName(name) {
    return [...this.walk()].filter((node) => node.classList.contains(name));
  }
  get nextSibling() {
    const siblings = this.parentElement?.children || [];
    return siblings[siblings.indexOf(this) + 1] || null;
  }
  get nextElementSibling() { return this.nextSibling; }
  setConnected(value) {
    this.isConnected = value;
    this.children.forEach((child) => child.setConnected(value));
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      node.setConnected(this.isConnected);
      this.children.push(node);
    }
  }
  insertBefore(node, reference) {
    node.parentElement = this;
    node.setConnected(this.isConnected);
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index < 0) this.children.push(node);
    else this.children.splice(index, 0, node);
    return node;
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    this.parentElement = null;
    this.setConnected(false);
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "class") this.className = String(value);
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  focus() { this.focused = true; }
  matches(selector) {
    const own = String(this.className).split(/\s+/);
    return selector.split(",").some((part) => own.includes(part.trim().replace(/^\./, "")));
  }
  *walk() {
    for (const child of this.children) {
      yield child;
      yield* child.walk();
    }
  }
  querySelectorAll(selector) { return [...this.walk()].filter((node) => node.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
    return null;
  }
}

function fakeDocument() {
  const body = new FakeEl("body");
  body.isConnected = true;
  return { body, createElement: (tag) => new FakeEl(tag), querySelectorAll: (s) => body.querySelectorAll(s) };
}

function mount(doc) {
  const row = new FakeEl("div");
  row.className = "rm-block__input";
  const checkbox = new FakeEl("label");
  checkbox.className = "rm-checkbox";
  const pill = new FakeEl("span");
  pill.className = "rm-page-ref";
  const tail = new FakeEl("span");
  tail.className = "rm-block-text";
  row.append(checkbox, pill, tail);
  doc.body.append(row);
  return { row, pill, tail };
}

function mouse(type, extra = {}) {
  const event = new Event(type, { cancelable: true, bubbles: true });
  Object.assign(event, extra);
  return event;
}

function key(type, keyName, extra = {}) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "key", { value: keyName });
  Object.assign(event, extra);
  return event;
}

function setup({ blocks } = {}) {
  const graph = taskGraph(blocks);
  const doc = fakeDocument();
  const { row, pill } = mount(doc);
  const warnings = [];
  const menus = [];
  const controller = createEpisodeCounterController({
    document: doc,
    roamAlphaAPI: graph.roamAlphaAPI,
    onOpenMenu: (context) => menus.push(context),
    warn: (...args) => warnings.push(args),
  });
  return { graph, doc, row, pill, controller, warnings, menus };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test("the counter is inserted once right after the pill and reused across refreshes", () => {
  const { controller, row, pill } = setup();
  const kept = new Set();
  const counter = controller.sync({ pill, uid: "task", kept });
  assert.equal(pill.nextElementSibling, counter);
  assert.equal(row.querySelectorAll(".ts-episode-counter").length, 1);
  assert.equal(counter.getAttribute("role"), "button");
  assert.equal(counter.getAttribute("contenteditable"), "false");
  assert.equal(counter.getAttribute("data-ts-episode-uid"), "task");

  for (let i = 0; i < 3; i += 1) {
    const again = controller.sync({ pill, uid: "task", kept: new Set() });
    assert.equal(again, counter, "same element identity");
  }
  assert.equal(row.querySelectorAll(".ts-episode-counter").length, 1);
});

test("no Episode child shows the invisible-until-hover placeholder", () => {
  const { controller, pill } = setup();
  const counter = controller.sync({ pill, uid: "task", kept: new Set() });
  assert.equal(counter.textContent, "+");
  assert.equal(counter.getAttribute("data-ts-episode-state"), "empty");
  assert.equal(counter.getAttribute("aria-label"), "Start episode counter");
});

test("an Episode child shows its value with the click hint, an invalid one shows ?", () => {
  const { controller, pill, graph } = setup({ blocks: { ep: { string: "Episode:: S2E5" } } });
  graph.byUid.get("task").children.push("ep");
  const counter = controller.sync({ pill, uid: "task", kept: new Set() });
  assert.equal(counter.textContent, "S2E5");
  assert.equal(counter.getAttribute("title"), "Episode S2E5. Click for next episode. Alt-click or right-click for more.");
  assert.equal(counter.getAttribute("aria-label"), counter.getAttribute("title"));

  graph.byUid.get("ep").string = "Episode:: nonsense";
  controller.sync({ pill, uid: "task", kept: new Set() });
  assert.equal(counter.textContent, "?");
  assert.equal(counter.getAttribute("data-ts-episode-state"), "invalid");
});

test("text is only written when it changed", () => {
  const { controller, pill } = setup();
  const counter = controller.sync({ pill, uid: "task", kept: new Set() });
  let textWrites = 0;
  let current = counter.textContent;
  Object.defineProperty(counter, "textContent", {
    get: () => current,
    set: (value) => { textWrites += 1; current = value; },
  });
  controller.sync({ pill, uid: "task", kept: new Set() });
  controller.sync({ pill, uid: "task", kept: new Set() });
  assert.equal(textWrites, 0);
});

test("sweep removes counters that were not kept (status changed away) and destroyAll cleans up", () => {
  const { controller, pill, row, doc } = setup();
  const kept = new Set();
  controller.sync({ pill, uid: "task", kept });
  controller.sweep(row, kept);
  assert.equal(row.querySelectorAll(".ts-episode-counter").length, 1);
  controller.sweep(row, new Set());
  assert.equal(row.querySelectorAll(".ts-episode-counter").length, 0);

  controller.sync({ pill, uid: "task", kept: new Set() });
  controller.destroyAll(doc.body);
  assert.equal(doc.body.querySelectorAll(".ts-episode-counter").length, 0);
});

test("clicks never reach Roam; a plain click adds one episode (first use creates S1E1)", async () => {
  const { controller, pill, graph } = setup();
  const counter = controller.sync({ pill, uid: "task", kept: new Set() });
  let bubbled = 0;
  pill.parentElement.addEventListener("mousedown", () => { bubbled += 1; });
  for (const type of ["mousedown", "mouseup"]) {
    const event = mouse(type);
    counter.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  }
  const click = mouse("click");
  counter.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
  assert.equal(counter.textContent, "S1E1", "optimistic");
  await settle();
  assert.equal(counter.textContent, "S1E1");
  assert.equal(graph.calls.filter(([kind]) => kind === "create").length, 1);
  assert.equal(graph.byUid.get("ep-1").string, "Episode:: S1E1");
});

test("two fast clicks add two episodes and one block", async () => {
  const { controller, pill, graph } = setup({ blocks: { ep: { string: "Episode:: S1E1" } } });
  graph.byUid.get("task").children.push("ep");
  const counter = controller.sync({ pill, uid: "task", kept: new Set() });
  counter.dispatchEvent(mouse("click"));
  counter.dispatchEvent(mouse("click"));
  assert.equal(counter.textContent, "S1E3");
  await settle();
  assert.equal(counter.textContent, "S1E3");
  assert.equal(graph.byUid.get("ep").string, "Episode:: S1E3");
});

test("Enter and Space add an episode; ContextMenu, Shift+F10, Alt-click and right-click open the menu", async () => {
  const { controller, pill, graph, menus } = setup({ blocks: { ep: { string: "Episode:: S2E5" } } });
  graph.byUid.get("task").children.push("ep");
  const counter = controller.sync({ pill, uid: "task", kept: new Set() });

  const enter = key("keydown", "Enter");
  counter.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, true);
  await settle();
  assert.equal(counter.textContent, "S2E6");
  counter.dispatchEvent(key("keydown", " "));
  await settle();
  assert.equal(counter.textContent, "S2E7");
  assert.equal(menus.length, 0);

  counter.dispatchEvent(key("keydown", "ContextMenu"));
  counter.dispatchEvent(key("keydown", "F10", { shiftKey: true }));
  counter.dispatchEvent(mouse("click", { altKey: true }));
  const context = mouse("contextmenu");
  counter.dispatchEvent(context);
  assert.equal(context.defaultPrevented, true);
  assert.equal(menus.length, 4);
  assert.deepEqual(menus[0].current, { season: 2, episode: 7 });
  assert.equal(menus[0].uid, "task");
  assert.equal(graph.byUid.get("ep").string, "Episode:: S2E7", "the menu alone writes nothing");
});

test("a rejected write reverts the text and warns once; an invalid value opens no menu", async () => {
  const { controller, pill, graph, warnings, menus } = setup({ blocks: { ep: { string: "Episode:: S1E1" } } });
  graph.byUid.get("task").children.push("ep");
  const counter = controller.sync({ pill, uid: "task", kept: new Set() });
  graph.roamAlphaAPI.data.block.update = async () => { throw new Error("denied"); };
  counter.dispatchEvent(mouse("click"));
  assert.equal(counter.textContent, "S1E2");
  await settle();
  assert.equal(counter.textContent, "S1E1", "reverted to the graph value");
  assert.equal(warnings.length, 1);

  graph.byUid.get("ep").string = "Episode:: ???";
  controller.sync({ pill, uid: "task", kept: new Set() });
  counter.dispatchEvent(mouse("click"));
  counter.dispatchEvent(mouse("click"));
  await settle();
  assert.equal(counter.textContent, "?");
  counter.dispatchEvent(mouse("contextmenu"));
  assert.equal(menus.length, 0);
  assert.equal(graph.byUid.get("ep").string, "Episode:: ???");
  assert.equal(warnings.length, 2, "one warning per reason");
});

test("menu decisions call the right compute", async () => {
  const { controller, pill, graph } = setup({ blocks: { ep: { string: "Episode:: S2E5" } } });
  graph.byUid.get("task").children.push("ep");
  const counter = controller.sync({ pill, uid: "task", kept: new Set() });
  await controller.applyDecision({ counter, decision: { action: "season" } });
  assert.equal(graph.byUid.get("ep").string, "Episode:: S3E1");
  await controller.applyDecision({ counter, decision: { action: "next" } });
  assert.equal(graph.byUid.get("ep").string, "Episode:: S3E2");
  await controller.applyDecision({ counter, decision: { action: "set", season: 4, episode: 12 } });
  assert.equal(graph.byUid.get("ep").string, "Episode:: S4E12");
  assert.equal(counter.textContent, "S4E12");
  const before = graph.calls.length;
  assert.equal(await controller.applyDecision({ counter, decision: { action: "cancel" } }), null);
  assert.equal(graph.calls.length, before);
});

test("a menu Set with no counter creates what was set, not S1E1", async () => {
  const { controller, pill, graph } = setup();
  const counter = controller.sync({ pill, uid: "task", kept: new Set() });
  await controller.applyDecision({ counter, decision: { action: "set", season: 3, episode: 7 } });
  assert.equal(graph.byUid.get("ep-1").string, "Episode:: S3E7");
});

test("a hand edit of the Episode block re-syncs the counter of its task", () => {
  const { controller, pill, graph, doc } = setup({ blocks: { ep: { string: "Episode:: S2E5" } } });
  graph.byUid.get("task").children.push("ep");
  const counter = controller.sync({ pill, uid: "task", kept: new Set() });
  assert.equal(counter.textContent, "S2E5");
  graph.byUid.get("ep").string = "Episode:: S2E9";
  controller.resyncUid("task");
  assert.equal(counter.textContent, "S2E9");
  graph.byUid.get("task").children = ["due"];
  controller.resyncUid("task");
  assert.equal(counter.textContent, "+");

  const attr = new FakeEl("span");
  attr.className = "rm-attr-ref";
  attr.setAttribute("data-link-title", "Episode");
  const other = new FakeEl("span");
  other.className = "rm-attr-ref";
  other.textContent = "Source";
  assert.equal(controller.isEpisodeAttributeNode(attr), true);
  assert.equal(controller.isEpisodeAttributeNode(other), false);
  assert.ok(doc.body);
});

// --- menu -------------------------------------------------------------------

function makeMenu(current) {
  const decisions = [];
  const menu = createEpisodeMenu({
    document: { createElement: (tag) => new FakeEl(tag) },
    current,
    onDecision: (decision) => decisions.push(decision),
  });
  return { menu, decisions };
}

const textOf = (menu) => menu.element.querySelectorAll(".ts-status-choice-label").map((n) => n.textContent);

test("the menu offers Next episode and New season, or a single Start item", () => {
  const withCounter = makeMenu({ season: 2, episode: 5 }).menu;
  assert.deepEqual(textOf(withCounter), ["Next episode", "New season"]);
  const hints = withCounter.element.querySelectorAll(".ts-follow-up-hint").map((n) => n.textContent);
  assert.deepEqual(hints, ["S2E6", "S3E1"]);
  const header = withCounter.element.querySelector(".ts-status-chooser-count").children[0];
  assert.equal(header.textContent, "Episode · S2E5");
  assert.deepEqual(textOf(makeMenu(null).menu), ["Start S1E1"]);
});

test("menu choices, Set, invalid input, and Escape", () => {
  const { menu, decisions } = makeMenu({ season: 2, episode: 5 });
  const [next, season] = menu.element.querySelectorAll(".ts-episode-item");
  const [seasonInput, episodeInput] = menu.element.querySelectorAll(".ts-episode-input");
  assert.equal(seasonInput.value, "2");
  assert.equal(episodeInput.value, "5");

  episodeInput.value = "0";
  const bad = key("keydown", "Enter");
  Object.defineProperty(bad, "target", { value: episodeInput });
  assert.equal(menu.handleKey(bad), true);
  assert.equal(episodeInput.getAttribute("aria-invalid"), "true");
  assert.equal(decisions.length, 0, "invalid input writes nothing");

  episodeInput.value = "12";
  seasonInput.value = "4";
  const good = key("keydown", "Enter");
  Object.defineProperty(good, "target", { value: episodeInput });
  menu.handleKey(good);
  assert.deepEqual(decisions, [{ action: "set", season: 4, episode: 12 }]);

  const other = makeMenu({ season: 2, episode: 5 });
  const items = other.menu.element.querySelectorAll(".ts-episode-item");
  items[0]._episodeChoose();
  assert.deepEqual(other.decisions, [{ action: "next" }]);
  const third = makeMenu({ season: 2, episode: 5 });
  third.menu.element.querySelectorAll(".ts-episode-item")[1]._episodeChoose();
  assert.deepEqual(third.decisions, [{ action: "season" }]);
  assert.ok(next && season);

  const esc = makeMenu(null);
  const escape = key("keydown", "Escape");
  Object.defineProperty(escape, "target", { value: esc.menu.element });
  assert.equal(esc.menu.handleKey(escape), true);
  assert.deepEqual(esc.decisions, [{ action: "cancel" }]);
});

test("Tab and arrows stay inside the menu", () => {
  const { menu } = makeMenu({ season: 1, episode: 1 });
  const first = menu.element.querySelectorAll(".ts-episode-item")[0];
  const tab = key("keydown", "Tab");
  Object.defineProperty(tab, "target", { value: first });
  assert.equal(menu.handleKey(tab), true);
  assert.equal(tab.defaultPrevented, true);
  const down = key("keydown", "ArrowDown");
  Object.defineProperty(down, "target", { value: first });
  assert.equal(menu.handleKey(down), true);
});

// --- wiring -----------------------------------------------------------------

test("extension wiring: refresh, mutation observer, shared chooser state and cleanup", () => {
  const source = readFileSync(new URL("../src/extension.js", import.meta.url), "utf8");
  assert.match(source, /EPISODE_GLYPHS\.includes\(getStatusGlyph\(statusKey\)\)/);
  assert.match(source, /presentation\?\.managed/);
  assert.match(source, /episodeCounter\.sweep\(scope, keptEpisodeCounters\)/);
  assert.match(source, /episodeCounter\.resyncUid\(uid\)/);
  assert.match(source, /function openEpisodeMenu\(/);
  assert.match(source, /episodeCounter\.destroyAll\(document\)/);
  assert.match(source, /activityRecorder,/);
});
