import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createBetterTasksStatusRouter } from "../src/better-tasks-bridge.js";
import { createTaskStatusTextHelpers } from "../src/extension.js";
import { buildStatusPillColors } from "../src/status-checkbox.js";
import {
  API_FEATURES,
  clearRenderedIcons,
  createPublicApi,
  emitStatusCatalog,
  emitStatusChange,
  installPublicApi,
  mapPublicResult,
  publicStatusRow,
  uninstallPublicApi,
} from "../src/public-api.js";
import { queryStatusTasks } from "../src/status-view.js";

const WAITING_COLORS = buildStatusPillColors({ baseRgb: { r: 234, g: 179, b: 8 } });
const ACTIVE_COLORS = buildStatusPillColors({ baseRgb: { r: 20, g: 184, b: 166 } });

function catalog() {
  return [
    { key: "ACTIVE", name: "Active", tag: "task-status/Active", glyph: "active", group: "task", inCycle: true },
    { key: "WAITING", name: "Waiting", tag: "task-status/Waiting", glyph: "waiting", group: "task", inCycle: true },
    { key: "WATCHING", name: "Watching", tag: "task-status/Watching", glyph: "watching", group: "media", inCycle: false },
    { key: "IMPORTANT", name: "Important", tag: "task-status/Important", glyph: "important", group: "extra", inCycle: false },
    { key: "CUSTOM_ON_HOLD", name: "On Hold", tag: "task-status/On Hold", glyph: "custom", group: "task", inCycle: true },
  ];
}

function apiWith(overrides = {}) {
  const rows = overrides.catalog || catalog();
  return createPublicApi({
    readCatalog: () => rows,
    readStatuses: () => rows.map((row) => publicStatusRow({
      ...row,
      colors: row.key === "WAITING" ? WAITING_COLORS : ACTIVE_COLORS,
    })),
    createTextHelpers: (options) => createTaskStatusTextHelpers(options),
    setBlockStatus: async () => ({ status: "updated", didWrite: true, reason: "certified" }),
    cycleBlockStatus: async () => ({ status: "updated", didWrite: true, reason: "certified" }),
    ...overrides,
  });
}

