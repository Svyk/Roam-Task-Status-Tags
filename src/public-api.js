export const API_VERSION = 1;
export const GLOBAL_NAME = "RoamTaskStatusTags";
export const READY_EVENT = "roam-task-status-tags:ready";
export const UNLOAD_EVENT = "roam-task-status-tags:unload";
export const API_EVENTS = Object.freeze(["change", "statuses"]);

const EVENT_TYPES = new Set(API_EVENTS);
const PUBLIC_STATUSES = new Set([
  "updated",
  "rejected",
  "unknown",
  "conflict",
  "not-updated",
  "unchanged",
]);
const emitters = new WeakMap();

function requiredFunction(name, value) {
  if (typeof value !== "function") throw new TypeError(`${name} is required`);
  return value;
}

function helperOptionsFromCatalog(catalog) {
  const statuses = {};
  const cycleOrder = [];
  for (const row of catalog || []) {
    if (!row?.key || !row?.name) continue;
    cycleOrder.push(row.key);
    const tagTitle = row.tag || `task-status/${row.name}`;
    statuses[row.key] = {
      name: row.name,
      label: row.name,
      tagTitle,
      tagTitles: [tagTitle],
    };
  }
  return { statuses, cycleOrder };
}

function resolveStatusKey(name, catalog) {
  if (name === null) return { ok: true, key: null };
  if (typeof name !== "string") return { ok: false, reason: "unknown-status" };
  const text = name.trim();
  if (!text) return { ok: false, reason: "unknown-status" };
  const rows = Array.isArray(catalog) ? catalog : [];
  const upper = text.toUpperCase();
  for (const row of rows) {
    if (row?.key === text || row?.key === upper) return { ok: true, key: row.key };
  }
  const folded = text.toLowerCase();
  for (const row of rows) {
    if (row?.name === text || String(row?.name ?? "").toLowerCase() === folded) {
      return { ok: true, key: row.key };
    }
  }
  return { ok: false, reason: "unknown-status" };
}

// Keep the public object small: status, didWrite, and reason. Router payloads
// also carry classification and error, which are not part of this contract.
export function mapPublicResult(outcome) {
  if (outcome == null || typeof outcome !== "object") {
    return { status: "unknown", didWrite: false, reason: "unmapped-result" };
  }
  const known = PUBLIC_STATUSES.has(outcome.status);
  const status = known ? outcome.status : "unknown";
  const mapped = {
    status,
    didWrite: status === "updated" && outcome.didWrite === true,
  };
  if (typeof outcome.reason === "string" && outcome.reason) mapped.reason = outcome.reason;
  else if (!known) mapped.reason = "unmapped-result";
  const activity = outcome.activity;
  if (status === "updated" && activity && typeof activity.recorded === "boolean") {
    mapped.activity = { recorded: activity.recorded };
    if (typeof activity.reason === "string" && activity.reason) mapped.activity.reason = activity.reason;
  }
  return mapped;
}

export function publicStatusRow({ key, name, tag, glyph, colors }) {
  return Object.freeze({
    key: String(key),
    name: String(name),
    tag: String(tag),
    glyph: String(glyph),
    light: Object.freeze({
      base: String(colors?.lightBackgroundCss ?? ""),
      text: String(colors?.lightTextCss ?? ""),
    }),
    dark: Object.freeze({
      base: String(colors?.darkBackgroundCss ?? ""),
      text: String(colors?.darkTextCss ?? ""),
    }),
  });
}

function dispatch(target, type, detail) {
  try {
    const Ctor = globalThis.CustomEvent;
    if (!Ctor) return;
    target.dispatchEvent(new Ctor(type, { detail }));
  } catch (error) {
    console.error("[TaskStatus] listener dispatch failed", error);
  }
}

export function emitStatusChange(api, detail) {
  const emitter = emitters.get(api);
  if (!emitter) return;
  dispatch(emitter, "change", detail);
}

export function emitStatusCatalog(api, detail) {
  const emitter = emitters.get(api);
  if (!emitter) return;
  dispatch(emitter, "statuses", detail ?? { apiVersion: API_VERSION });
}

function emitChange(emitter, detail) {
  dispatch(emitter, "change", detail);
}

