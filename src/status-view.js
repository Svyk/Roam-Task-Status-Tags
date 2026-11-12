// "Watching now": a read-only panel that lists open tasks grouped by status.
//
// It owns its own element inside the extension's portal and never writes to the
// graph. Tasks are found with one datalog query over the status tag titles, and
// the Episode children of the kept tasks with one more.

import { episodeStateFromChildren, formatEpisode } from "./episode-counter.js";

export const STATUS_VIEW_CLASS = "ts-status-view";
export const STATUS_VIEW_FILTERS = Object.freeze(["media", "tasks", "all"]);

const FILTER_LABELS = { media: "Media", tasks: "Tasks", all: "All" };
const EMPTY_TEXT = {
  media: "No open tasks with a media status.",
  tasks: "No open tasks with a task status.",
  all: "No open tasks with a status.",
};
const MEDIA_ORDER = ["watching", "watchlist", "upcoming", "series", "rewatch"];

const TASKS_QUERY =
  "[:find ?uid ?str ?title ?time :in $ [?title ...] :where [?t :node/title ?title] [?b :block/refs ?t] [?b :block/uid ?uid] [?b :block/string ?str] [(get-else $ ?b :edit/time 0) ?time]]";
const EPISODE_QUERY =
  '[:find ?puid ?cuid ?cs ?order :in $ [?puid ...] :where [?p :block/uid ?puid] [?p :block/children ?c] [?c :block/uid ?cuid] [?c :block/string ?cs] [?c :block/order ?order] [(clojure.string/includes? ?cs "::")]]';

function lowerName(row) {
  return String(row?.name ?? "").trim().toLowerCase();
}

export function orderStatusGroups(rows, filter = "media") {
  const list = Array.isArray(rows) ? rows : [];
  const media = list.filter((row) => row.media);
  const tasks = list.filter((row) => !row.media);

  const mediaOrder = () => {
    const out = [];
    const used = new Set();
    for (const name of MEDIA_ORDER) {
      const row = media.find((entry) => !used.has(entry.key) && lowerName(entry) === name);
      if (row) {
        out.push(row);
        used.add(row.key);
      }
    }
    const rest = media.filter((row) => !used.has(row.key));
    const dropped = rest.filter((row) => lowerName(row) === "dropped");
    out.push(...rest.filter((row) => lowerName(row) !== "dropped"), ...dropped);
    return out;
  };

  const tasksOrder = () => {
    const alert = tasks.filter((row) => lowerName(row) === "alert");
    const cancelled = tasks.filter((row) => lowerName(row) === "cancelled");
    const rest = tasks.filter((row) => !alert.includes(row) && !cancelled.includes(row));
    return [...alert, ...rest, ...cancelled];
  };

  let ordered;
  if (filter === "tasks") ordered = tasksOrder();
  else if (filter === "all") ordered = [...mediaOrder(), ...tasksOrder()];
  else ordered = mediaOrder();
  return ordered.map((row) => row.key);
}

async function runQuery(roamAlphaAPI, query, ...args) {
  const asyncQ = roamAlphaAPI?.data?.async?.q;
  if (typeof asyncQ === "function") return asyncQ.call(roamAlphaAPI.data.async, query, ...args);
  if (typeof roamAlphaAPI?.q === "function") return roamAlphaAPI.q(query, ...args);
  throw new Error("roamAlphaAPI query is unavailable");
}