test("frozen apiVersion 1 exposes the public methods, frozen features, and no palette command", () => {
  const api = apiWith();
  assert.equal(Object.isFrozen(api), true);
  assert.equal(api.apiVersion, 1);
  assert.equal(Object.isFrozen(api.features), true);
  assert.deepEqual(api.features, API_FEATURES);
  assert.deepEqual(api.features, [
    "statusOfBlock",
    "tasks",
    "counts",
    "renderIcon",
    "aiTools",
  ]);
  assert.deepEqual(Object.keys(api).sort(), [
    "addEventListener",
    "apiVersion",
    "counts",
    "cycle",
    "features",
    "removeEventListener",
    "renderIcon",
    "setStatus",
    "statusOf",
    "statusOfBlock",
    "statuses",
    "tasks",
  ]);
  const source = readFileSync(new URL("../src/public-api.js", import.meta.url), "utf8");
  const extensionSource = readFileSync(new URL("../src/extension.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /addCommand/);
  assert.doesNotMatch(source, /commandPalette/);
  assert.match(extensionSource, /installPublicApi\(instance\.publicApi, \{ win: window \}\)/);
  assert.match(extensionSource, /uninstallPublicApi\(instance\.publicApi, \{ win: window \}\)/);
  assert.match(extensionSource, /window\[GLOBAL_KEY\] === runtime && !lifecycle\.disposed/);
  assert.match(extensionSource, /if \(window\[GLOBAL_KEY\] === runtime\) delete window\[GLOBAL_KEY\]/);
});

test("statuses re-reads settings and returns pill colours from the derivation helper", () => {
  let reads = 0;
  const api = apiWith({
    readStatuses() {
      reads += 1;
      const name = reads === 1 ? "Waiting" : "Blocked";
      return [publicStatusRow({
        key: "WAITING",
        name,
        tag: `task-status/${name}`,
        glyph: "waiting",
        colors: WAITING_COLORS,
      })];
    },
  });
  const first = api.statuses();
  const second = api.statuses();
  assert.equal(reads, 2);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(first[0].name, "Waiting");
  assert.equal(second[0].name, "Blocked");
  assert.equal(second[0].tag, "task-status/Blocked");
  assert.equal(first[0].glyph, "waiting");
  assert.equal(first[0].light.base, WAITING_COLORS.lightBackgroundCss);
  assert.equal(first[0].light.text, WAITING_COLORS.lightTextCss);
  assert.equal(first[0].dark.base, WAITING_COLORS.darkBackgroundCss);
  assert.equal(first[0].dark.text, WAITING_COLORS.darkTextCss);
  assert.notEqual(first[0].light.base, ACTIVE_COLORS.lightBackgroundCss);
});

test("statusOf returns the display name or null", () => {
  const api = apiWith();
  assert.equal(api.statusOf("{{[[TODO]]}} #[[task-status/Waiting]] Keep the rest"), "Waiting");
  assert.equal(api.statusOf("{{[[DONE]]}} #[[task-status/On Hold]] Done text"), "On Hold");
  assert.equal(api.statusOf("{{[[TODO]]}} Keep the rest"), null);
  assert.equal(api.statusOf(""), null);
  assert.equal(api.statusOf(null), null);
});

test("setStatus maps Waiting to WAITING and does not write on a terminal result", async () => {
  const calls = [];
  const api = apiWith({
    setBlockStatus: async (uid, key) => {
      calls.push([uid, key]);
      return {
        status: "unchanged",
        didWrite: false,
        reason: "already-current",
        string: "kept",
        classification: { kind: "ordinary" },
      };
    },
  });
  assert.deepEqual(await api.setStatus("uid-1", "Waiting"), {
    status: "unchanged",
    didWrite: false,
    reason: "already-current",
  });
  assert.deepEqual(calls, [["uid-1", "WAITING"]]);
  assert.deepEqual(await api.setStatus("uid-1", null), {
    status: "unchanged",
    didWrite: false,
    reason: "already-current",
  });
  assert.deepEqual(calls[1], ["uid-1", null]);
  assert.deepEqual(await api.setStatus("uid-1", "On Hold"), {
    status: "unchanged",
    didWrite: false,
    reason: "already-current",
  });
  assert.deepEqual(calls[2], ["uid-1", "CUSTOM_ON_HOLD"]);
});

test("terminal setStatus results are returned once and unknown names do not write", async () => {
  for (const status of ["rejected", "unknown", "conflict", "not-updated", "unchanged"]) {
    const calls = [];
    const api = apiWith({
      setBlockStatus: async (uid, key) => {
        calls.push([uid, key]);
        return { status, didWrite: false, reason: `${status}-reason`, error: new Error("hidden") };
      },
    });
    const result = await api.setStatus("uid-1", "Waiting");
    assert.deepEqual(result, {
      status,
      didWrite: false,
      reason: `${status}-reason`,
    });
    assert.equal(result.error, undefined);
    assert.deepEqual(calls, [["uid-1", "WAITING"]]);
  }

  const calls = [];
  const api = apiWith({
    setBlockStatus: async () => {
      calls.push("write");
      return { status: "updated", didWrite: true };
    },
  });
  assert.deepEqual(await api.setStatus("uid-1", "Missing"), {
    status: "rejected",
    didWrite: false,
    reason: "unknown-status",
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(mapPublicResult(undefined), {
    status: "unknown",
    didWrite: false,
    reason: "unmapped-result",
  });
});

test("a Better Tasks-owned child is rejected and the writer is not called", async () => {
  const writerCalls = [];
  const requestCalls = [];
  const router = createBetterTasksStatusRouter({
    windowLike: {
      betterTasks: {
        v2: {
          classifyBlock: async () => ({ kind: "task-owned", ownerTaskUid: "parent" }),
          requestStatusTag: async (...args) => {
            requestCalls.push(args);
            return { status: "updated", didWrite: true };
          },
        },
      },
    },
    directWriter: {
      apply: async (args) => {
        writerCalls.push(args);
        return { status: "updated", didWrite: true };
      },
    },
  });
  let writes = 0;
  const api = apiWith({
    setBlockStatus: async (uid, statusKey) => {
      writes += 1;
      assert.equal(statusKey, "WAITING");
      return router.apply({
        uid,
        expectedString: "{{[[TODO]]}} child",
        nextString: "{{[[TODO]]}} #[[task-status/Waiting]] child",
        statusTagTitle: "task-status/Waiting",
      });
    },
  });
  assert.deepEqual(await api.setStatus("child", "Waiting"), {
    status: "rejected",
    didWrite: false,
    reason: "better-tasks-owned-child",
  });
  assert.equal(writes, 1);
  assert.equal(writerCalls.length, 0);
  assert.equal(requestCalls.length, 0);
});

test("a Better Tasks task is routed through requestStatusTag and the direct writer is not called", async () => {
  const writerCalls = [];
  const requestCalls = [];
  const router = createBetterTasksStatusRouter({
    windowLike: {
      betterTasks: {
        v2: {
          classifyBlock: async () => ({ kind: "task", uid: "task-uid" }),
          requestStatusTag: async (...args) => {
            requestCalls.push(args);
            return { status: "updated", didWrite: true };
          },
        },
      },
    },
    directWriter: {
      apply: async (args) => {
        writerCalls.push(args);
        return { status: "updated", didWrite: true };
      },
    },
  });
  const api = apiWith({
    setBlockStatus: async (uid, statusKey) => {
      assert.equal(statusKey, "WAITING");
      return router.apply({
        uid,
        expectedString: "{{[[TODO]]}} Send SOP",
        nextString: "{{[[TODO]]}} #[[task-status/Waiting]] Send SOP",
        statusTagTitle: "task-status/Waiting",
      });
    },
  });
  assert.deepEqual(await api.setStatus("task-uid", "Waiting"), {
    status: "updated",
    didWrite: true,
  });
  assert.equal(writerCalls.length, 0);
  assert.deepEqual(requestCalls, [[
    "task-uid",
    {
      expectedString: "{{[[TODO]]}} Send SOP",
      statusTagTitle: "task-status/Waiting",
      source: "task-status-tags",
    },
  ]]);
});

test("cycle on a DONE block returns an object when the writer returns nothing", async () => {
  let writes = 0;
  const api = apiWith({
    setBlockStatus: async () => {
      writes += 1;
      return { status: "updated", didWrite: true };
    },
    cycleBlockStatus: async () => undefined,
  });
  const result = await api.cycle("done-uid");
  assert.equal(typeof result, "object");
  assert.notEqual(result, null);
  assert.deepEqual(result, {
    status: "unchanged",
    didWrite: false,
    reason: "done-task",
  });
  assert.equal(writes, 0);
});

test("change and statuses listeners can be removed and a throwing listener is isolated", async () => {
  const seen = [];
  const api = apiWith({
    setBlockStatus: async () => ({ status: "updated", didWrite: true, reason: "certified" }),
  });
  const onChange = (detail) => seen.push(["change", detail.name]);
  const onStatuses = (detail) => seen.push(["statuses", detail.apiVersion]);
  api.addEventListener("change", onChange);
  api.addEventListener("change", () => { throw new Error("listener failed"); });
  api.addEventListener("statuses", onStatuses);
  api.addEventListener("other", () => seen.push("ignored"));
  const updated = await api.setStatus("uid-1", "Waiting");
  assert.equal(updated.status, "updated");
  assert.equal(updated.didWrite, true);
  emitStatusCatalog(api, { apiVersion: 1 });
  emitStatusChange(api, { apiVersion: 1, uid: "direct", name: "Active", status: "updated" });
  api.removeEventListener("change", onChange);
  api.removeEventListener("statuses", onStatuses);
  await api.setStatus("uid-1", "Active");
  emitStatusCatalog(api, { apiVersion: 1 });
  assert.deepEqual(seen, [
    ["change", "Waiting"],
    ["statuses", 1],
    ["change", "Active"],
  ]);
});

test("ready fires on install and unload deletes the global only while it is still this object", () => {
  const events = [];
  const win = new EventTarget();
  win.addEventListener("roam-task-status-tags:ready", (event) => {
    events.push([event.type, event.detail.apiVersion]);
  });
  win.addEventListener("roam-task-status-tags:unload", (event) => {
    events.push([event.type, event.detail.apiVersion, win.RoamTaskStatusTags == null]);
  });
  const api = apiWith();
  const other = apiWith();
  installPublicApi(api, { win });
  assert.equal(win.RoamTaskStatusTags, api);
  assert.equal(Object.isFrozen(win.RoamTaskStatusTags), true);
  win.RoamTaskStatusTags = other;
  assert.equal(uninstallPublicApi(api, { win }), false);
  assert.equal(win.RoamTaskStatusTags, other);
  assert.equal(uninstallPublicApi(other, { win }), true);
  assert.equal(win.RoamTaskStatusTags, undefined);
  assert.deepEqual(events, [
    ["roam-task-status-tags:ready", 1],
    ["roam-task-status-tags:unload", 1, false],
    ["roam-task-status-tags:unload", 1, true],
  ]);
});

class FakeClassList {
  constructor(owner) { this.owner = owner; }
  values() { return new Set(String(this.owner.className || "").split(/\s+/).filter(Boolean)); }
  contains(value) { return this.values().has(value); }
  toggle(value, force) {
    const values = this.values();
    const next = typeof force === "boolean" ? force : !values.has(value);
    if (next) values.add(value); else values.delete(value);
    this.owner.className = [...values].join(" ");
    return next;
  }
  add(...items) {
    const values = this.values();
    items.forEach((item) => values.add(item));
    this.owner.className = [...values].join(" ");
  }
  remove(...items) {
    const values = this.values();
    items.forEach((item) => values.delete(item));
    this.owner.className = [...values].join(" ");
  }
}

class FakeElement extends EventTarget {
  constructor(tagName = "div") {
    super();
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.className = "";
    this.classList = new FakeClassList(this);
    this.isConnected = false;
    this.textContent = "";
    this.id = "";
    this.style = { color: "", setProperty() {}, removeProperty() {} };
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      node.isConnected = true;
      this.children.push(node);
    }
  }
  appendChild(node) { this.append(node); return node; }
  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    }
    this.parentNode = null;
    this.isConnected = false;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  matches() { return false; }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  closest() { return null; }
}

class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.body = new FakeElement("body");
    this.head = new FakeElement("head");
    this.documentElement = new FakeElement("html");
    this.body.isConnected = true;
    this.head.isConnected = true;
    this.documentElement.isConnected = true;
    this.activeElement = null;
  }
  createElement(name) { return new FakeElement(name); }
  createElementNS(_namespace, name) { return new FakeElement(name); }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  getElementById() { return null; }
}

