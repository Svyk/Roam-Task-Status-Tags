import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AI_TOOL_NAMES,
  TAG_FORMAT,
  createAiTools,
  createAiToolsManager,
  normalizeBlockUid,
  registerAiTools,
} from "../src/ai-tools.js";
import { createTaskStatusTextHelpers } from "../src/extension.js";
import {
  createPublicApi,
  emitStatusCatalog,
  publicStatusRow,
} from "../src/public-api.js";
import { buildStatusPillColors } from "../src/status-checkbox.js";
import { queryStatusTasks } from "../src/status-view.js";

const ACTIVE_COLORS = buildStatusPillColors({ baseRgb: { r: 20, g: 184, b: 166 } });

function makeCatalog() {
  return [
    { key: "ACTIVE", name: "Active", tag: "task-status/Active", glyph: "active", group: "task", inCycle: true },
    { key: "WAITING", name: "Waiting", tag: "task-status/Waiting", glyph: "waiting", group: "task", inCycle: true },
    { key: "WATCHING", name: "Watching", tag: "task-status/Watching", glyph: "watching", group: "media", inCycle: false },
    { key: "IMPORTANT", name: "Important", tag: "task-status/Important", glyph: "important", group: "extra", inCycle: false },
  ];
}

function makeApi(overrides = {}) {
  let rows = overrides.catalog ? overrides.catalog.slice() : makeCatalog();
  const blocks = overrides.blocks || new Map([
    ["u1", "{{[[TODO]]}} #[[task-status/Waiting]] Call lab"],
    ["u2", "{{[[DONE]]}} #[[task-status/Active]] Shipped"],
    ["p1", "Just a note"],
  ]);
  const datalogRows = overrides.datalogRows || [
    ["u1", "{{[[TODO]]}} #[[task-status/Waiting]] Call lab", "task-status/Waiting", 300, "Work"],
    ["u2", "{{[[DONE]]}} #[[task-status/Active]] Shipped", "task-status/Active", 200, "Archive"],
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
  const api = createPublicApi({
    readCatalog: () => rows,
    readStatuses: () => rows.map((row) => publicStatusRow({ ...row, colors: ACTIVE_COLORS })),
    createTextHelpers: (options) => createTaskStatusTextHelpers(options),
    setBlockStatus: async () => ({ status: "updated", didWrite: true, reason: "certified" }),
    cycleBlockStatus: async () => ({ status: "updated", didWrite: true, reason: "certified" }),
    readBlockString: async (uid) => (blocks.has(uid) ? blocks.get(uid) : null),
    queryTasks: ({ statuses, helpers, includeDone }) =>
      queryStatusTasks({ roamAlphaAPI, statuses, helpers, includeDone, includeEpisodes: false }),
    ...overrides,
  });
  return {
    api,
    setCatalog(next) {
      rows = next.slice();
    },
  };
}

test("all five tools satisfy addTool rules, schema bounds, descriptions, and have no direct write path", () => {
  const { api } = makeApi();
  const tools = createAiTools({
    api,
    setStatusForAgent: async () => ({ status: "updated", didWrite: true }),
  });

  assert.deepEqual(tools.map((t) => t.name), AI_TOOL_NAMES);

  const expectedScopes = {
    list_statuses: "read",
    get_task_status: "read",
    list_tasks: "read",
    status_counts: "read",
    set_task_status: "edit",
  };

  for (const tool of tools) {
    assert.match(tool.name, /^[A-Za-z0-9_-]{1,64}$/, `invalid name: ${tool.name}`);
    assert.equal(tool.scope, expectedScopes[tool.name], `scope for ${tool.name}`);
    assert.equal(typeof tool.description, "string");
    assert.ok(tool.description.length > 0 && tool.description.length < 600, `${tool.name} description length`);
    assert.equal(tool.description.includes("\u2014"), false, `${tool.name} description must not contain em dash`);
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
    const serialized = JSON.stringify(tool.inputSchema);
    assert.ok(serialized.length < 4000, `${tool.name} schema length ${serialized.length}`);
    assert.equal(typeof tool.handler, "function");
  }

  const setTool = tools.find((t) => t.name === "set_task_status");
  assert.match(setTool.description, /instead of editing/i);
  assert.match(setTool.description, /safe way/i);
  assert.match(setTool.description, /Better Tasks/);
  assert.match(setTool.description, /activity log/i);

  const source = readFileSync(new URL("../src/ai-tools.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /roamAlphaAPI|updateBlock|block\.update/);
});

test("registration skips quietly when addTool is missing, catches per-tool throws, and unregisters cleanly", () => {
  const { api } = makeApi();
  const tools = createAiTools({
    api,
    setStatusForAgent: async () => ({ status: "updated", didWrite: true }),
  });

  const origWarn = console.warn;
  const origLog = console.log;
  const origInfo = console.info;
  const warns = [];
  const noisy = [];
  console.warn = (...args) => warns.push(args);
  console.log = (...args) => noisy.push(args);
  console.info = (...args) => noisy.push(args);
  try {
    // Missing ai / addTool -> no-op, nothing logged
    const noopUnreg = registerAiTools({}, tools);
    noopUnreg();
    assert.equal(warns.length, 0);
    assert.equal(noisy.length, 0);

    // Throwing addTool on two tools: catches each, warns once, registers the rest
    const registered = [];
    const removed = [];
    const extensionAPI = {
      ai: {
        addTool(def) {
          if (def.name === "get_task_status" || def.name === "status_counts") {
            throw new Error("experimental failure");
          }
          registered.push(def.name);
        },
        removeTool({ name }) {
          removed.push(name);
          if (name === "list_tasks") throw new Error("already gone");
        },
      },
    };
    const unregister = registerAiTools(extensionAPI, tools);
    assert.deepEqual(registered, ["list_statuses", "list_tasks", "set_task_status"]);
    assert.equal(warns.length, 1);

    // Unregister calls removeTool for each added tool and tolerates throws
    unregister();
    assert.deepEqual(removed, ["list_statuses", "list_tasks", "set_task_status"]);
    // Idempotent second call
    unregister();
    assert.equal(removed.length, 3);
  } finally {
    console.warn = origWarn;
    console.log = origLog;
    console.info = origInfo;
  }
});

test("read tools return exact shapes and normalize ((uid))", async () => {
  assert.equal(normalizeBlockUid("((abc123456))"), "abc123456");
  assert.equal(normalizeBlockUid("  abc123456  "), "abc123456");
  assert.equal(normalizeBlockUid("((  xyz  ))"), "xyz");

  const { api } = makeApi();
  const tools = new Map(
    createAiTools({
      api,
      setStatusForAgent: async () => ({ status: "updated", didWrite: true }),
    }).map((tool) => [tool.name, tool])
  );

  assert.deepEqual(tools.get("list_statuses").handler(), {
    statuses: [
      { name: "Active", tag: "task-status/Active", group: "task", cycles: true },
      { name: "Waiting", tag: "task-status/Waiting", group: "task", cycles: true },
      { name: "Watching", tag: "task-status/Watching", group: "media", cycles: false },
      { name: "Important", tag: "task-status/Important", group: "extra", cycles: false },
    ],
    tagFormat: TAG_FORMAT,
  });

  assert.deepEqual(
    await tools.get("get_task_status").handler({ uids: ["((u1))", "u2", "p1", "missing"] }),
    {
      tasks: [
        { uid: "u1", found: true, isTask: true, done: false, status: "Waiting" },
        { uid: "u2", found: true, isTask: true, done: true, status: "Active" },
        { uid: "p1", found: true, isTask: false, done: false, status: null },
        { uid: "missing", found: false, isTask: false, done: false, status: null },
      ],
    }
  );

  await assert.rejects(() => tools.get("get_task_status").handler({ uids: [] }));
  await assert.rejects(() =>
    tools.get("get_task_status").handler({ uids: Array.from({ length: 51 }, (_, i) => `u${i}`) })
  );

  assert.deepEqual(
    await tools.get("list_tasks").handler({ status: "Waiting" }),
    {
      tasks: [{ uid: "u1", text: "Call lab", status: "Waiting", done: false, page: "Work" }],
      truncated: false,
    }
  );
  assert.deepEqual(
    await tools.get("list_tasks").handler({ include_done: true }),
    {
      tasks: [
        { uid: "u1", text: "Call lab", status: "Waiting", done: false, page: "Work" },
        { uid: "u2", text: "Shipped", status: "Active", done: true, page: "Archive" },
      ],
      truncated: false,
    }
  );
  await assert.rejects(
    () => tools.get("list_tasks").handler({ status: "Bogus" }),
    /Bogus.*Active.*Waiting/
  );

  assert.deepEqual(
    await tools.get("status_counts").handler({}),
    { counts: { Active: 0, Waiting: 1, Watching: 0, Important: 0 }, total: 1 }
  );
  assert.deepEqual(
    await tools.get("status_counts").handler({ include_done: true }),
    { counts: { Active: 1, Waiting: 1, Watching: 0, Important: 0 }, total: 2 }
  );
});

test("set_task_status validates all names before any write, runs sequentially, passes tokenUserUid, and maps results", async () => {
  const { api } = makeApi();
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const outcomes = new Map([
    ["u1", { status: "updated", didWrite: true, reason: "certified" }],
    ["u2", { status: "unchanged", didWrite: false, reason: "already-current" }],
    ["u3", { status: "rejected", didWrite: false, reason: "not-a-task" }],
    ["u4", { status: "rejected", didWrite: false, reason: "better-tasks-not-ready" }],
    ["u5", { status: "updated", didWrite: true }],
  ]);

  const tools = new Map(
    createAiTools({
      api,
      setStatusForAgent: async (uid, name, opts) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        calls.push({ uid, name, userUid: opts?.userUid });
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return outcomes.get(uid);
      },
    }).map((tool) => [tool.name, tool])
  );
  const setTool = tools.get("set_task_status");

  // Unknown status anywhere in the batch throws before ANY write runs
  await assert.rejects(
    () =>
      setTool.handler(
        {
          changes: [
            { uid: "u1", status: "Active" },
            { uid: "u2", status: "Nonexistent" },
          ],
        },
        { tokenUserUid: "ai-tok-1" }
      ),
    (err) => {
      assert.match(err.message, /Nonexistent/);
      assert.match(err.message, /Active/);
      assert.match(err.message, /Waiting/);
      return true;
    }
  );
  assert.equal(calls.length, 0, "no write may run if any status in batch is invalid");

  // Over batch cap 10 throws before any write
  await assert.rejects(() =>
    setTool.handler({
      changes: Array.from({ length: 11 }, (_, i) => ({ uid: `id${i}`, status: "Active" })),
    })
  );
  assert.equal(calls.length, 0);

  // Valid batch runs sequentially in order, normalizes ((uid)), forwards tokenUserUid, counts updated & failed
  const res = await setTool.handler(
    {
      changes: [
        { uid: "((u1))", status: "Waiting" },
        { uid: "u2", status: "Active" },
        { uid: "u3", status: "Important" },
        { uid: "u4", status: "Watching" },
        { uid: "((u5))", status: null },
      ],
    },
    { tokenUserUid: "ai-tok-99" }
  );

  assert.equal(maxInFlight, 1, "changes must run sequentially");
  assert.deepEqual(calls, [
    { uid: "u1", name: "Waiting", userUid: "ai-tok-99" },
    { uid: "u2", name: "Active", userUid: "ai-tok-99" },
    { uid: "u3", name: "Important", userUid: "ai-tok-99" },
    { uid: "u4", name: "Watching", userUid: "ai-tok-99" },
    { uid: "u5", name: null, userUid: "ai-tok-99" },
  ]);
  assert.deepEqual(res, {
    results: [
      { uid: "u1", status: "updated", didWrite: true, reason: "certified", name: "Waiting" },
      { uid: "u2", status: "unchanged", didWrite: false, reason: "already-current", name: "Active" },
      { uid: "u3", status: "rejected", didWrite: false, reason: "not-a-task", name: "Important" },
      { uid: "u4", status: "rejected", didWrite: false, reason: "better-tasks-not-ready", name: "Watching" },
      { uid: "u5", status: "updated", didWrite: true, name: null },
    ],
    updated: 2,
    failed: 2,
  });
});

test("live status enum updates in place on statuses events, toggles with manager sync, and falls back past 3800 chars", async () => {
  const { api, setCatalog } = makeApi();
  const activeTools = new Map();
  const addCalls = [];
  const removeCalls = [];
  const extensionAPI = {
    ai: {
      addTool(def) {
        addCalls.push(def.name);
        activeTools.set(def.name, def);
      },
      removeTool({ name }) {
        removeCalls.push(name);
        activeTools.delete(name);
      },
    },
  };

  const manager = createAiToolsManager({
    extensionAPI,
    api,
    setStatusForAgent: async () => ({ status: "updated", didWrite: true }),
  });

  manager.sync(true);
  assert.deepEqual([...activeTools.keys()], AI_TOOL_NAMES);
  assert.deepEqual(
    activeTools.get("list_tasks").inputSchema.properties.status.enum,
    ["Active", "Waiting", "Watching", "Important"]
  );
  assert.deepEqual(
    activeTools.get("set_task_status").inputSchema.properties.changes.items.properties.status,
    {
      type: ["string", "null"],
      enum: ["Active", "Waiting", "Watching", "Important", null],
      description: "Target status name, or null to clear the status tag.",
    }
  );

  // Rename / add a status and fire "statuses" -> both tools re-register in place
  setCatalog([
    { key: "ACTIVE", name: "In Progress", tag: "task-status/In Progress", glyph: "active", group: "task", inCycle: true },
    { key: "WAITING", name: "Blocked", tag: "task-status/Blocked", glyph: "waiting", group: "task", inCycle: true },
  ]);
  addCalls.length = 0;
  emitStatusCatalog(api, { apiVersion: 1 });
  assert.deepEqual(addCalls, ["list_tasks", "set_task_status"]);
  assert.deepEqual(
    activeTools.get("list_tasks").inputSchema.properties.status.enum,
    ["In Progress", "Blocked"]
  );
  assert.deepEqual(
    activeTools.get("set_task_status").inputSchema.properties.changes.items.properties.status.enum,
    ["In Progress", "Blocked", null]
  );

  // Setting off removes all tools; statuses event while off does not re-add
  manager.sync(false);
  assert.equal(activeTools.size, 0);
  assert.deepEqual(removeCalls, AI_TOOL_NAMES);
  addCalls.length = 0;
  emitStatusCatalog(api, { apiVersion: 1 });
  assert.equal(addCalls.length, 0);

  // Setting back on re-registers all five with the latest enum
  manager.sync(true);
  assert.deepEqual([...activeTools.keys()], AI_TOOL_NAMES);
  assert.deepEqual(
    activeTools.get("list_tasks").inputSchema.properties.status.enum,
    ["In Progress", "Blocked"]
  );

  // Overflow past 3800 characters falls back to plain type without enum, handler still validates
  const hugeCatalog = Array.from({ length: 180 }, (_, i) => ({
    key: `S_${i}`,
    name: `Very Long Workflow Status Name Number ${String(i).padStart(3, "0")}`,
    tag: `task-status/Very Long Workflow Status Name Number ${String(i).padStart(3, "0")}`,
    glyph: "custom",
    group: "task",
    inCycle: true,
  }));
  setCatalog(hugeCatalog);
  emitStatusCatalog(api, { apiVersion: 1 });

  const listSchema = activeTools.get("list_tasks").inputSchema;
  const setSchema = activeTools.get("set_task_status").inputSchema;
  assert.equal(listSchema.properties.status.enum, undefined);
  assert.equal(listSchema.properties.status.type, "string");
  assert.ok(JSON.stringify(listSchema).length <= 3800);
  assert.equal(setSchema.properties.changes.items.properties.status.enum, undefined);
  assert.deepEqual(setSchema.properties.changes.items.properties.status.type, ["string", "null"]);
  assert.ok(JSON.stringify(setSchema).length <= 3800);

  // Handler still rejects an unknown status even after enum fallback
  await assert.rejects(
    () => activeTools.get("set_task_status").handler({ changes: [{ uid: "u1", status: "NoSuch" }] }),
    /NoSuch/
  );

  manager.dispose();
  assert.equal(activeTools.size, 0);
});
