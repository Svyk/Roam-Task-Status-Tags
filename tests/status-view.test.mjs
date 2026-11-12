import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { episodeStateFromChildren, readEpisodeStateSync } from "../src/episode-counter.js";
import { createTaskStatusTextHelpers } from "../src/extension.js";
import { createStatusView, orderStatusGroups, queryStatusTasks } from "../src/status-view.js";

const CATALOG = [
  ["ACTIVE", "Active", false],
  ["WAITING", "Waiting", false],
  ["IN_REVIEW", "In Review", false],
  ["HOLDING", "Holding", false],
  ["INCUBATING", "Incubating", false],
  ["ALERT", "Alert", false],
  ["CANCELLED", "Cancelled", false],
  ["SERIES", "Series", true],
  ["MOVIE", "Movie", true],
  ["WATCHING", "Watching", true],
  ["WATCHLIST", "Watchlist", true],
  ["UPCOMING", "Upcoming", true],
  ["REWATCH", "Rewatch", true],
  ["DROPPED", "Dropped", true],
].map(([key, name, media]) => ({
  key,
  name,
  media,
  tagTitle: `task-status/${name}`,
  glyph: media ? name.toLowerCase() : null,
}));

const helpers = createTaskStatusTextHelpers();

// --- orderStatusGroups ------------------------------------------------------

test("orderStatusGroups: default catalog for media, tasks and all", () => {
  assert.deepEqual(orderStatusGroups(CATALOG, "media"), [
    "WATCHING", "WATCHLIST", "UPCOMING", "SERIES", "REWATCH", "MOVIE", "DROPPED",
  ]);
  assert.deepEqual(orderStatusGroups(CATALOG, "tasks"), [
    "ALERT", "ACTIVE", "WAITING", "IN_REVIEW", "HOLDING", "INCUBATING", "CANCELLED",
  ]);
  assert.deepEqual(orderStatusGroups(CATALOG, "all"), [
    ...orderStatusGroups(CATALOG, "media"),
    ...orderStatusGroups(CATALOG, "tasks"),
  ]);
});

test("orderStatusGroups: custom media status goes after the five, Dropped last, missing Watching works", () => {
  const rows = [
    { key: "DROPPED", name: "dropped", media: true },
    { key: "ANIME", name: "Anime", media: true },
    { key: "SERIES", name: "SERIES", media: true },
    { key: "UPCOMING", name: "Upcoming", media: true },
    { key: "MOVIE", name: "Movie", media: true },
  ];
  assert.deepEqual(orderStatusGroups(rows, "media"), ["UPCOMING", "SERIES", "ANIME", "MOVIE", "DROPPED"]);
});

test("orderStatusGroups: Alert first and Cancelled last by name", () => {
  const rows = [
    { key: "CANCELLED", name: "Cancelled", media: false },
    { key: "A", name: "Alpha", media: false },
    { key: "ALERT", name: "alert", media: false },
    { key: "B", name: "Beta", media: false },
  ];
  assert.deepEqual(orderStatusGroups(rows, "tasks"), ["ALERT", "A", "B", "CANCELLED"]);
});

// --- queryStatusTasks -------------------------------------------------------

function fakeApi({ tasks, children = [], asyncQ = true }) {
  const calls = [];
  const run = (query, ...args) => {
    calls.push({ query, args });
    if (query.includes(":node/title")) return tasks;
    return children;
  };
  const api = { calls };
  if (asyncQ) api.data = { async: { q: async (query, ...args) => run(query, ...args) } };
  else api.q = (query, ...args) => run(query, ...args);
  return api;
}

const WATCHING = "{{[[TODO]]}} #[[task-status/Watching]] Severance";

