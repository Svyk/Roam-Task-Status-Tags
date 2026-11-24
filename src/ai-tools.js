import {
  mapPublicResult,
  resolveStatusKey,
  unknownStatusError,
} from "./public-api.js";

export const AI_TOOL_NAMES = Object.freeze([
  "list_statuses",
  "get_task_status",
  "list_tasks",
  "status_counts",
  "set_task_status",
]);

export const TAG_FORMAT = "{{[[TODO]]}} #[[task-status/<Name>]] text";

const MAX_TOOLS = 25;
const MAX_GET_UIDS = 50;
const MAX_SET_CHANGES = 10;
const MAX_SCHEMA_CHARS = 3800;

export function normalizeBlockUid(raw) {
  if (typeof raw !== "string") return "";
  let value = raw.trim();
  if (value.startsWith("((") && value.endsWith("))")) {
    value = value.slice(2, -2).trim();
  }
  return value;
}

function readLiveStatuses(api) {
  const rows = api?.statuses?.();
  return Array.isArray(rows) ? rows : [];
}

function liveStatusNames(api) {
  return readLiveStatuses(api)
    .map((row) => row?.name)
    .filter((name) => typeof name === "string" && name.length > 0);
}

function buildListTasksSchema(names) {
  const make = (statusProp) => ({
    type: "object",
    properties: {
      status: statusProp,
      include_done: {
        type: "boolean",
        description: "Include DONE tasks when true. Default false.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 200,
        description: "Maximum tasks to return, from 1 to 200 (default 50).",
      },
    },
    additionalProperties: false,
  });

  if (Array.isArray(names) && names.length > 0) {
    const withEnum = make({
      type: "string",
      enum: [...names],
      description: "Optional status name to filter by.",
    });
    if (JSON.stringify(withEnum).length <= MAX_SCHEMA_CHARS) {
      return withEnum;
    }
  }

  return make({
    type: "string",
    description: "Optional status name to filter by.",
  });
}

function buildSetTaskStatusSchema(names) {
  const make = (statusProp) => ({
    type: "object",
    properties: {
      changes: {
        type: "array",
        minItems: 1,
        maxItems: MAX_SET_CHANGES,
        description: "1 to 10 status changes to apply sequentially.",
        items: {
          type: "object",
          properties: {
            uid: {
              type: "string",
              description: "Block uid of an existing task, bare or wrapped in (( )).",
            },
            status: statusProp,
          },
          required: ["uid", "status"],
          additionalProperties: false,
        },
      },
    },
    required: ["changes"],
    additionalProperties: false,
  });

  if (Array.isArray(names) && names.length > 0) {
    const withEnum = make({
      type: ["string", "null"],
      enum: [...names, null],
      description: "Target status name, or null to clear the status tag.",
    });
    if (JSON.stringify(withEnum).length <= MAX_SCHEMA_CHARS) {
      return withEnum;
    }
  }

  return make({
    type: ["string", "null"],
    description: "Target status name, or null to clear the status tag.",
  });
}