function commandApi(active) {
  return {
    addCommand: async ({ label }) => { active.add(label); },
    removeCommand: async ({ label }) => { active.delete(label); },
  };
}

function cssToRgb(value) {
  const text = String(value || "").trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  }
  if (/^rgba?\(/i.test(text)) return text;
  return "";
}

function walkNodes(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const child of node.children || []) walkNodes(child, visit);
}

const PLAIN_TODO = "{{[[TODO]]}} Call  Bob — #[[note]] exact.";
const TODO_REST = "Call  Bob — #[[note]] exact.";
const PILL_SURFACES = {
  lightSurfaceRgb: { r: 245, g: 248, b: 250 },
  darkSurfaceRgb: { r: 32, g: 43, b: 51 },
};

test("installed api exposes fourteen default rows, writes a plain TODO, routes Better Tasks, and fires statuses", async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalMutationObserver = globalThis.MutationObserver;
  const document = new FakeDocument();
  const activeCommands = new Set();
  const blocks = new Map([
    ["abcdefgh1", PLAIN_TODO],
    ["log000001", "**Activity log**"],
    ["evt000001", "2026-10-04 15:20 \u2014 Created"],
  ]);
  // Better Tasks' activity log: a `**Activity log**` child under the task,
  // one event block per change under that container.
  const children = new Map([
    ["abcdefgh1", ["log000001"]],
    ["log000001", ["evt000001"]],
  ]);
  const props = new Map();
  let blockUpdates = 0;
  let propsUpdates = 0;
  let createdProps = 0;
  let blockCreates = 0;
  let pageUpdates = 0;
  const statusRequests = [];
  let panelConfig = null;
  const settingsStore = new Map();
  const palette = commandApi(activeCommands);
  const slash = commandApi(activeCommands);
  const context = commandApi(activeCommands);
  const multi = commandApi(activeCommands);
  const events = [];
  const windowLike = new EventTarget();
  Object.assign(windowLike, {
    document,
    CSS: { supports: () => true },
    React: {
      createElement: () => null,
      useEffect: () => {},
      useMemo: (fn) => fn(),
      useRef: (value) => ({ current: value }),
      useState: (value) => [typeof value === "function" ? value() : value, () => {}],
    },
    getComputedStyle: (element) => ({
      color: cssToRgb(element?.style?.color),
      backgroundColor: cssToRgb(element?.style?.backgroundColor),
      getPropertyValue: () => "",
    }),
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    innerWidth: 1280,
    innerHeight: 800,
    roamAlphaAPI: {
      data: {
        pull: () => {
          const string = blocks.get("abcdefgh1");
          return string == null ? null : { ":block/string": string };
        },
        async: {
          pull: async (_pattern, entity) => {
            const uid = entity?.[1];
            const string = blocks.get(uid);
            if (typeof string !== "string") return null;
            const kids = (children.get(uid) || []).map((childUid, index) => ({
              ":block/uid": childUid,
              ":block/string": blocks.get(childUid),
              ":block/order": index,
            }));
            return { ":block/uid": uid, ":block/string": string, ":block/children": kids };
          },
        },
        block: {
          update: async ({ block }) => {
            if (typeof block.string === "string") {
              blockUpdates += 1;
              blocks.set(block.uid, block.string);
            }
            if (block.props) {
              propsUpdates += 1;
              props.set(block.uid, block.props);
            }
          },
          create: async ({ location, block }) => {
            blockCreates += 1;
            blocks.set(block.uid, block.string);
            if (block.props) {
              createdProps += 1;
              props.set(block.uid, block.props);
            }
            children.set(location["parent-uid"], [...(children.get(location["parent-uid"]) || []), block.uid]);
          },
        },
        page: { update: async () => { pageUpdates += 1; } },
      },
      util: { generateUID: () => `gen${String(blockCreates + 1).padStart(6, "0")}` },
      ui: {
        commandPalette: palette,
        slashCommand: {
          addCommand: () => assert.fail("slash commands must use the extension-scoped API"),
          removeCommand: () => assert.fail("slash commands must use the extension-scoped API"),
        },
        blockContextMenu: context,
        msContextMenu: multi,
      },
      q: () => null,
    },
  });
  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }
  globalThis.window = windowLike;
  globalThis.document = document;
  globalThis.MutationObserver = FakeMutationObserver;
  windowLike.addEventListener("roam-task-status-tags:ready", (event) => {
    events.push([event.type, event.detail.apiVersion]);
  });
  windowLike.addEventListener("roam-task-status-tags:unload", (event) => {
    events.push([event.type, event.detail.apiVersion]);
  });

  const extensionAPI = {
    settings: {
      get: (key) => (settingsStore.has(key) ? settingsStore.get(key) : null),
      set: async (key, value) => { settingsStore.set(key, value); },
      panel: { create: async (config) => { panelConfig = config; } },
    },
    ui: { commandPalette: palette, slashCommand: slash },
  };

  try {
    const extension = await import(`../src/extension.js?public-api=${Date.now()}`);
    await extension.onload({ extensionAPI, extension: { version: "0.7.0" } });
    const api = windowLike.RoamTaskStatusTags;
    assert.equal(Object.isFrozen(api), true);
    assert.equal(api.apiVersion, 1);
    assert.ok(windowLike.__svyk_roamTaskStatusTags);
    const rows = api.statuses();
    assert.deepEqual(rows.map((row) => row.key), [
      "ACTIVE",
      "WAITING",
      "IN_REVIEW",
      "HOLDING",
      "INCUBATING",
      "ALERT",
      "CANCELLED",
      "SERIES",
      "MOVIE",
      "WATCHING",
      "WATCHLIST",
      "UPCOMING",
      "REWATCH",
      "DROPPED",
    ]);
    const inReviewColors = buildStatusPillColors({
      baseRgb: { r: 14, g: 165, b: 233 },
      ...PILL_SURFACES,
    });
    const activeColors = buildStatusPillColors({
      baseRgb: { r: 20, g: 184, b: 166 },
      ...PILL_SURFACES,
    });
    for (const row of rows) {
      assert.equal(typeof row.glyph, "string");
      assert.equal(row.glyph.length > 0, true);
      assert.equal(Object.isFrozen(row.light), true);
      assert.equal(Object.isFrozen(row.dark), true);
      assert.equal(row.light.base.length > 0, true);
      assert.equal(row.light.text.length > 0, true);
      assert.equal(row.dark.base.length > 0, true);
      assert.equal(row.dark.text.length > 0, true);
    }
    const inReview = rows.find((row) => row.key === "IN_REVIEW");
    assert.equal(inReview.name, "In Review");
    assert.equal(inReview.tag, "task-status/In Review");
    assert.equal(inReview.glyph, "in-review");
    assert.equal(inReview.group, "task");
    assert.equal(inReview.inCycle, true);
    assert.equal(inReview.light.base, inReviewColors.lightBackgroundCss);
    assert.equal(inReview.light.text, inReviewColors.lightTextCss);
    assert.equal(inReview.dark.base, inReviewColors.darkBackgroundCss);
    assert.equal(inReview.dark.text, inReviewColors.darkTextCss);
    assert.notEqual(inReview.light.base, activeColors.lightBackgroundCss);
    assert.equal(rows.find((row) => row.key === "WAITING").glyph, "waiting");
    for (const glyph of ["series", "movie", "watching", "watchlist", "upcoming", "rewatch", "dropped"]) {
      const mediaRow = rows.find((row) => row.key === glyph.toUpperCase());
      assert.equal(mediaRow.glyph, glyph);
      assert.equal(mediaRow.group, "media");
      assert.equal(mediaRow.inCycle, false);
    }

    const iconHost = document.createElement("span");
    const keepSibling = document.createElement("em");
    iconHost.appendChild(keepSibling);
    const stopIcon = api.renderIcon(iconHost, "Waiting");
    assert.equal(iconHost.children.length, 2);
    assert.equal(iconHost.children[1].getAttribute("data-ts-rendered-icon"), "true");
    // Leave one live icon mounted to verify unload removes it too.
    const liveHost = document.createElement("span");
    api.renderIcon(liveHost, "Active");
    assert.equal(liveHost.children.length, 1);
    stopIcon();
    assert.deepEqual(iconHost.children, [keepSibling]);
    assert.equal(
      api.statusOf("{{[[TODO]]}} #[[task-status/In Review]] Send SOP"),
      "In Review"
    );

    settingsStore.set("status-list", [
      { key: "ACTIVE", name: "Active" },
      { key: "WAITING", name: "Blocked" },
      { key: "IN_REVIEW", name: "In Review" },
      { key: "HOLDING", name: "Holding" },
      { key: "INCUBATING", name: "Incubating" },
      { key: "ALERT", name: "Alert" },
      { key: "CANCELLED", name: "Cancelled" },
      { key: "CUSTOM_SERIES", name: "series" },
      { key: "CUSTOM_TV", name: "Watchlist" },
    ]);
    const renamed = api.statuses();
    assert.equal(renamed.length, 9);
    assert.equal(renamed.find((row) => row.key === "CUSTOM_SERIES").glyph, "series");
    assert.equal(renamed.find((row) => row.key === "CUSTOM_TV").glyph, "watchlist");
    assert.equal(renamed.find((row) => row.key === "WAITING").name, "Blocked");
    assert.equal(renamed.find((row) => row.key === "IN_REVIEW").glyph, "in-review");
    assert.equal(api.statusOf("{{[[TODO]]}} #[[task-status/Blocked]] Keep the rest"), "Blocked");
    settingsStore.set("status-list", rows.map((row) => ({ key: row.key, name: row.name })));

    const changes = [];
    const onChange = (detail) => changes.push(detail);
    api.addEventListener("change", onChange);
    const reviewed = await api.setStatus("abcdefgh1", "In Review");
    assert.equal(reviewed.status, "updated");
    assert.equal(reviewed.didWrite, true);
    assert.equal(blocks.get("abcdefgh1"), `{{[[TODO]]}} #[[task-status/In Review]] ${TODO_REST}`);
    assert.equal(blockUpdates, 1);
    assert.equal(pageUpdates, 0);

    const written = await api.setStatus("abcdefgh1", "Waiting");
    assert.equal(written.status, "updated");
    assert.equal(written.didWrite, true);
    assert.equal(blocks.get("abcdefgh1"), `{{[[TODO]]}} #[[task-status/Waiting]] ${TODO_REST}`);
    assert.equal(blockUpdates, 2);
    assert.deepEqual(changes.map((detail) => detail.name), ["In Review", "Waiting"]);

    const cleared = await api.setStatus("abcdefgh1", null);
    assert.equal(cleared.status, "updated");
    assert.equal(cleared.didWrite, true);
    assert.equal(blocks.get("abcdefgh1"), PLAIN_TODO);
    assert.equal(blockUpdates, 3);
    assert.equal(changes.at(-1).name, null);

    blocks.set("abcdefgh1", PLAIN_TODO);
    let classification = { kind: "task", uid: "abcdefgh1" };
    windowLike.betterTasks = {
      v2: {
        classifyBlock: async () => classification,
        requestStatusTag: async (uid, request) => {
          statusRequests.push({ uid, request });
          const current = blocks.get(uid);
          const token = "{{[[TODO]]}}";
          if (typeof current === "string" && current.startsWith(token) && request.statusTagTitle) {
            blocks.set(uid, `${token} #[[${request.statusTagTitle}]]${current.slice(token.length)}`);
          }
          return { status: "updated", didWrite: true };
        },
      },
    };
    const updatesBeforeRoute = blockUpdates;
    const routed = await api.setStatus("abcdefgh1", "Waiting");
    assert.deepEqual(routed, {
      status: "updated",
      didWrite: true,
      activity: { recorded: true, reason: "recorded" },
    });
    assert.equal(blockUpdates, updatesBeforeRoute, "task string is written by Better Tasks only");
    assert.equal(pageUpdates, 0);
    assert.equal(blockCreates, 1, "exactly one activity-log line");
    assert.deepEqual(children.get("abcdefgh1"), ["log000001"], "no new task children");
    assert.deepEqual(children.get("log000001"), ["evt000001", "gen000001"]);
    assert.match(blocks.get("gen000001"), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} \u2014 status \u2192 Waiting$/);
    assert.equal(createdProps, 1, "props ride on the single create");
    assert.equal(propsUpdates, 0, "no follow-up props update");
    const eventProps = props.get("gen000001").bt;
    assert.equal(eventProps.kind, "event");
    assert.equal(eventProps.event, "attr_change");
    assert.equal(eventProps.field, "status");
    assert.equal(eventProps.to, "Waiting");
    assert.equal(eventProps.source, "task-status-tags");
    assert.deepEqual(statusRequests, [{
      uid: "abcdefgh1",
      request: {
        expectedString: PLAIN_TODO,
        statusTagTitle: "task-status/Waiting",
        source: "task-status-tags",
      },
    }]);
    assert.equal(blocks.get("abcdefgh1"), `{{[[TODO]]}} #[[task-status/Waiting]] ${TODO_REST}`);

    classification = { kind: "task-owned", ownerTaskUid: "parent" };
    blocks.set("abcdefgh1", PLAIN_TODO);
    const owned = await api.setStatus("abcdefgh1", "Waiting");
    assert.deepEqual(owned, {
      status: "rejected",
      didWrite: false,
      reason: "better-tasks-owned-child",
    });
    assert.equal(blockUpdates, updatesBeforeRoute);
    assert.equal(statusRequests.length, 1);
    assert.equal(blockCreates, 1, "a refused write records no activity");
    assert.equal(blocks.get("abcdefgh1"), PLAIN_TODO);
    delete windowLike.betterTasks;

    blocks.set("abcdefgh1", `{{[[DONE]]}} #[[task-status/Waiting]] ${TODO_REST}`);
    const updatesBeforeCycle = blockUpdates;
    const cycled = await api.cycle("abcdefgh1");
    assert.equal(typeof cycled, "object");
    assert.notEqual(cycled, null);
    assert.deepEqual(cycled, {
      status: "unchanged",
      didWrite: false,
      reason: "done-task",
    });
    assert.equal(blockUpdates, updatesBeforeCycle);
    assert.equal(blocks.get("abcdefgh1"), `{{[[DONE]]}} #[[task-status/Waiting]] ${TODO_REST}`);
    api.removeEventListener("change", onChange);

    const statusesEvents = [];
    const onStatuses = (detail) => statusesEvents.push(detail);
    api.addEventListener("statuses", onStatuses);
    const react = windowLike.React;
    const previousCreate = react.createElement;
    react.createElement = (type, props, ...children) => ({ type, props: props || {}, children });
    let tree;
    try {
      const panel = panelConfig.settings.find((entry) => entry.id === "task-status-status-names");
      tree = panel.action.component();
    } finally {
      react.createElement = previousCreate;
    }
    const drops = [];
    walkNodes(tree, (node) => {
      const className = String(node.props?.className || "");
      if (typeof node.props?.onDrop === "function" && className.includes("ts-status-edit-row")) {
        drops.push(node.props.onDrop);
      }
    });
    assert.equal(drops.length, rows.length);
    drops[0]({
      preventDefault() {},
      dataTransfer: { getData: () => "IN_REVIEW" },
    });
    for (let attempt = 0; attempt < 30 && statusesEvents.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.equal(statusesEvents.length, 1);
    assert.equal(statusesEvents[0].apiVersion, 1);
    assert.equal(api.statuses()[0].key, "IN_REVIEW");
    assert.equal(api.statuses()[0].name, "In Review");
    assert.equal(api.statuses()[0].glyph, "in-review");
    api.removeEventListener("statuses", onStatuses);

    const replaced = { apiVersion: 1 };
    windowLike.RoamTaskStatusTags = replaced;
    await extension.onunload();
    assert.equal(liveHost.children.length, 0, "unload must remove all live rendered icons");
    assert.equal(windowLike.RoamTaskStatusTags, replaced);
    assert.equal(windowLike.__svyk_roamTaskStatusTags, undefined);
    delete windowLike.RoamTaskStatusTags;
    assert.deepEqual(events, [
      ["roam-task-status-tags:ready", 1],
      ["roam-task-status-tags:unload", 1],
    ]);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.MutationObserver = originalMutationObserver;
  }
});