export function createPublicApi({
  readCatalog,
  readStatuses,
  createTextHelpers,
  setBlockStatus,
  cycleBlockStatus,
} = {}) {
  requiredFunction("readCatalog", readCatalog);
  requiredFunction("readStatuses", readStatuses);
  requiredFunction("createTextHelpers", createTextHelpers);
  requiredFunction("setBlockStatus", setBlockStatus);
  requiredFunction("cycleBlockStatus", cycleBlockStatus);

  const emitter = new EventTarget();
  const buckets = new Map();

  const api = {
    apiVersion: API_VERSION,
    statuses() {
      const rows = readStatuses();
      return Object.freeze(Array.isArray(rows) ? rows.slice() : []);
    },
    statusOf(text) {
      if (typeof text !== "string" || text.length === 0) return null;
      try {
        const catalog = readCatalog();
        const helpers = createTextHelpers(helperOptionsFromCatalog(catalog));
        const key = helpers?.getCurrentStatus?.(text);
        if (!key) return null;
        const row = (catalog || []).find((entry) => entry?.key === key);
        return typeof row?.name === "string" && row.name ? row.name : null;
      } catch (error) {
        console.warn("[TaskStatus] statusOf failed", error);
        return null;
      }
    },
    async setStatus(uid, name) {
      let catalog;
      try {
        catalog = readCatalog();
      } catch (error) {
        console.warn("[TaskStatus] status list read failed", error);
        return { status: "unknown", didWrite: false, reason: "status-list-unreadable" };
      }
      const resolved = resolveStatusKey(name, catalog);
      if (!resolved.ok) {
        return { status: "rejected", didWrite: false, reason: resolved.reason };
      }
      let outcome;
      try {
        outcome = await setBlockStatus(uid, resolved.key);
      } catch (error) {
        console.warn("[TaskStatus] setStatus failed", error);
        return { status: "unknown", didWrite: false, reason: "set-status-failed" };
      }
      // rejected, unknown, conflict, not-updated, and unchanged are final.
      const mapped = mapPublicResult(outcome);
      if (mapped.status !== "updated") return mapped;
      const row = (catalog || []).find((entry) => entry?.key === resolved.key);
      emitChange(emitter, {
        apiVersion: API_VERSION,
        uid,
        name: row?.name ?? null,
        status: "updated",
      });
      return mapped;
    },
    async cycle(uid) {
      let outcome;
      try {
        outcome = await cycleBlockStatus(uid);
      } catch (error) {
        console.warn("[TaskStatus] cycle failed", error);
        return { status: "unknown", didWrite: false, reason: "cycle-failed" };
      }
      if (outcome == null || typeof outcome !== "object") {
        return { status: "unchanged", didWrite: false, reason: "done-task" };
      }
      const mapped = mapPublicResult(outcome);
      if (mapped.status !== "updated") return mapped;
      const written = typeof outcome.string === "string" ? api.statusOf(outcome.string) : null;
      emitChange(emitter, {
        apiVersion: API_VERSION,
        uid,
        name: written,
        status: "updated",
      });
      return mapped;
    },
    addEventListener(type, cb) {
      if (!EVENT_TYPES.has(type) || typeof cb !== "function") return;
      let bag = buckets.get(type);
      if (!bag) {
        bag = new Map();
        buckets.set(type, bag);
      }
      if (bag.has(cb)) return;
      const wrapped = (event) => {
        try {
          cb(event?.detail);
        } catch (error) {
          console.error("[TaskStatus] listener failed", error);
        }
      };
      bag.set(cb, wrapped);
      emitter.addEventListener(type, wrapped);
    },
    removeEventListener(type, cb) {
      const bag = buckets.get(type);
      const wrapped = bag?.get(cb);
      if (!wrapped) return;
      bag.delete(cb);
      emitter.removeEventListener(type, wrapped);
    },
  };

  const frozen = Object.freeze(api);
  emitters.set(frozen, emitter);
  return frozen;
}

const fire = (win, type, detail, Ctor) => {
  try {
    const C = Ctor ?? win.CustomEvent ?? globalThis.CustomEvent;
    if (C) win.dispatchEvent(new C(type, { detail }));
  } catch (error) {
    console.warn("[TaskStatus] event dispatch failed", error);
  }
};

export function installPublicApi(api, { win = globalThis.window ?? globalThis, CustomEventCtor } = {}) {
  win[GLOBAL_NAME] = api;
  fire(win, READY_EVENT, { apiVersion: API_VERSION }, CustomEventCtor);
}

// Deletes window.RoamTaskStatusTags only when it is still this object.
export function uninstallPublicApi(api, { win = globalThis.window ?? globalThis, CustomEventCtor } = {}) {
  const ours = win[GLOBAL_NAME] === api;
  if (ours) delete win[GLOBAL_NAME];
  fire(win, UNLOAD_EVENT, { apiVersion: API_VERSION }, CustomEventCtor);
  return ours;
}