export function createAiTools({ api, setStatusForAgent } = {}) {
  if (!api || typeof api.statuses !== "function") {
    throw new TypeError("api is required");
  }
  if (typeof setStatusForAgent !== "function") {
    throw new TypeError("setStatusForAgent is required");
  }

  const names = liveStatusNames(api);

  const list_statuses = {
    name: "list_statuses",
    scope: "read",
    description:
      "Lists every task status configured in this graph with its tag, group (task, media, or extra), whether click-to-cycle visits it, and the tag format used on task blocks.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler() {
      const statuses = readLiveStatuses(api).map((row) => ({
        name: row.name,
        tag: row.tag,
        group: row.group,
        cycles: Boolean(row.inCycle),
      }));
      return { statuses, tagFormat: TAG_FORMAT };
    },
  };

  const get_task_status = {
    name: "get_task_status",
    scope: "read",
    description:
      "Reads the current workflow status and TODO/DONE state for 1 to 50 blocks by uid (bare or wrapped in double parentheses). Reports whether each block exists and starts with a TODO or DONE macro.",
    inputSchema: {
      type: "object",
      properties: {
        uids: {
          type: "array",
          minItems: 1,
          maxItems: MAX_GET_UIDS,
          items: { type: "string" },
          description: "1 to 50 block uids, bare or wrapped in (( )).",
        },
      },
      required: ["uids"],
      additionalProperties: false,
    },
    async handler(args) {
      const rawUids = args?.uids;
      if (!Array.isArray(rawUids) || rawUids.length < 1 || rawUids.length > MAX_GET_UIDS) {
        throw new Error(`uids must be an array of 1 to ${MAX_GET_UIDS} block uids.`);
      }
      const tasks = [];
      for (const raw of rawUids) {
        if (typeof raw !== "string") {
          throw new Error("Each entry in uids must be a string.");
        }
        const uid = normalizeBlockUid(raw);
        const info = await api.statusOfBlock(uid);
        tasks.push({
          uid,
          found: Boolean(info?.found),
          isTask: Boolean(info?.isTask),
          done: Boolean(info?.done),
          status: info?.status ?? null,
        });
      }
      return { tasks };
    },
  };

  const list_tasks = {
    name: "list_tasks",
    scope: "read",
    description:
      "Lists tasks that carry a configured task status tag, optionally filtered to one status. Excludes DONE tasks unless include_done is true. Returns uid, text without prefix, status, done state, and page title.",
    inputSchema: buildListTasksSchema(names),
    async handler(args) {
      const status = args?.status;
      if (status !== undefined) {
        const live = readLiveStatuses(api);
        if (status === null) throw unknownStatusError(status, live);
        const resolved = resolveStatusKey(status, live);
        if (!resolved.ok || !resolved.key) throw unknownStatusError(status, live);
      }
      const includeDone = Boolean(args?.include_done);
      const limit = args?.limit;
      return api.tasks({ status, includeDone, limit });
    },
  };

  const status_counts = {
    name: "status_counts",
    scope: "read",
    description:
      "Counts tasks per configured status across the graph, including statuses with zero tasks. Excludes DONE tasks unless include_done is true.",
    inputSchema: {
      type: "object",
      properties: {
        include_done: {
          type: "boolean",
          description: "Include DONE tasks when true. Default false.",
        },
      },
      additionalProperties: false,
    },
    async handler(args) {
      return api.counts({ includeDone: Boolean(args?.include_done) });
    },
  };

  const set_task_status = {
    name: "set_task_status",
    scope: "edit",
    description:
      "Sets or clears the workflow status on 1 to 10 existing TODO or DONE tasks. Use this tool instead of editing block text directly: it is the safe way to change a status because it routes Better Tasks tasks through Better Tasks and updates the activity log. Pass status null to clear the tag. Never creates statuses, never converts plain blocks into tasks, and never changes TODO/DONE.",
    inputSchema: buildSetTaskStatusSchema(names),
    async handler(args, context) {
      const changes = args?.changes;
      if (!Array.isArray(changes) || changes.length < 1 || changes.length > MAX_SET_CHANGES) {
        throw new Error(`changes must be an array of 1 to ${MAX_SET_CHANGES} items.`);
      }

      const live = readLiveStatuses(api);
      const plan = [];
      for (const entry of changes) {
        if (!entry || typeof entry !== "object") {
          throw new Error("Each change must be an object with uid and status.");
        }
        if (typeof entry.uid !== "string") {
          throw new Error("Each change uid must be a string.");
        }
        const uid = normalizeBlockUid(entry.uid);
        if (!uid) {
          throw new Error("Each change uid must be non-empty.");
        }
        if (!Object.prototype.hasOwnProperty.call(entry, "status") || entry.status === undefined) {
          throw new Error("Each change must specify a status name or null.");
        }
        if (entry.status === null) {
          plan.push({ uid, name: null });
          continue;
        }
        const resolved = resolveStatusKey(entry.status, live);
        if (!resolved.ok || !resolved.key) {
          throw unknownStatusError(entry.status, live);
        }
        const matched = live.find((row) => row?.key === resolved.key);
        if (!matched) {
          throw unknownStatusError(entry.status, live);
        }
        plan.push({ uid, name: matched.name });
      }

      const userUid =
        typeof context?.tokenUserUid === "string" && context.tokenUserUid.trim()
          ? context.tokenUserUid.trim()
          : undefined;
      const results = [];
      let updated = 0;
      let failed = 0;

      for (const item of plan) {
        let outcome;
        try {
          outcome = await setStatusForAgent(item.uid, item.name, { userUid });
        } catch {
          outcome = { status: "unknown", didWrite: false, reason: "set-status-failed" };
        }
        const mapped = mapPublicResult(outcome);
        const row = {
          uid: item.uid,
          status: mapped.status,
          didWrite: mapped.didWrite,
          name: item.name,
        };
        if (mapped.reason) row.reason = mapped.reason;
        results.push(row);
        if (mapped.status === "updated") {
          updated += 1;
        } else if (mapped.status !== "unchanged") {
          failed += 1;
        }
      }

      return { results, updated, failed };
    },
  };

  return [list_statuses, get_task_status, list_tasks, status_counts, set_task_status];
}