test("setStatus surfaces the Better Tasks activity receipt only on updated results", () => {
  assert.deepEqual(
    mapPublicResult({ status: "updated", didWrite: true, reason: "certified", activity: { recorded: true, reason: "recorded", entryUid: "x", error: null } }),
    { status: "updated", didWrite: true, reason: "certified", activity: { recorded: true, reason: "recorded" } }
  );
  assert.deepEqual(
    mapPublicResult({ status: "updated", didWrite: true, reason: "certified", activity: { recorded: false, reason: "no-activity-log" } }),
    { status: "updated", didWrite: true, reason: "certified", activity: { recorded: false, reason: "no-activity-log" } }
  );
  assert.deepEqual(
    mapPublicResult({ status: "updated", didWrite: true, reason: "certified" }),
    { status: "updated", didWrite: true, reason: "certified" }
  );
  assert.deepEqual(
    mapPublicResult({ status: "unchanged", didWrite: false, reason: "already-current", activity: { recorded: true } }),
    { status: "unchanged", didWrite: false, reason: "already-current" }
  );
});

test("statuses() rows carry group and inCycle for task, media, and extra groups", () => {
  const api = apiWith();
  const rows = api.statuses();
  assert.deepEqual(
    rows.map(({ name, group, inCycle }) => ({ name, group, inCycle })),
    [
      { name: "Active", group: "task", inCycle: true },
      { name: "Waiting", group: "task", inCycle: true },
      { name: "Watching", group: "media", inCycle: false },
      { name: "Important", group: "extra", inCycle: false },
      { name: "On Hold", group: "task", inCycle: true },
    ]
  );
});

