// Better Tasks spawns the next occurrence of a repeating task by copying the
// completed block's text (inline attributes stripped, DONE → TODO) into a new
// block, then writing its child attributes, and last its `:block/props`
// `rt: { id, parent: <series id>, tz }`. The copied text keeps our leading
// `#[[task-status/<Name>]]`, so the new occurrence inherits a stale status.
//
// Better Tasks exposes no spawn event, so this module watches the reverse
// refs of each tag page whose status should not carry over. A block that
// gains such a ref and was created at that moment is a candidate; once its
// `rt.parent` prop appears (Better Tasks has finished spawning), the tag is
// removed through Better Tasks' own `v2.requestStatusTag`. One write at most
// per block, never on the completed block, and the removal itself only drops
// a ref, so it cannot retrigger.

import { resolveBetterTasksProvider } from "./better-tasks-bridge.js";
import { statusLabelFromTaskText } from "./better-tasks-activity.js";

export const DEFAULT_CARRY_OVER_STATUS_NAMES = Object.freeze([
  "Series",
  "Movie",
  "Watching",
  "Watchlist",
  "Upcoming",
  "Rewatch",
  "Dropped",
]);

const STATUS_PREFIX = "task-status/";
const REVERSE_REFS_PATTERN = "[:block/_refs]";
const OCCURRENCE_PULL_PATTERN = "[:block/uid :block/string :create/time :block/props]";

function normalizeName(name) {
  return String(name || "").replace(/\s+/g, " ").trim();
}