test("queryStatusTasks: filters done, mid-text tags and duplicates, and orders by edit time", async () => {
  const roamAlphaAPI = fakeApi({
    tasks: [
      ["a", WATCHING, "task-status/Watching", 100],
      ["a", WATCHING, "task-status/Watching", 100],
      ["b", "{{[[TODO]]}} #[[task-status/Watching]] Dark", "task-status/Watching", 300],
      ["c", "{{[[DONE]]}} #[[task-status/Watching]] Lost", "task-status/Watching", 400],
      ["d", "{{[[TODO]]}} #[[task-status/Active]] Plan and mention #[[task-status/Watching]]", "task-status/Watching", 500],
      ["e", "{{[[TODO]]}} #[[task-status/Series]] Ozark", "task-status/Series", 300],
    ],
  });
  const result = await queryStatusTasks({ roamAlphaAPI, statuses: CATALOG, helpers });
  assert.deepEqual(result.map((row) => row.uid), ["b", "e", "a"]);
  assert.equal(result[2].body, "Severance");
  assert.equal(result[2].statusKey, "WATCHING");
  assert.equal(result[2].editTime, 100);
});

test("queryStatusTasks: Episode child valid, invalid, duplicate and absent", async () => {
  const roamAlphaAPI = fakeApi({
    tasks: [
      ["ok", "{{[[TODO]]}} #[[task-status/Series]] One", "task-status/Series", 5],
      ["bad", "{{[[TODO]]}} #[[task-status/Series]] Two", "task-status/Series", 4],
      ["dup", "{{[[TODO]]}} #[[task-status/Series]] Three", "task-status/Series", 3],
      ["none", "{{[[TODO]]}} #[[task-status/Series]] Four", "task-status/Series", 2],
    ],
    children: [
      ["ok", "c1", "Episode:: S2E5", 0],
      ["bad", "c2", "Episode:: junk", 0],
      ["dup", "c3", "Episode:: S1E1", 0],
      ["dup", "c4", "Episode:: S1E2", 1],
      ["none", "c5", "Note:: x", 0],
    ],
  });
  const result = await queryStatusTasks({ roamAlphaAPI, statuses: CATALOG, helpers });
  const byUid = Object.fromEntries(result.map((row) => [row.uid, row.episode]));
  assert.deepEqual(byUid, {
    ok: { text: "S2E5" },
    bad: { text: "?", invalid: true },
    dup: { text: "?", invalid: true },
    none: null,
  });
});

test("queryStatusTasks: async.q first, q fallback, tag titles bound, no second query when empty", async () => {
  const withAsync = fakeApi({ tasks: [] });
  withAsync.q = () => assert.fail("sync q must not be used when async.q exists");
  assert.deepEqual(await queryStatusTasks({ roamAlphaAPI: withAsync, statuses: CATALOG, helpers }), []);
  assert.equal(withAsync.calls.length, 1);
  assert.deepEqual(withAsync.calls[0].args, [CATALOG.map((status) => status.tagTitle)]);

  const sync = fakeApi({ tasks: [["a", WATCHING, "task-status/Watching", 1]], asyncQ: false });
  const result = await queryStatusTasks({ roamAlphaAPI: sync, statuses: CATALOG, helpers });
  assert.equal(result.length, 1);
  assert.equal(sync.calls.length, 2);
  assert.deepEqual(sync.calls[1].args, [["a"]]);
});

// --- episodeStateFromChildren parity ---------------------------------------

test("episodeStateFromChildren matches readEpisodeStateSync", () => {
  const cases = [
    [],
    [{ uid: "x", string: "other", order: 0 }],
    [{ uid: "x", string: "Episode:: S2E5", order: 0 }],
    [{ uid: "x", string: "episode::s3e4\nmore", order: 0 }],
    [{ uid: "x", string: "Episode:: junk", order: 0 }],
    [
      { uid: "x", string: "Episode:: S1E1", order: 0 },
      { uid: "y", string: "Episode:: S1E2", order: 1 },
    ],
    [
      { uid: "y", string: "Episode:: S9E9", order: 5 },
      { uid: "z", string: "Note:: a", order: 1 },
    ],
  ];
  for (const children of cases) {
    const roamAlphaAPI = {
      data: {
        pull: () => ({
          ":block/uid": "t",
          ":block/children": children.map((child) => ({
            ":block/uid": child.uid,
            ":block/string": child.string,
            ":block/order": child.order,
          })),
        }),
      },
    };
    const expected = readEpisodeStateSync({ roamAlphaAPI, uid: "t" });
    assert.deepEqual({ found: true, ...episodeStateFromChildren(children) }, expected);
  }
});