test("statusOfBlock distinguishes managed tasks from mid-line TODOs and never throws", async () => {
  const blocks = new Map([
    ["t1", "{{[[TODO]]}} #[[task-status/Waiting]] Call lab"],
    ["t2", "{{[[DONE]]}} #[[task-status/Active]] Shipped"],
    ["t3", "{{[[TODO]]}} Plain todo"],
    ["p1", "Plain paragraph"],
    ["p2", "Notes about [[TODO]] and #[[task-status/Waiting]]"],
    ["p3", "Notes about {{[[TODO]]}} mid-line"],
  ]);
  const api = apiWith({
    readBlockString: async (uid) => {
      if (uid === "boom") throw new Error("graph offline");
      return blocks.has(uid) ? blocks.get(uid) : null;
    },
  });

  assert.deepEqual(await api.statusOfBlock("t1"), {
    found: true,
    isTask: true,
    done: false,
    status: "Waiting",
  });
  assert.deepEqual(await api.statusOfBlock("t2"), {
    found: true,
    isTask: true,
    done: true,
    status: "Active",
  });
  assert.deepEqual(await api.statusOfBlock("t3"), {
    found: true,
    isTask: true,
    done: false,
    status: null,
  });
  assert.deepEqual(await api.statusOfBlock("p1"), {
    found: true,
    isTask: false,
    done: false,
    status: null,
  });
  assert.deepEqual(await api.statusOfBlock("p2"), {
    found: true,
    isTask: false,
    done: false,
    status: null,
  });
  assert.deepEqual(await api.statusOfBlock("p3"), {
    found: true,
    isTask: false,
    done: false,
    status: null,
  });
  assert.deepEqual(await api.statusOfBlock("missing"), {
    found: false,
    isTask: false,
    done: false,
    status: null,
  });
  assert.deepEqual(await api.statusOfBlock("boom"), {
    found: false,
    isTask: false,
    done: false,
    status: null,
  });
  assert.deepEqual(await api.statusOfBlock(""), {
    found: false,
    isTask: false,
    done: false,
    status: null,
  });
});