export function registerAiTools(extensionAPI, tools) {
  const ai = extensionAPI?.ai;
  if (typeof ai?.addTool !== "function") return () => {};
  const added = [];
  let warned = false;
  for (const tool of (tools ?? []).slice(0, MAX_TOOLS)) {
    try {
      ai.addTool({
        name: tool.name,
        description: tool.description,
        scope: tool.scope,
        inputSchema: tool.inputSchema,
        handler: tool.handler,
      });
      added.push(tool.name);
    } catch (error) {
      if (!warned) {
        warned = true;
        console.warn("[TaskStatus] AI tool not registered", tool.name, error);
      }
    }
  }
  return () => {
    for (const name of added.splice(0)) {
      try {
        ai.removeTool?.({ name });
      } catch {
        // Already removed or unsupported during teardown.
      }
    }
  };
}

export function createAiToolsManager({ extensionAPI, api, setStatusForAgent } = {}) {
  let unregister = null;
  let statusesListener = null;

  function updateDynamicTools() {
    const ai = extensionAPI?.ai;
    if (!unregister || typeof ai?.addTool !== "function") return;
    const tools = createAiTools({ api, setStatusForAgent }).filter(
      (tool) => tool.name === "list_tasks" || tool.name === "set_task_status"
    );
    let warned = false;
    for (const tool of tools) {
      try {
        ai.addTool({
          name: tool.name,
          description: tool.description,
          scope: tool.scope,
          inputSchema: tool.inputSchema,
          handler: tool.handler,
        });
      } catch (error) {
        if (!warned) {
          warned = true;
          console.warn("[TaskStatus] AI tool update failed", tool.name, error);
        }
      }
    }
  }

  function enable() {
    if (unregister) return;
    if (typeof extensionAPI?.ai?.addTool !== "function") return;
    const tools = createAiTools({ api, setStatusForAgent });
    unregister = registerAiTools(extensionAPI, tools);
    if (typeof api?.addEventListener === "function") {
      statusesListener = () => updateDynamicTools();
      api.addEventListener("statuses", statusesListener);
    }
  }

  function disable() {
    if (statusesListener && typeof api?.removeEventListener === "function") {
      api.removeEventListener("statuses", statusesListener);
    }
    statusesListener = null;
    if (unregister) {
      const stop = unregister;
      unregister = null;
      stop();
    }
  }

  function sync(enabled) {
    if (enabled) enable();
    else disable();
  }

  return Object.freeze({
    sync,
    dispose: disable,
    get active() {
      return unregister !== null;
    },
  });
}
