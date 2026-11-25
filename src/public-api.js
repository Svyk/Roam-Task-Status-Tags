import {
  CHECKBOX_SHAPE_ATTRIBUTE,
  CHECKBOX_STATUS_ATTRIBUTE,
  CHECKBOX_TILT_ATTRIBUTE,
  computeStickerTiltSlot,
} from "./status-checkbox.js";

export const API_VERSION = 1;
export const GLOBAL_NAME = "RoamTaskStatusTags";
export const READY_EVENT = "roam-task-status-tags:ready";
export const UNLOAD_EVENT = "roam-task-status-tags:unload";
export const API_EVENTS = Object.freeze(["change", "statuses"]);
export const API_FEATURES = Object.freeze([
  "statusOfBlock",
  "tasks",
  "counts",
  "renderIcon",
  "aiTools",
]);

const DEFAULT_TASK_LIMIT = 50;
const MIN_TASK_LIMIT = 1;
const MAX_TASK_LIMIT = 200;

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
const renderedIconCleanups = new WeakMap();

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

export function validStatusNames(catalog) {
  return (Array.isArray(catalog) ? catalog : [])
    .map((row) => row?.name)
    .filter((name) => typeof name === "string" && name.length > 0);
}

export function unknownStatusError(name, catalog) {
  const valid = validStatusNames(catalog);
  const label = name === null ? "null" : String(name);
  const list = valid.length ? valid.join(", ") : "(none)";
  return new Error(`Unknown status "${label}". Valid statuses: ${list}`);
}

export function resolveStatusKey(name, catalog) {
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

function clampTaskLimit(value, fallback = DEFAULT_TASK_LIMIT) {
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_TASK_LIMIT, Math.max(MIN_TASK_LIMIT, Math.trunc(parsed)));
}

function isElementLike(node) {
  if (!node || typeof node !== "object") return false;
  if (node.nodeType !== undefined && node.nodeType !== 1) return false;
  return typeof node.appendChild === "function" && typeof node.tagName === "string";
}

function noop() {}

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