export async function queryStatusTasks({ roamAlphaAPI, statuses, helpers }) {
  const keyByTitle = new Map();
  for (const status of statuses || []) {
    if (status?.tagTitle && status?.key) keyByTitle.set(status.tagTitle, status.key);
  }
  if (!keyByTitle.size) return [];

  const found = await runQuery(roamAlphaAPI, TASKS_QUERY, [...keyByTitle.keys()]);
  const kept = new Map();
  for (const entry of Array.isArray(found) ? found : []) {
    const [uid, string, title, time] = entry || [];
    if (typeof uid !== "string" || typeof string !== "string" || kept.has(uid)) continue;
    const key = keyByTitle.get(title);
    if (!key || helpers.isDoneTask(string)) continue;
    if (helpers.getCurrentStatus(string) !== key) continue;
    kept.set(uid, {
      uid,
      statusKey: key,
      string,
      body: String(helpers.parseManagedPrefix(string).body ?? "").trim(),
      editTime: Number(time) || 0,
      episode: null,
    });
  }
  const rows = [...kept.values()];
  if (!rows.length) return rows;

  const childRows = await runQuery(roamAlphaAPI, EPISODE_QUERY, rows.map((row) => row.uid));
  const childrenByUid = new Map();
  for (const entry of Array.isArray(childRows) ? childRows : []) {
    const [puid, uid, string, order] = entry || [];
    if (typeof puid !== "string") continue;
    if (!childrenByUid.has(puid)) childrenByUid.set(puid, []);
    childrenByUid.get(puid).push({ uid, string, order });
  }
  for (const row of rows) {
    const children = childrenByUid.get(row.uid);
    if (!children) continue;
    const state = episodeStateFromChildren(children);
    if (!state.childUid) continue;
    row.episode = state.invalid ? { text: "?", invalid: true } : { text: formatEpisode(state.episode) };
  }

  rows.sort((a, b) => b.editTime - a.editTime || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  return rows;
}

const DOCK_WAIT_MS = 1000;
const DOCK_STEP_MS = 25;
const SIDEBAR_ID = "#right-sidebar";
const SIDEBAR_CONTENT_ID = "#roam-right-sidebar-content";
const KEY_EVENTS = ["keydown", "keypress", "keyup"];

const INNER_LINK_SELECTOR = "a, .rm-page-ref, .rm-block-ref, [data-link-title]";

export function createStatusView({
  document: documentLike,
  window: windowLike,
  roamAlphaAPI,
  portalRoot,
  readGroups,
  waitMs = DOCK_WAIT_MS,
  MutationObserverCtor = windowLike?.MutationObserver ?? globalThis.MutationObserver,
  log = () => {},
}) {
  let filter = "media";
  let root = null;
  let scroller = null;
  let content = null;
  let radios = [];
  let mounted = [];
  let rows = null;
  let groups = null;
  let loadError = false;
  let inFlight = false;
  let followUp = false;
  let disposed = false;
  let returnFocusEl = null;
  let listeners = [];
  let dockEl = null;
  let observer = null;
  let openedSidebar = false;
  let opening = false;
  let openToken = 0;

  function make(tag, className, text) {
    const el = documentLike.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function listen(el, type, handler) {
    el.addEventListener(type, handler);
    listeners.push([el, type, handler]);
  }

  function unmountRendered() {
    const unmount = roamAlphaAPI?.ui?.components?.unmountNode;
    for (const el of mounted) {
      if (typeof unmount !== "function") break;
      try {
        unmount.call(roamAlphaAPI.ui.components, { el });
      } catch (_) {}
    }
    mounted = [];
  }

  function glyphAttributes(el, status) {
    el.setAttribute("data-task-status-key", status.key);
    if (status.glyph) el.setAttribute("data-ts-status-glyph", status.glyph);
  }

  function openRow(uid, sidebar) {
    try {
      if (sidebar) {
        roamAlphaAPI.ui.rightSidebar.addWindow({ window: { type: "block", "block-uid": uid } });
      } else {
        roamAlphaAPI.ui.mainWindow.openBlock({ block: { uid } });
      }
    } catch (error) {
      log("Watching now could not open a task:", error);
    }
  }

  function renderTaskText(textEl, body) {
    if (!body) {
      textEl.textContent = "(untitled task)";
      return;
    }
    const render = roamAlphaAPI?.ui?.components?.renderString;
    if (typeof render === "function") {
      try {
        render.call(roamAlphaAPI.ui.components, { el: textEl, string: body });
        mounted.push(textEl);
        return;
      } catch (error) {
        log("Watching now could not render a task:", error);
      }
    }
    textEl.textContent = body;
  }

  function buildRow(row, status) {
    const li = make("li", "ts-status-view-row");
    li.setAttribute("tabindex", "0");
    li.setAttribute("data-ts-view-uid", row.uid);
    const icon = make("span", "ts-status-pill-preview ts-status-view-icon");
    glyphAttributes(icon, status);
    icon.setAttribute("aria-hidden", "true");
    const text = make("span", "ts-status-view-text");
    renderTaskText(text, row.body);
    li.append(icon, text);
    if (row.episode) {
      li.append(make("span", "ts-status-view-episode", row.episode.text));
    }
    listen(li, "click", (event) => {
      if (event.target?.closest?.(INNER_LINK_SELECTOR)) return;
      openRow(row.uid, Boolean(event.shiftKey));
    });
    return li;
  }

  function stateMessage(text) {
    return make("p", "ts-status-view-message", text);
  }

  function renderContent() {
    if (!root || !scroller) return;
    const scrollTop = scroller.scrollTop;
    unmountRendered();
    content?.remove();
    content = make("div", "ts-status-view-content");

    if (loadError) {
      content.append(stateMessage("Could not read tasks."));
    } else if (rows == null || groups == null) {
      content.append(stateMessage("Loading…"));
    } else {
      const byStatus = new Map();
      for (const row of rows) {
        if (!byStatus.has(row.statusKey)) byStatus.set(row.statusKey, []);
        byStatus.get(row.statusKey).push(row);
      }
      const statusByKey = new Map(groups.statuses.map((status) => [status.key, status]));
      const keys = orderStatusGroups(groups.statuses, filter).filter((key) => byStatus.has(key));
      if (!keys.length) {
        content.append(stateMessage(EMPTY_TEXT[filter]));
      } else {
        for (const key of keys) {
          const status = statusByKey.get(key);
          const items = byStatus.get(key);
          const section = make("section", "ts-status-view-group");
          const header = make("div", "ts-status-view-group-header");
          const pill = make("span", "ts-status-pill-preview", status.name);
          glyphAttributes(pill, status);
          header.append(pill, make("span", "ts-status-view-count", String(items.length)));
          const list = make("ul", "ts-status-view-list");
          items.forEach((row) => list.append(buildRow(row, status)));
          section.append(header, list);
          content.append(section);
        }
      }
    }
    scroller.append(content);
    if (scrollTop) scroller.scrollTop = scrollTop;
  }

  function syncRadios() {
    for (const radio of radios) {
      radio.el.setAttribute("aria-checked", radio.value === filter ? "true" : "false");
    }
  }

  function setFilter(value) {
    if (value === filter || !STATUS_VIEW_FILTERS.includes(value)) return;
    filter = value;
    syncRadios();
    renderContent();
  }

  function placement() {
    const bar = documentLike.querySelector?.(".rm-topbar");
    const bottom = bar?.getBoundingClientRect?.().bottom;
    const top = Number.isFinite(bottom) && bottom > 0 ? bottom + 8 : 56;
    root.style.top = `${top}px`;
  }

  // Window-capture guard (same pattern as the episode menu): keys aimed at the
  // view never reach Roam's shortcuts. Element listeners are not reached once
  // the event is stopped here, so Escape and Enter are handled in the guard.
  function keyGuard(event) {
    const target = event.target;
    if (!root || !target || !root.contains?.(target)) return;
    if (event.type === "keydown") {
      if (event.key === "Escape") {
        event.preventDefault?.();
        close({ restoreFocus: true });
      } else if (event.key === "Enter" && String(target.className).split(/\s+/).includes("ts-status-view-row")) {
        event.preventDefault?.();
        openRow(target.getAttribute("data-ts-view-uid"), Boolean(event.shiftKey));
      }
    }
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }

  function build() {
    root = make("section", STATUS_VIEW_CLASS);
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Watching now");
    root.setAttribute("data-ts-status-view", "true");

    const header = make("div", "ts-status-view-header");
    const title = make("h2", "ts-status-view-title", "Watching now");
    const refreshButton = make("button", "ts-status-view-button", "Refresh");
    refreshButton.setAttribute("type", "button");
    refreshButton.setAttribute("aria-label", "Refresh");
    const closeButton = make("button", "ts-status-view-button", "×");
    closeButton.setAttribute("type", "button");
    closeButton.setAttribute("aria-label", "Close");
    header.append(title, refreshButton, closeButton);
    listen(refreshButton, "click", () => void refresh());
    listen(closeButton, "click", () => close({ restoreFocus: true }));

    const group = make("div", "ts-status-view-filter");
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", "Show");
    radios = STATUS_VIEW_FILTERS.map((value) => {
      const el = make("button", "ts-status-view-radio", FILTER_LABELS[value]);
      el.setAttribute("type", "button");
      el.setAttribute("role", "radio");
      listen(el, "click", () => setFilter(value));
      group.append(el);
      return { value, el };
    });
    syncRadios();

    scroller = make("div", "ts-status-view-scroll");
    root.append(header, group, scroller);
    renderContent();
  }

  function teardown() {
    KEY_EVENTS.forEach((type) => windowLike?.removeEventListener?.(type, keyGuard, true));
    observer?.disconnect?.();
    observer = null;
    unmountRendered();
    for (const [el, type, handler] of listeners) el.removeEventListener(type, handler);
    listeners = [];
    dockEl?.remove();
    dockEl = null;
    root?.remove();
    root = null;
    scroller = null;
    content = null;
    radios = [];
  }

  function isOpen() {
    return Boolean(root);
  }

  async function runRefresh() {
    inFlight = true;
    try {
      do {
        followUp = false;
        let nextGroups = null;
        let nextRows = null;
        let failed = false;
        try {
          nextGroups = readGroups();
          nextRows = await queryStatusTasks({
            roamAlphaAPI,
            statuses: nextGroups.statuses,
            helpers: nextGroups.helpers,
          });
        } catch (error) {
          failed = true;
          log("Watching now could not read tasks:", error);
        }
        if (!root) return;
        loadError = failed;
        if (!failed) {
          groups = nextGroups;
          rows = nextRows;
        }
        renderContent();
      } while (followUp && root);
    } finally {
      inFlight = false;
    }
  }

  function refresh() {
    if (!root) return Promise.resolve();
    if (inFlight) {
      followUp = true;
      return Promise.resolve();
    }
    return runRefresh();
  }

  function query(selector) {
    return documentLike.querySelector?.(selector) ?? null;
  }

  function closeSidebarIfOurs() {
    if (!openedSidebar) return;
    openedSidebar = false;
    const sidebar = roamAlphaAPI?.ui?.rightSidebar;
    try {
      const windows = sidebar?.getWindows?.();
      if (Array.isArray(windows) && windows.length === 0) sidebar.close?.();
    } catch (error) {
      log("Watching now could not close the sidebar:", error);
    }
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForSidebarContent() {
    let waited = 0;
    for (;;) {
      const content = query(SIDEBAR_CONTENT_ID);
      if (content) return content;
      if (waited >= waitMs) return null;
      await wait(DOCK_STEP_MS);
      waited += DOCK_STEP_MS;
    }
  }

  function mount(container) {
    build();
    if (container) {
      root.className = `${root.className} ts-status-view--docked`;
      dockEl = make("div", "ts-status-portal ts-status-view-dock");
      dockEl.setAttribute("data-task-status-portal", "true");
      dockEl.append(root);
      container.prepend(dockEl);
      const host = query(SIDEBAR_ID);
      if (host && typeof MutationObserverCtor === "function") {
        observer = new MutationObserverCtor(() => {
          if (!root || !dockEl || dockEl.isConnected) return;
          const content = query(SIDEBAR_CONTENT_ID);
          if (content) content.prepend(dockEl);
          else {
            openedSidebar = false;
            close();
          }
        });
        observer.observe(host, { childList: true, subtree: true });
      }
    } else {
      (portalRoot || documentLike.body).appendChild(root);
      placement();
    }
    KEY_EVENTS.forEach((type) => windowLike?.addEventListener?.(type, keyGuard, true));
    void refresh();
  }

  function resetData() {
    rows = null;
    groups = null;
    loadError = false;
  }

  async function openDocked(token) {
    const sidebar = roamAlphaAPI.ui.rightSidebar;
    const wasOpen = Boolean(query(SIDEBAR_CONTENT_ID));
    let content = null;
    try {
      const result = sidebar.open();
      if (result && typeof result.then === "function") await result;
      if (!wasOpen) openedSidebar = true;
      content = await waitForSidebarContent();
    } catch (error) {
      log("Watching now could not open the sidebar:", error);
    }
    if (disposed || token !== openToken) {
      closeSidebarIfOurs();
      return;
    }
    opening = false;
    mount(content);
    if (!content) closeSidebarIfOurs();
  }

  function open() {
    if (disposed || root || opening) return Promise.resolve();
    returnFocusEl = documentLike.activeElement || null;
    resetData();
    const sidebar = roamAlphaAPI?.ui?.rightSidebar;
    if (typeof sidebar?.open === "function" && query(SIDEBAR_ID)) {
      opening = true;
      const token = ++openToken;
      return openDocked(token).finally(() => {
        if (token === openToken) opening = false;
      });
    }
    mount(null);
    return Promise.resolve();
  }

  function close({ restoreFocus = false } = {}) {
    if (opening) {
      opening = false;
      openToken += 1;
      return;
    }
    if (!root) return;
    const target = returnFocusEl;
    returnFocusEl = null;
    teardown();
    closeSidebarIfOurs();
    if (restoreFocus && target?.isConnected && typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  }

  function toggle() {
    if (root || opening) close({ restoreFocus: true });
    else void open();
  }

  function dispose() {
    disposed = true;
    openToken += 1;
    opening = false;
    returnFocusEl = null;
    const had = Boolean(root);
    teardown();
    if (had) closeSidebarIfOurs();
  }

  return { open, close, toggle, refresh, isOpen, dispose };
}