test("tasks() filters by name or key, strips prefix, drops prose mentions, clamps limit, and rejects unknown names", async () => {
  const datalogRows = [
    ["u1", "{{[[TODO]]}} #[[task-status/Waiting]] Call lab", "task-status/Waiting", 300, "Work"],
    ["u2", "{{[[DONE]]}} #[[task-status/Waiting]] Old item", "task-status/Waiting", 400, "Archive"],
    ["u3", "{{[[TODO]]}} #[[task-status/Active]] Ship fix", "task-status/Active", 250, "Sprint"],
    ["u4", "{{[[TODO]]}} Talk about #[[task-status/Waiting]] later", "task-status/Waiting", 500, "Notes"],
    ["u5", "Plain note #[[task-status/Waiting]]", "task-status/Waiting", 600, "Notes"],
    ["u6", "{{[[TODO]]}} #[[task-status/On Hold]] Wait on spec", "task-status/On Hold", 200, "Specs"],
  ];
  const roamAlphaAPI = {
    data: {
      async: {
        q: async (_query, titles) => {
          const wanted = new Set(titles);
          return datalogRows.filter((row) => wanted.has(row[2]));
        },
      },
    },
  };
  const api = apiWith({
    queryTasks: ({ statuses, helpers, includeDone }) =>
      queryStatusTasks({ roamAlphaAPI, statuses, helpers, includeDone, includeEpisodes: false }),
  });

  // By display name
  assert.deepEqual(await api.tasks({ status: "Waiting" }), {
    tasks: [{ uid: "u1", text: "Call lab", status: "Waiting", done: false, page: "Work" }],
    truncated: false,
  });

  // By status key with includeDone
  assert.deepEqual(await api.tasks({ status: "WAITING", includeDone: true }), {
    tasks: [
      { uid: "u2", text: "Old item", status: "Waiting", done: true, page: "Archive" },
      { uid: "u1", text: "Call lab", status: "Waiting", done: false, page: "Work" },
    ],
    truncated: false,
  });

  // Omitted status returns all tasks with any configured status, respecting limit & truncated
  assert.deepEqual(await api.tasks({ limit: 2 }), {
    tasks: [
      { uid: "u1", text: "Call lab", status: "Waiting", done: false, page: "Work" },
      { uid: "u3", text: "Ship fix", status: "Active", done: false, page: "Sprint" },
    ],
    truncated: true,
  });

  // Limit clamp: 0 clamps to 1
  const clampedLow = await api.tasks({ limit: 0 });
  assert.equal(clampedLow.tasks.length, 1);
  assert.equal(clampedLow.truncated, true);

  // Limit clamp: above 200 clamps to 200
  const manyRows = Array.from({ length: 205 }, (_, i) => [
    `id-${String(i).padStart(3, "0")}`,
    `{{[[TODO]]}} #[[task-status/Active]] Item ${i}`,
    "task-status/Active",
    1000 - i,
    "BigPage",
  ]);
  const bigApi = apiWith({
    queryTasks: ({ statuses, helpers, includeDone }) =>
      queryStatusTasks({
        roamAlphaAPI: { data: { async: { q: async () => manyRows } } },
        statuses,
        helpers,
        includeDone,
        includeEpisodes: false,
      }),
  });
  const clampedHigh = await bigApi.tasks({ status: "Active", limit: 999 });
  assert.equal(clampedHigh.tasks.length, 200);
  assert.equal(clampedHigh.truncated, true);

  // Unknown name and null both reject with an error listing valid status names
  await assert.rejects(
    () => api.tasks({ status: "Nope" }),
    (err) => {
      assert.match(err.message, /Nope/);
      assert.match(err.message, /Active/);
      assert.match(err.message, /Waiting/);
      assert.match(err.message, /On Hold/);
      return true;
    }
  );
  await assert.rejects(
    () => api.tasks({ status: null }),
    (err) => /Valid statuses:/.test(err.message)
  );
});