export function publicStatusRow({ key, name, tag, glyph, group, inCycle, colors }) {
  const resolvedGroup = group === "media" || group === "extra" ? group : "task";
  const resolvedInCycle = typeof inCycle === "boolean" ? inCycle : resolvedGroup === "task";
  return Object.freeze({
    key: String(key),
    name: String(name),
    tag: String(tag),
    glyph: String(glyph),
    group: resolvedGroup,
    inCycle: resolvedInCycle,
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

export function clearRenderedIcons(api) {
  const active = renderedIconCleanups.get(api);
  if (!active) return;
  for (const cleanup of [...active]) {
    try {
      cleanup();
    } catch (_) {}
  }
  active.clear();
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
  readBlockString = null,
  queryTasks = null,
  documentLike = null,
} = {}) {
  requiredFunction("readCatalog", readCatalog);
  requiredFunction("readStatuses", readStatuses);
  requiredFunction("createTextHelpers", createTextHelpers);
  requiredFunction("setBlockStatus", setBlockStatus);
  requiredFunction("cycleBlockStatus", cycleBlockStatus);

  const emitter = new EventTarget();
  const buckets = new Map();
  const liveIcons = new Set();

  function statusEntriesForQuery(entries) {
    return (Array.isArray(entries) ? entries : [])
      .filter((entry) => entry?.key && entry?.name)
      .map((entry) => ({
        key: entry.key,
        name: entry.name,
        tagTitle: entry.tag || `task-status/${entry.name}`,
      }));
  }

  const api = {
    apiVersion: API_VERSION,
    features: API_FEATURES,
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
    async statusOfBlock(uid) {
      const empty = { found: false, isTask: false, done: false, status: null };
      if (typeof uid !== "string" || !uid.trim() || typeof readBlockString !== "function") {
        return empty;
      }
      try {
        const text = await readBlockString(uid.trim());
        if (typeof text !== "string") return empty;
        const catalog = readCatalog();
        const helpers = createTextHelpers(helperOptionsFromCatalog(catalog));
        const parsed = helpers?.parseManagedPrefix?.(text);
        if (!parsed?.managed) {
          return { found: true, isTask: false, done: false, status: null };
        }
        const row = parsed.currentStatus
          ? (catalog || []).find((entry) => entry?.key === parsed.currentStatus)
          : null;
        return {
          found: true,
          isTask: true,
          done: parsed.taskKind === "done",
          status: typeof row?.name === "string" && row.name ? row.name : null,
        };
      } catch {
        return empty;
      }
    },
    async tasks({ status, includeDone = false, limit = DEFAULT_TASK_LIMIT } = {}) {
      if (typeof queryTasks !== "function") {
        throw new Error("Task query reader is unavailable");
      }
      const catalog = readCatalog() || [];
      let targetEntries = catalog;
      if (status !== undefined) {
        if (status === null) throw unknownStatusError(status, catalog);
        const resolved = resolveStatusKey(status, catalog);
        if (!resolved.ok || !resolved.key) throw unknownStatusError(status, catalog);
        const matchedEntry = catalog.find((entry) => entry?.key === resolved.key);
        if (!matchedEntry) throw unknownStatusError(status, catalog);
        targetEntries = [matchedEntry];
      }
      const clampedLimit = clampTaskLimit(limit, DEFAULT_TASK_LIMIT);
      const queryStatuses = statusEntriesForQuery(targetEntries);
      if (!queryStatuses.length) {
        return { tasks: [], truncated: false };
      }
      const helpers = createTextHelpers(helperOptionsFromCatalog(catalog));
      const rows = await queryTasks({
        statuses: queryStatuses,
        helpers,
        includeDone: Boolean(includeDone),
      });
      const list = Array.isArray(rows) ? rows : [];
      const nameByKey = new Map(
        catalog.filter((entry) => entry?.key && entry?.name).map((entry) => [entry.key, entry.name])
      );
      const truncated = list.length > clampedLimit;
      const sliced = list.slice(0, clampedLimit).map((row) => ({
        uid: row.uid,
        text: String(row.body ?? ""),
        status: nameByKey.get(row.statusKey) ?? row.statusKey,
        done: Boolean(row.done),
        page: typeof row.page === "string" ? row.page : null,
      }));
      return { tasks: sliced, truncated };
    },
    async counts({ includeDone = false } = {}) {
      if (typeof queryTasks !== "function") {
        throw new Error("Task query reader is unavailable");
      }
      const catalog = readCatalog() || [];
      const counts = {};
      const nameByKey = new Map();
      for (const entry of catalog) {
        if (!entry?.key || !entry?.name) continue;
        counts[entry.name] = 0;
        nameByKey.set(entry.key, entry.name);
      }
      const queryStatuses = statusEntriesForQuery(catalog);
      if (!queryStatuses.length) {
        return { counts, total: 0 };
      }
      const helpers = createTextHelpers(helperOptionsFromCatalog(catalog));
      const rows = await queryTasks({
        statuses: queryStatuses,
        helpers,
        includeDone: Boolean(includeDone),
      });
      let total = 0;
      for (const row of Array.isArray(rows) ? rows : []) {
        const name = nameByKey.get(row?.statusKey);
        if (name && Object.prototype.hasOwnProperty.call(counts, name)) {
          counts[name] += 1;
          total += 1;
        }
      }
      return { counts, total };
    },
    renderIcon(element, name) {
      if (!isElementLike(element) || typeof name !== "string") return noop;
      let catalog;
      try {
        catalog = readCatalog();
      } catch {
        return noop;
      }
      const resolved = resolveStatusKey(name, catalog);
      if (!resolved.ok || !resolved.key) return noop;
      const entry = (catalog || []).find((row) => row?.key === resolved.key);
      if (!entry) return noop;

      const doc = element.ownerDocument || documentLike || globalThis.document;
      if (!doc || typeof doc.createElement !== "function") return noop;

      const wrap = doc.createElement("span");
      wrap.className = "ts-rendered-icon";
      wrap.setAttribute("data-ts-rendered-icon", "true");
      wrap.setAttribute("aria-hidden", "true");
      wrap.setAttribute("data-task-status-key", entry.key);

      const box = doc.createElement("span");
      box.className = "rm-checkbox rm-todo";
      box.setAttribute(CHECKBOX_STATUS_ATTRIBUTE, entry.key);
      box.setAttribute(CHECKBOX_SHAPE_ATTRIBUTE, String(entry.glyph || "custom"));
      box.setAttribute(
        CHECKBOX_TILT_ATTRIBUTE,
        String(computeStickerTiltSlot(null, entry.key))
      );

      const container = doc.createElement("span");
      container.className = "check-container";

      const fakeInput = doc.createElement("input");
      fakeInput.setAttribute("type", "checkbox");
      fakeInput.setAttribute("tabindex", "-1");
      fakeInput.setAttribute("aria-hidden", "true");

      const checkmark = doc.createElement("span");
      checkmark.className = "checkmark";

      container.appendChild(fakeInput);
      container.appendChild(checkmark);
      box.appendChild(container);
      wrap.appendChild(box);
      element.appendChild(wrap);

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        liveIcons.delete(cleanup);
        if (typeof wrap.remove === "function") {
          wrap.remove();
        } else if (wrap.parentNode && typeof wrap.parentNode.removeChild === "function") {
          wrap.parentNode.removeChild(wrap);
        }
      };
      liveIcons.add(cleanup);
      return cleanup;
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
  renderedIconCleanups.set(frozen, liveIcons);
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