// --- view controller --------------------------------------------------------

class FakeEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.handlers = new Map();
    this.className = "";
    this.textContent = "";
    this.style = {};
    this.scrollTop = 0;
    this.isConnected = false;
    this.focused = 0;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      node.setConnected(this.isConnected);
      this.children.push(node);
    }
  }
  appendChild(node) { this.append(node); return node; }
  setConnected(value) {
    this.isConnected = value;
    this.children.forEach((child) => child.setConnected(value));
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode = null;
    this.setConnected(false);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.handlers.get(type)?.delete(handler); }
  dispatch(type, extra = {}) {
    const event = {
      type,
      target: this,
      stopped: false,
      prevented: false,
      stopPropagation() { this.stopped = true; },
      preventDefault() { this.prevented = true; },
      ...extra,
    };
    this.handlers.get(type)?.forEach((handler) => handler(event));
    return event;
  }
  focus() { this.focused += 1; }
  hasClass(name) { return this.className.split(/\s+/).includes(name); }
  all(predicate, out = []) {
    for (const child of this.children) {
      if (predicate(child)) out.push(child);
      child.all(predicate, out);
    }
    return out;
  }
  byClass(name) { return this.all((el) => el.hasClass(name)); }
}

function setup({ tasks, children = [], statuses = CATALOG, withRender = false } = {}) {
  const document = {
    body: new FakeEl("body"),
    activeElement: null,
    createElement: (tag) => new FakeEl(tag),
    querySelector: () => null,
  };
  document.body.isConnected = true;
  const portalRoot = new FakeEl("div");
  document.body.append(portalRoot);
  const calls = { q: [], open: [], sidebar: [], write: [], render: [], unmount: [] };
  let pending = null;
  const taskRows = tasks ?? [
    ["w1", "{{[[TODO]]}} #[[task-status/Watching]] Severance", "task-status/Watching", 20],
    ["s1", "{{[[TODO]]}} #[[task-status/Series]] Ozark", "task-status/Series", 30],
    ["a1", "{{[[TODO]]}} #[[task-status/Active]] Write report", "task-status/Active", 10],
  ];
  const q = async (query) => {
    calls.q.push(query);
    if (pending) await pending.promise;
    return query.includes(":node/title") ? taskRows : children;
  };
  const roamAlphaAPI = {
    data: {
      async: { q },
      block: { create: () => calls.write.push("create"), update: () => calls.write.push("update") },
    },
    createBlock: () => calls.write.push("createBlock"),
    updateBlock: () => calls.write.push("updateBlock"),
    ui: {
      mainWindow: { openBlock: (arg) => calls.open.push(arg) },
      rightSidebar: { addWindow: (arg) => calls.sidebar.push(arg) },
      components: withRender
        ? {
            renderString: ({ el, string }) => calls.render.push({ el, string }),
            unmountNode: ({ el }) => calls.unmount.push(el),
          }
        : {},
    },
  };
  const logs = [];
  let filterSaved = null;
  const view = createStatusView({
    document,
    window: {},
    roamAlphaAPI,
    portalRoot,
    readGroups: () => ({ statuses, helpers }),
    onFilterChange: (value) => { filterSaved = value; },
    log: (...args) => logs.push(args),
  });
  const gate = () => {
    let release;
    const promise = new Promise((resolve) => { release = resolve; });
    pending = { promise, release };
    return () => { const current = pending; pending = null; current.release(); };
  };
  return { view, document, portalRoot, calls, logs, gate, get filterSaved() { return filterSaved; } };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

function groupNames(root) {
  return root.byClass("ts-status-view-group").map(
    (group) => group.byClass("ts-status-view-group-header")[0].children[0].textContent
  );
}

test("open renders groups in order and mounts in the portal", async () => {
  const { view, portalRoot } = setup();
  view.open();
  const root = portalRoot.children[0];
  assert.equal(root.getAttribute("role"), "dialog");
  assert.equal(root.getAttribute("aria-label"), "Watching now");
  assert.match(root.textContent + root.byClass("ts-status-view-message")[0].textContent, /Loading/);
  await tick();
  assert.deepEqual(groupNames(root), ["Watching", "Series"]);
  const pill = root.byClass("ts-status-view-group")[0].byClass("ts-status-pill-preview")[0];
  assert.equal(pill.getAttribute("data-task-status-key"), "WATCHING");
  assert.equal(pill.getAttribute("data-ts-status-glyph"), "watching");
  const icon = root.byClass("ts-status-view-icon")[0];
  assert.equal(icon.getAttribute("aria-hidden"), "true");
  assert.equal(root.byClass("ts-status-view-row")[0].getAttribute("tabindex"), "0");
  assert.equal(view.isOpen(), true);
});

test("filter switch re-renders from the last query without a new one", async () => {
  const ctx = setup();
  ctx.view.open();
  await tick();
  const queries = ctx.calls.q.length;
  const root = ctx.portalRoot.children[0];
  const radios = root.byClass("ts-status-view-radio");
  assert.equal(radios[0].getAttribute("aria-checked"), "true");
  radios[1].dispatch("click");
  assert.deepEqual(groupNames(root), ["Active"]);
  assert.equal(radios[1].getAttribute("aria-checked"), "true");
  assert.equal(ctx.filterSaved, "tasks");
  radios[2].dispatch("click");
  assert.deepEqual(groupNames(root), ["Watching", "Series", "Active"]);
  assert.equal(ctx.calls.q.length, queries);
});

test("empty and failure states", async () => {
  const empty = setup({ tasks: [] });
  empty.view.open();
  await tick();
  assert.equal(empty.portalRoot.children[0].byClass("ts-status-view-message")[0].textContent, "No open tasks with a media status.");
  empty.portalRoot.children[0].byClass("ts-status-view-radio")[1].dispatch("click");
  assert.equal(empty.portalRoot.children[0].byClass("ts-status-view-message")[0].textContent, "No open tasks with a task status.");
  empty.portalRoot.children[0].byClass("ts-status-view-radio")[2].dispatch("click");
  assert.equal(empty.portalRoot.children[0].byClass("ts-status-view-message")[0].textContent, "No open tasks with a status.");

  const failing = setup();
  failing.view.open();
  await tick();
  failing.view.close();
  const view2 = createStatusView({
    document: failing.document,
    window: {},
    roamAlphaAPI: { data: { async: { q: async () => { throw new Error("boom"); } } }, ui: {} },
    portalRoot: failing.portalRoot,
    readGroups: () => ({ statuses: CATALOG, helpers }),
    log: (...args) => failing.logs.push(args),
  });
  view2.open();
  await tick();
  assert.equal(failing.portalRoot.children[0].byClass("ts-status-view-message")[0].textContent, "Could not read tasks.");
  assert.equal(failing.logs.length, 1);
});

test("refresh coalescing: two refreshes during one query run exactly two cycles", async () => {
  const ctx = setup();
  const release = ctx.gate();
  ctx.view.open();
  await tick();
  void ctx.view.refresh();
  void ctx.view.refresh();
  release();
  await tick();
  await tick();
  // Each cycle is one task query (no Episode query for children-less rows in the
  // fake returns [], but rows exist, so two queries per cycle).
  assert.equal(ctx.calls.q.filter((query) => query.includes(":node/title")).length, 2);
});

test("a result that arrives after close is dropped", async () => {
  const ctx = setup();
  const release = ctx.gate();
  ctx.view.open();
  ctx.view.close();
  release();
  await tick();
  assert.equal(ctx.portalRoot.children.length, 0);
  assert.equal(ctx.view.isOpen(), false);
});

test("click opens the main window, shift-click the sidebar, inner page refs do nothing", async () => {
  const ctx = setup();
  ctx.view.open();
  await tick();
  const row = ctx.portalRoot.children[0].byClass("ts-status-view-row")[0];
  row.dispatch("click", { shiftKey: false });
  assert.deepEqual(ctx.calls.open, [{ block: { uid: "w1" } }]);
  row.dispatch("click", { shiftKey: true });
  assert.deepEqual(ctx.calls.sidebar, [{ window: { type: "block", "block-uid": "w1" } }]);
  row.dispatch("click", { target: { closest: (selector) => (selector.includes(".rm-page-ref") ? {} : null) } });
  assert.equal(ctx.calls.open.length, 1);
  const enter = row.dispatch("keydown", { key: "Enter", shiftKey: true });
  assert.equal(enter.prevented, true);
  assert.equal(ctx.calls.sidebar.length, 2);
  assert.equal(ctx.view.isOpen(), true);
});

test("Escape closes and restores focus; other keys stop at the view", async () => {
  const ctx = setup();
  const before = new FakeEl("div");
  before.setConnected(true);
  ctx.document.activeElement = before;
  ctx.view.open();
  await tick();
  const root = ctx.portalRoot.children[0];
  const other = root.dispatch("keydown", { key: "j" });
  assert.equal(other.stopped, true);
  assert.equal(ctx.view.isOpen(), true);
  const escape = root.dispatch("keydown", { key: "Escape" });
  assert.equal(escape.stopped, true);
  assert.equal(ctx.view.isOpen(), false);
  assert.equal(before.focused, 1);
});

test("dispose removes the element and unmounts rendered text; renderString is used when present", async () => {
  const ctx = setup({ withRender: true });
  ctx.view.open();
  await tick();
  assert.deepEqual(ctx.calls.render.map((entry) => entry.string).sort(), ["Ozark", "Severance"]);
  ctx.view.dispose();
  assert.equal(ctx.portalRoot.children.length, 0);
  assert.equal(ctx.calls.unmount.length, 2);
  ctx.view.open();
  assert.equal(ctx.portalRoot.children.length, 0);
});

test("the view never calls a write API", async () => {
  const ctx = setup();
  ctx.view.open();
  await tick();
  const root = ctx.portalRoot.children[0];
  root.byClass("ts-status-view-row")[0].dispatch("click");
  root.byClass("ts-status-view-button")[0].dispatch("click");
  await tick();
  root.byClass("ts-status-view-radio")[2].dispatch("click");
  ctx.view.close();
  assert.deepEqual(ctx.calls.write, []);
  const source = readFileSync(new URL("../src/status-view.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /createBlock|updateBlock|data\.block|moveBlock|deleteBlock/);
});

// --- wiring ---------------------------------------------------------------

test("extension wiring: palette command, listeners, chooser item and cleanup", () => {
  const source = readFileSync(new URL("../src/extension.js", import.meta.url), "utf8");
  assert.match(source, /const viewLabel = "Task Status: Watching now"/);
  assert.match(source, /registeredCommands\.palette\.push\(\{ label: viewLabel, api \}\)/);
  assert.match(source, /\["change", "statuses"\]/);
  assert.match(source, /publicApi\.addEventListener\(type, handler\)/);
  assert.match(source, /publicApi\.removeEventListener\(type, handler\)/);
  assert.match(source, /className: "ts-status-choice-view"/);
  assert.match(source, /Watching now\\u2026/);
  assert.match(source, /statusView\?\.dispose\(\)/);
  assert.match(source, /onChange: \(\) =>/);
});