test("counts() returns every configured status including zeros and respects includeDone", async () => {
  const datalogRows = [
    ["u1", "{{[[TODO]]}} #[[task-status/Waiting]] One", "task-status/Waiting", 300, "Work"],
    ["u2", "{{[[DONE]]}} #[[task-status/Waiting]] Two", "task-status/Waiting", 400, "Work"],
    ["u3", "{{[[TODO]]}} #[[task-status/Active]] Three", "task-status/Active", 250, "Work"],
    ["u4", "Prose mention #[[task-status/Important]]", "task-status/Important", 100, "Notes"],
  ];
  const roamAlphaAPI = {
    data: {
      async: {
        q: async (_query, titles) => {
          const wanted = new Set(titles);
          return datalogRows.filter((row) => wanted.has(row[2]));
        },
      },
    },
  };
  const api = apiWith({
    queryTasks: ({ statuses, helpers, includeDone }) =>
      queryStatusTasks({ roamAlphaAPI, statuses, helpers, includeDone, includeEpisodes: false }),
  });

  assert.deepEqual(await api.counts(), {
    counts: {
      Active: 1,
      Waiting: 1,
      Watching: 0,
      Important: 0,
      "On Hold": 0,
    },
    total: 2,
  });

  assert.deepEqual(await api.counts({ includeDone: true }), {
    counts: {
      Active: 1,
      Waiting: 2,
      Watching: 0,
      Important: 0,
      "On Hold": 0,
    },
    total: 3,
  });
});