// `null`/`undefined` means "never set": the media defaults. An empty string
// is a deliberate "nothing carries over".
export function parseCarryOverSetting(value) {
  if (value === null || value === undefined) return [...DEFAULT_CARRY_OVER_STATUS_NAMES];
  const source = Array.isArray(value) ? value.join(",") : String(value);
  const seen = new Set();
  const names = [];
  for (const part of source.split(/[,\n]/)) {
    const name = normalizeName(part);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function formatCarryOverSetting(names) {
  return parseCarryOverSetting(names).join(", ");
}

// Tag titles whose status resets on a new occurrence: every configured
// status whose name is not on the carry-over list.
export function resetTagTitles(statusNames, carryOverNames) {
  const carry = new Set(parseCarryOverSetting(carryOverNames).map((n) => n.toLowerCase()));
  const titles = [];
  const seen = new Set();
  for (const raw of statusNames || []) {
    const name = normalizeName(raw);
    const key = name.toLowerCase();
    if (!name || carry.has(key) || seen.has(key)) continue;
    seen.add(key);
    titles.push(`${STATUS_PREFIX}${name}`);
  }
  return titles;
}

function field(map, key) {
  if (!map || typeof map !== "object") return undefined;
  return map[key] ?? map[`:${key}`];
}

function parseProps(props) {
  if (typeof props === "string") {
    try {
      return JSON.parse(props);
    } catch (_) {
      return null;
    }
  }
  return props && typeof props === "object" ? props : null;
}

export function seriesParentFromProps(props) {
  const rt = field(parseProps(props), "rt");
  const parent = field(rt, "parent");
  return typeof parent === "string" && parent ? parent : null;
}

function refIds(pullResult) {
  const refs = field(pullResult, "block/_refs");
  if (!Array.isArray(refs)) return [];
  return refs.map((ref) => field(ref, "db/id")).filter((id) => id != null);
}

export function createRepeatStatusReset({
  roamAlphaAPI,
  windowLike,
  getResetTagTitles,
  now = Date.now,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  // The ref must arrive with the block: a block older than this when its tag
  // ref appears was edited (a status set by hand on a fresh occurrence, or a
  // block synced from another device), not spawned here.
  bornWithinMs = 2000,
  // How long to wait for Better Tasks to finish writing `rt` props.
  spawnSettleMs = 10000,
  pollMs = 200,
  // Tag pages created after load (typed by hand, set through Better Tasks,
  // synced from another device) or recreated under a new uid get a watch on
  // the next re-sync.
  resyncMs = 60000,
  setRepeatingTimer = (fn, ms) => setInterval(fn, ms),
  clearRepeatingTimer = (id) => clearInterval(id),
  log = () => {},
}) {
  const watches = new Map(); // tag title (lower case) -> { title, pageUid, callback }
  const handled = new Set();
  const timers = new Set();
  let disposed = false;
  let resetTitleSet = new Set();
  let resyncTimer = null;

  const data = () => roamAlphaAPI?.data;

  function pagesUidForTitle(title) {
    try {
      const page = data()?.pull?.("[:block/uid]", [":node/title", title]);
      const uid = field(page, "block/uid");
      return typeof uid === "string" ? uid : null;
    } catch (_) {
      return null;
    }
  }

  function uidForEntityId(id) {
    try {
      const block = data()?.pull?.("[:block/uid]", id);
      const uid = field(block, "block/uid");
      return typeof uid === "string" ? uid : null;
    } catch (_) {
      return null;
    }
  }

  function wait(ms) {
    return new Promise((resolve) => {
      const id = setTimer(() => {
        timers.delete(id);
        resolve();
      }, ms);
      timers.add(id);
    });
  }

  async function pullOccurrence(uid) {
    const pull = data()?.async?.pull;
    if (typeof pull !== "function") return null;
    const block = await pull.call(data().async, OCCURRENCE_PULL_PATTERN, [":block/uid", uid]);
    return field(block, "block/uid") === uid ? block : null;
  }

  function isResetTitle(title) {
    return typeof title === "string" && resetTitleSet.has(title.toLowerCase());
  }

  async function inspect(uid, observedAt) {
    const deadline = observedAt + spawnSettleMs;
    for (;;) {
      if (disposed) return { status: "skipped", reason: "disposed" };
      let block;
      try {
        block = await pullOccurrence(uid);
      } catch (error) {
        return { status: "skipped", reason: "read-failed", error };
      }
      if (!block) return { status: "skipped", reason: "block-not-found" };
      const created = Number(field(block, "create/time"));
      if (!Number.isFinite(created) || observedAt - created > bornWithinMs) {
        return { status: "skipped", reason: "not-new" };
      }
      const string = field(block, "block/string");
      const label = statusLabelFromTaskText(string);
      if (!label || !/^\s*\{\{\s*(?:\[\[\s*)?TODO/i.test(String(string))) {
        return { status: "skipped", reason: "not-a-status-todo" };
      }
      const title = `${STATUS_PREFIX}${label}`;
      if (!isResetTitle(title)) return { status: "skipped", reason: "carries-over" };
      if (seriesParentFromProps(field(block, "block/props"))) {
        return { status: "spawned", string, title };
      }
      if (now() >= deadline) return { status: "skipped", reason: "not-a-repeat-occurrence" };
      await wait(pollMs);
    }
  }

  async function handle(uid, observedAt = now()) {
    if (disposed || typeof uid !== "string" || handled.has(uid)) {
      return { status: "skipped", reason: "already-handled" };
    }
    handled.add(uid);
    const found = await inspect(uid, observedAt);
    if (found.status !== "spawned") return found;
    if (disposed) return { status: "skipped", reason: "disposed" };

    const provider = resolveBetterTasksProvider(windowLike);
    if (provider.kind !== "v2") {
      return { status: "skipped", reason: "better-tasks-v2-required" };
    }
    try {
      const outcome = await provider.capability.requestStatusTag(uid, {
        expectedString: found.string,
        statusTagTitle: null,
        source: "task-status-tags",
      });
      log("Repeat occurrence status reset", uid, found.title, outcome?.status);
      return { status: outcome?.status || "unknown", reason: "repeat-reset", outcome };
    } catch (error) {
      return { status: "unknown", reason: "better-tasks-status-request-failed", error };
    }
  }

  function onRefsChanged(before, after) {
    if (disposed || before == null) return;
    const observedAt = now();
    const known = new Set(refIds(before));
    for (const id of refIds(after)) {
      if (known.has(id)) continue;
      const uid = uidForEntityId(id);
      if (!uid || handled.has(uid)) continue;
      handle(uid, observedAt).catch((error) => log("Repeat reset failed", uid, error));
    }
  }

  function unwatch(key) {
    const entry = watches.get(key);
    if (!entry) return;
    watches.delete(key);
    try {
      data()?.removePullWatch?.(REVERSE_REFS_PATTERN, [":block/uid", entry.pageUid], entry.callback);
    } catch (error) {
      log("removePullWatch failed", entry.title, error);
    }
  }

  // Re-reads the reset list and (re)registers one watch per existing tag
  // page. Call after settings change or after a status write that may have
  // created a tag page for the first time.
  function sync() {
    if (disposed) return;
    if (resyncTimer === null && resyncMs > 0) {
      resyncTimer = setRepeatingTimer(() => sync(), resyncMs);
    }
    const titles = (getResetTagTitles?.() || []).filter((t) => typeof t === "string");
    resetTitleSet = new Set(titles.map((t) => t.toLowerCase()));
    for (const key of [...watches.keys()]) {
      if (!resetTitleSet.has(key)) unwatch(key);
    }
    if (typeof data()?.addPullWatch !== "function") return;
    for (const title of titles) {
      const key = title.toLowerCase();
      const pageUid = pagesUidForTitle(title);
      const existing = watches.get(key);
      if (existing && existing.pageUid === pageUid) continue;
      if (existing) unwatch(key);
      if (!pageUid) continue;
      const callback = (before, after) => onRefsChanged(before, after);
      try {
        data().addPullWatch(REVERSE_REFS_PATTERN, [":block/uid", pageUid], callback);
        watches.set(key, { title, pageUid, callback });
      } catch (error) {
        log("addPullWatch failed", title, error);
      }
    }
  }

  function dispose() {
    disposed = true;
    if (resyncTimer !== null) clearRepeatingTimer(resyncTimer);
    resyncTimer = null;
    for (const key of [...watches.keys()]) unwatch(key);
    for (const id of timers) clearTimer(id);
    timers.clear();
  }

  return Object.freeze({
    sync,
    dispose,
    handle,
    watchedTitles: () => [...watches.values()].map((entry) => entry.title),
  });
}