test("renderIcon appends owned preview markup, cleans up exactly what was added, ignores bad inputs, and clears on dispose", () => {
  const doc = new FakeDocument();
  const api = apiWith({ documentLike: doc });

  // Non-element and unknown name are no-ops
  assert.equal(typeof api.renderIcon(null, "Waiting"), "function");
  assert.equal(typeof api.renderIcon({ nodeType: 3, tagName: "#text", appendChild() {} }, "Waiting"), "function");
  const untouched = doc.createElement("div");
  const noopCleanup = api.renderIcon(untouched, "DoesNotExist");
  assert.equal(untouched.children.length, 0);
  noopCleanup();

  // Valid element + status name
  const host = doc.createElement("div");
  const existing = doc.createElement("span");
  host.appendChild(existing);
  const cleanup = api.renderIcon(host, "Waiting");
  assert.equal(host.children.length, 2);
  const wrap = host.children[1];
  assert.equal(wrap.className, "ts-rendered-icon");
  assert.equal(wrap.getAttribute("data-ts-rendered-icon"), "true");
  assert.equal(wrap.getAttribute("data-task-status-key"), "WAITING");
  const box = wrap.children[0];
  assert.equal(box.className, "rm-checkbox rm-todo");
  assert.equal(box.getAttribute("data-ts-checkbox-status"), "WAITING");
  assert.equal(box.getAttribute("data-ts-checkbox-shape"), "waiting");

  // Cleanup removes only what was added and is idempotent
  cleanup();
  assert.deepEqual(host.children, [existing]);
  cleanup();
  assert.deepEqual(host.children, [existing]);

  // clearRenderedIcons removes all tracked live icons
  const host2 = doc.createElement("div");
  api.renderIcon(host2, "Important");
  assert.equal(host2.children.length, 1);
  clearRenderedIcons(api);
  assert.equal(host2.children.length, 0);
});
