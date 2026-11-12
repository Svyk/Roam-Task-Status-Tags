// Episode counter for the media statuses Series, Watching and Rewatch.
//
// The counter lives in a plain attribute child of the task, `Episode:: S2E5`,
// created only the first time it is used. Better Tasks' `bt_modify` only knows
// its own attributes, and Better Tasks ignores unknown `X::` children, so this
// module writes that one child directly: it creates it, or changes its string
// in place (same uid). It never touches a BT_attr* block or the task string.

export const EPISODE_ATTRIBUTE = "Episode";
export const EPISODE_GLYPHS = Object.freeze(["series", "watching", "rewatch"]);
export const EPISODE_COUNTER_CLASS = "ts-episode-counter";
export const EPISODE_UID_ATTRIBUTE = "data-ts-episode-uid";
export const EPISODE_MAX = 9999;

const EPISODE_VALUE_RE = /^\s*S(\d+)E(\d+)\s*$/i;
const EPISODE_CHILD_RE = /^[ \t]*Episode::[ \t]*([^\r\n]*)/i;
const CHILDREN_PULL_PATTERN =
  "[:block/uid :block/string {:block/children [:block/uid :block/string :block/order]}]";

function validPart(value) {
  return Number.isInteger(value) && value >= 1 && value <= EPISODE_MAX;
}

export function isValidEpisode(value) {
  return Boolean(value) && validPart(value.season) && validPart(value.episode);
}

export function parseEpisode(text) {
  const match = typeof text === "string" ? text.match(EPISODE_VALUE_RE) : null;
  if (!match) return null;
  const parsed = { season: Number(match[1]), episode: Number(match[2]) };
  return isValidEpisode(parsed) ? parsed : null;
}

export function formatEpisode({ season, episode }) {
  return `S${season}E${episode}`;
}

export function nextEpisode({ season, episode }) {
  return { season, episode: episode + 1 };
}

export function newSeason({ season }) {
  return { season: season + 1, episode: 1 };
}

export function sameEpisode(a, b) {
  return Boolean(a) && Boolean(b) && a.season === b.season && a.episode === b.episode;
}

function valueAt(value, key, fallback = null) {
  if (!value || typeof value !== "object") return fallback;
  const plain = key.replace(/^:/, "");
  return value[key] ?? value[plain] ?? value[plain.replace(/^block\//, "")] ?? fallback;
}

function orderedChildren(block) {
  const children = valueAt(block, ":block/children", []);
  if (!Array.isArray(children)) return [];
  return children
    .map((child) => ({
      uid: valueAt(child, ":block/uid", null),
      string: valueAt(child, ":block/string", null),
      order: Number(valueAt(child, ":block/order", 0)) || 0,
    }))
    .filter((child) => typeof child.uid === "string" && typeof child.string === "string")
    .sort((a, b) => a.order - b.order);
}

// Decides the Episode state from a task's children (`[{uid, string, order}]`).
export function episodeStateFromChildren(children) {
  const ordered = (Array.isArray(children) ? children : [])
    .filter((child) => typeof child?.uid === "string" && typeof child?.string === "string")
    .map((child) => ({ uid: child.uid, string: child.string, order: Number(child.order) || 0 }))
    .sort((a, b) => a.order - b.order);
  const matches = ordered.filter((entry) => EPISODE_CHILD_RE.test(entry.string));
  if (!matches.length) return { episode: null, childUid: null, childString: null, invalid: false, duplicate: false };
  const child = matches[0];
  const duplicate = matches.length > 1;
  const episode = duplicate ? null : parseEpisode(child.string.match(EPISODE_CHILD_RE)[1]);
  return {
    episode,
    childUid: child.uid,
    childString: child.string,
    invalid: duplicate || !episode,
    duplicate,
  };
}

function stateFromBlock(block, uid) {
  if (valueAt(block, ":block/uid", null) !== uid) return { found: false };
  return { found: true, ...episodeStateFromChildren(orderedChildren(block)) };
}

// Only the first line's value changes; any further lines stay byte-for-byte.
function replaceFirstLine(childString, value) {
  const prefix = childString.match(/^[ \t]*Episode::[ \t]*/i)?.[0] ?? `${EPISODE_ATTRIBUTE}:: `;
  const rest = childString.slice(childString.search(/[\r\n]|$/));
  return `${prefix}${value}${rest}`;
}

export async function readEpisodeState({ roamAlphaAPI, uid }) {
  const pull = roamAlphaAPI?.data?.async?.pull;
  if (typeof pull !== "function") throw new Error("roamAlphaAPI.data.async.pull is unavailable");
  const block = await pull.call(roamAlphaAPI.data.async, CHILDREN_PULL_PATTERN, [":block/uid", uid]);
  return stateFromBlock(block, uid);
}

// Synchronous read for refresh paths. Never throws.
export function readEpisodeStateSync({ roamAlphaAPI, uid }) {
  try {
    const block = roamAlphaAPI.data.pull(CHILDREN_PULL_PATTERN, [":block/uid", uid]);
    return stateFromBlock(block, uid);
  } catch (_) {
    return { found: false };
  }
}

// Writes are serialized per task uid: every step reads fresh, so fast double
// clicks add two episodes and never create a second Episode block.
const writeQueues = new Map();

function enqueue(uid, task) {
  const previous = writeQueues.get(uid) || Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.then(() => {}, () => {});
  writeQueues.set(uid, tail);
  tail.then(() => {
    if (writeQueues.get(uid) === tail) writeQueues.delete(uid);
  });
  return run;
}

async function writeEpisodeNow({ roamAlphaAPI, uid, compute, activityRecorder }) {
  let before;
  try {
    before = await readEpisodeState({ roamAlphaAPI, uid });
  } catch (error) {
    return { status: "unknown", reason: "read-failed", error };
  }
  if (!before.found) return { status: "rejected", reason: "block-not-found" };
  if (before.duplicate) return { status: "rejected", reason: "duplicate-episode-blocks" };
  if (before.invalid) return { status: "rejected", reason: "invalid-existing-value" };

  const next = compute(before.episode);
  if (!isValidEpisode(next)) return { status: "rejected", reason: "invalid-episode-value" };
  if (before.episode && sameEpisode(before.episode, next)) {
    return { status: "unchanged", reason: "same-value", value: formatEpisode(next), childUid: before.childUid };
  }

  const string = before.childUid
    ? replaceFirstLine(before.childString, formatEpisode(next))
    : `${EPISODE_ATTRIBUTE}:: ${formatEpisode(next)}`;
  try {
    if (before.childUid) {
      await roamAlphaAPI.data.block.update({ block: { uid: before.childUid, string } });
    } else {
      const childUid = roamAlphaAPI.util.generateUID();
      await roamAlphaAPI.data.block.create({
        location: { "parent-uid": uid, order: "last" },
        block: { uid: childUid, string },
      });
    }
  } catch (error) {
    return { status: "unknown", reason: "write-failed", error };
  }

  let after;
  try {
    after = await readEpisodeState({ roamAlphaAPI, uid });
  } catch (error) {
    return { status: "unknown", reason: "certify-read-failed", error };
  }
  if (!after.found || after.childString !== string || (before.childUid && after.childUid !== before.childUid)) {
    return { status: "unknown", reason: "not-confirmed", value: formatEpisode(next), childUid: after.childUid };
  }

  const value = formatEpisode(next);
  if (typeof activityRecorder?.recordAttributeChange === "function") {
    try {
      await activityRecorder.recordAttributeChange({
        uid,
        field: "episode",
        from: before.episode ? formatEpisode(before.episode) : undefined,
        to: value,
      });
    } catch (_) {
      // A missing log line never fails the certified write.
    }
  }
  return { status: "updated", value, childUid: after.childUid };
}

export function writeEpisode(options) {
  if (typeof options?.uid !== "string" || !options.uid) {
    return Promise.resolve({ status: "rejected", reason: "invalid-uid" });
  }
  if (typeof options.compute !== "function") {
    return Promise.resolve({ status: "rejected", reason: "invalid-compute" });
  }
  return enqueue(options.uid, () => writeEpisodeNow(options));
}

export function computeFromDecision(decision) {
  switch (decision?.action) {
    case "next":
    case "start":
      return (current) => (current ? nextEpisode(current) : { season: 1, episode: 1 });
    case "season":
      return (current) => (current ? newSeason(current) : { season: 1, episode: 1 });
    case "set":
      return () => ({ season: decision.season, episode: decision.episode });
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// The counter element.

const PLACEHOLDER = "+";

function setAttr(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function elementsIncludingRoot(root, selector) {
  const nodes = [];
  if (root?.matches?.(selector)) nodes.push(root);
  if (root?.querySelectorAll) nodes.push(...root.querySelectorAll(selector));
  return nodes;
}

function stopEvent(event) {
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
}

export function createEpisodeCounterController({
  document: documentLike,
  roamAlphaAPI,
  activityRecorder = null,
  onOpenMenu = () => {},
  onChange = () => {},
  getBlockUid = () => null,
  warn = (...args) => console.warn(...args),
}) {
  const inFlight = new Map();
  const warned = new Set();

  const isCounter = (node) => Boolean(node?.getAttribute?.(EPISODE_UID_ATTRIBUTE) != null) &&
    String(node.className || "").split(/\s+/).includes(EPISODE_COUNTER_CLASS);

  function warnOnce(uid, reason, detail) {
    const key = `${uid}:${reason}`;
    if (warned.has(key)) return;
    warned.add(key);
    warn("[TaskStatus] Episode counter not written", { uid, reason, ...detail });
  }

  function render(counter, state) {
    let text;
    let kind;
    if (state.invalid) {
      kind = "invalid";
      text = "?";
      counter._episode = null;
    } else if (state.episode) {
      kind = "set";
      text = formatEpisode(state.episode);
      counter._episode = state.episode;
    } else {
      kind = "empty";
      text = PLACEHOLDER;
      counter._episode = null;
    }
    counter._episodeKind = kind;
    if (counter.textContent !== text) counter.textContent = text;
    setAttr(counter, "data-ts-episode-state", kind);
    if (kind === "set") {
      const label = `Episode ${text}. Click for next episode. Alt-click or right-click for more.`;
      setAttr(counter, "aria-label", label);
      setAttr(counter, "title", label);
    } else if (kind === "invalid") {
      const label = "Episode value not recognised. Edit the Episode:: block.";
      setAttr(counter, "aria-label", label);
      setAttr(counter, "title", label);
    } else {
      setAttr(counter, "aria-label", "Start episode counter");
      setAttr(counter, "title", "Start episode counter");
    }
  }

  function countersFor(uid) {
    return Array.from(documentLike.querySelectorAll(`.${EPISODE_COUNTER_CLASS}`)).filter(
      (counter) => counter.getAttribute(EPISODE_UID_ATTRIBUTE) === uid
    );
  }

  async function apply(counter, uid, compute) {
    if (counter._episodeKind !== "invalid") {
      const optimistic = compute(counter._episode || null);
      if (isValidEpisode(optimistic)) render(counter, { episode: optimistic });
    }
    inFlight.set(uid, (inFlight.get(uid) || 0) + 1);
    let result;
    try {
      result = await writeEpisode({ roamAlphaAPI, uid, compute, activityRecorder });
    } catch (error) {
      result = { status: "unknown", reason: "write-threw", error };
    }
    const remaining = (inFlight.get(uid) || 1) - 1;
    if (remaining > 0) inFlight.set(uid, remaining);
    else inFlight.delete(uid);
    if (remaining > 0) return result;
    if (result.status === "updated") {
      try {
        onChange(uid);
      } catch (_) {}
    }
    if (result.status === "updated" || result.status === "unchanged") {
      const settled = parseEpisode(result.value);
      if (settled) countersFor(uid).forEach((el) => render(el, { episode: settled }));
    } else {
      warnOnce(uid, result.reason || "unknown", { status: result.status });
      resyncUid(uid);
    }
    return result;
  }

  function resyncUid(uid) {
    if (inFlight.get(uid)) return;
    const state = readEpisodeStateSync({ roamAlphaAPI, uid });
    if (!state.found) return;
    countersFor(uid).forEach((counter) => render(counter, state));
  }

  function openMenu(counter) {
    const uid = counter.getAttribute(EPISODE_UID_ATTRIBUTE);
    if (!uid) return;
    const state = readEpisodeStateSync({ roamAlphaAPI, uid });
    if (!state.found) return;
    if (state.invalid) {
      warnOnce(uid, state.duplicate ? "duplicate-episode-blocks" : "invalid-existing-value", {});
      if (!inFlight.get(uid)) render(counter, state);
      return;
    }
    if (!inFlight.get(uid)) render(counter, state);
    onOpenMenu({ counter, uid, current: state.episode || null });
  }

  function applyDecision({ counter, decision }) {
    const uid = counter?.getAttribute?.(EPISODE_UID_ATTRIBUTE);
    const compute = computeFromDecision(decision);
    if (!uid || !compute) return Promise.resolve(null);
    return apply(counter, uid, compute);
  }

  function increment(counter) {
    const uid = counter.getAttribute(EPISODE_UID_ATTRIBUTE);
    if (!uid) return Promise.resolve(null);
    return apply(counter, uid, computeFromDecision({ action: "next" }));
  }

  function build() {
    const counter = documentLike.createElement("span");
    counter.className = EPISODE_COUNTER_CLASS;
    counter.setAttribute("role", "button");
    counter.setAttribute("tabindex", "0");
    counter.setAttribute("contenteditable", "false");
    const swallow = (event) => stopEvent(event);
    const onClick = (event) => {
      stopEvent(event);
      if (event.altKey) openMenu(counter);
      else void increment(counter);
    };
    const onContextMenu = (event) => {
      stopEvent(event);
      openMenu(counter);
    };
    const onKeyDown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        stopEvent(event);
        if (!event.repeat) void increment(counter);
      } else if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
        stopEvent(event);
        openMenu(counter);
      }
    };
    const onTouchStart = (event) => event.stopPropagation?.();
    counter._tsListeners = [
      ["mousedown", swallow],
      ["mouseup", swallow],
      ["dblclick", swallow],
      ["touchstart", onTouchStart],
      ["click", onClick],
      ["contextmenu", onContextMenu],
      ["keydown", onKeyDown],
    ];
    counter._tsListeners.forEach(([type, handler]) => counter.addEventListener(type, handler));
    return counter;
  }

  function destroy(counter) {
    (counter._tsListeners || []).forEach(([type, handler]) => counter.removeEventListener(type, handler));
    counter._tsListeners = [];
    counter.remove();
  }

  // Ensures one counter right after a certified managed status pill.
  // Reuses the existing element; only changed text/attributes are written.
  function sync({ pill, uid, kept }) {
    const parent = pill?.parentElement;
    if (!parent || typeof uid !== "string" || !uid) return null;
    const state = readEpisodeStateSync({ roamAlphaAPI, uid });
    if (!state.found) return null;
    let counter = pill.nextElementSibling;
    if (!isCounter(counter)) {
      counter = build();
      parent.insertBefore(counter, pill.nextSibling || null);
    }
    setAttr(counter, EPISODE_UID_ATTRIBUTE, uid);
    if (!inFlight.get(uid)) render(counter, state);
    kept?.add(counter);
    return counter;
  }

  function sweep(scope, kept = new Set()) {
    elementsIncludingRoot(scope, `.${EPISODE_COUNTER_CLASS}`)
      .filter((counter) => !kept.has(counter))
      .forEach(destroy);
  }

  // A hand edit of the Episode:: child re-renders it as an attribute ref.
  function isEpisodeAttributeNode(node) {
    if (node?.nodeType !== 1) return false;
    const candidates = [];
    if (node.classList?.contains("rm-attr-ref")) candidates.push(node);
    const inner = node.getElementsByClassName?.("rm-attr-ref");
    if (inner?.length) candidates.push(...Array.from(inner));
    return candidates.some((el) => {
      const title = el.getAttribute?.("data-link-title") ?? el.textContent ?? "";
      return String(title).replace(/:+\s*$/, "").trim().toLowerCase() === EPISODE_ATTRIBUTE.toLowerCase();
    });
  }

  // Maps a mutated Episode attribute node to its task uid. A removed node is
  // disconnected, so its mutation target (the task's children container) is the anchor.
  function taskUidForAttributeNode(node, fallbackTarget = null) {
    const anchor = node?.isConnected ? node : fallbackTarget;
    const container = anchor?.closest?.(".roam-block-container");
    if (!container) return null;
    const zone = anchor.closest(".rm-block-children, .rm-block-main");
    const inOwnChildren =
      zone && String(zone.className || "").split(/\s+/).includes("rm-block-children") &&
      zone.closest(".roam-block-container") === container;
    const taskContainer = inOwnChildren
      ? container
      : container.parentElement?.closest?.(".roam-block-container");
    if (!taskContainer) return null;
    const main = Array.from(taskContainer.children || []).find((child) =>
      String(child.className || "").split(/\s+/).includes("rm-block-main")
    );
    const input = main?.querySelector?.(".rm-block__input");
    return input ? getBlockUid(input) : null;
  }

  function destroyAll(root = documentLike) {
    sweep(root, new Set());
  }

  return Object.freeze({
    sync,
    sweep,
    destroyAll,
    resyncUid,
    applyDecision,
    isEpisodeAttributeNode,
    taskUidForAttributeNode,
    isCounter,
  });
}

// ---------------------------------------------------------------------------
// The menu: replaces nothing, opens in the chooser portal.

const FOCUSABLE = ".ts-episode-item, .ts-episode-input, .ts-episode-set";

function menuItem(documentLike, { label, hint = "", action, onChoose }) {
  const li = documentLike.createElement("li");
  const item = documentLike.createElement("a");
  item.className = "ts-status-choice ts-follow-up-item ts-episode-item bp3-menu-item";
  item.setAttribute("role", "menuitem");
  item.setAttribute("tabindex", "0");
  item.setAttribute("data-episode-action", action);
  const text = documentLike.createElement("div");
  text.className = "ts-status-choice-label bp3-fill bp3-text-overflow-ellipsis";
  text.textContent = label;
  item.append(text);
  if (hint) {
    const hintEl = documentLike.createElement("span");
    hintEl.className = "ts-follow-up-hint bp3-menu-item-label";
    hintEl.textContent = hint;
    item.append(hintEl);
  }
  item.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onChoose();
  });
  item.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  item._episodeChoose = onChoose;
  li.append(item);
  return li;
}

function parseField(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return validPart(number) ? number : null;
}

export function createEpisodeMenu({ document: documentLike, current = null, onDecision }) {
  let decided = false;
  const decide = (decision) => {
    if (decided) return;
    decided = true;
    onDecision(decision);
  };

  const list = documentLike.createElement("ul");
  list.className = "ts-status-choice-list ts-follow-up ts-episode-menu bp3-menu";
  list.setAttribute("role", "menu");
  list.setAttribute("aria-label", "Episode counter");
  list.setAttribute("data-task-status-episode-menu", "true");

  const header = documentLike.createElement("li");
  header.className = "ts-status-chooser-count ts-follow-up-header bp3-menu-header";
  const title = documentLike.createElement("h6");
  title.textContent = current ? `Episode · ${formatEpisode(current)}` : "Episode";
  header.append(title);
  list.append(header);

  if (current) {
    list.append(
      menuItem(documentLike, {
        label: "Next episode",
        hint: formatEpisode(nextEpisode(current)),
        action: "next",
        onChoose: () => decide({ action: "next" }),
      }),
      menuItem(documentLike, {
        label: "New season",
        hint: formatEpisode(newSeason(current)),
        action: "season",
        onChoose: () => decide({ action: "season" }),
      })
    );
  } else {
    list.append(
      menuItem(documentLike, {
        label: "Start S1E1",
        action: "start",
        onChoose: () => decide({ action: "start" }),
      })
    );
  }

  const row = documentLike.createElement("li");
  row.className = "ts-follow-up-date-row ts-episode-row";
  const makeInput = (label, prefix, value) => {
    const field = documentLike.createElement("label");
    field.className = "ts-episode-field";
    const tag = documentLike.createElement("span");
    tag.className = "ts-episode-field-prefix";
    tag.setAttribute("aria-hidden", "true");
    tag.textContent = prefix;
    const input = documentLike.createElement("input");
    input.className = "ts-follow-up-date ts-episode-input bp3-input bp3-small";
    input.setAttribute("type", "number");
    input.setAttribute("min", "1");
    input.setAttribute("max", String(EPISODE_MAX));
    input.setAttribute("step", "1");
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("aria-label", label);
    input.setAttribute("value", String(value));
    input.value = String(value);
    field.append(tag, input);
    return { field, input };
  };
  const seasonField = makeInput("Season", "S", current ? current.season : 1);
  const episodeField = makeInput("Episode", "E", current ? current.episode : 1);
  const seasonInput = seasonField.input;
  const episodeInput = episodeField.input;
  const setButton = documentLike.createElement("button");
  setButton.className = "ts-follow-up-set ts-episode-set bp3-button bp3-small";
  setButton.setAttribute("type", "button");
  setButton.textContent = "Set";
  const chooseInputs = () => {
    const season = parseField(seasonInput.value);
    const episode = parseField(episodeInput.value);
    seasonInput.setAttribute("aria-invalid", season ? "false" : "true");
    episodeInput.setAttribute("aria-invalid", episode ? "false" : "true");
    if (!season || !episode) return;
    decide({ action: "set", season, episode });
  };
  setButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    chooseInputs();
  });
  seasonInput._episodeChoose = chooseInputs;
  episodeInput._episodeChoose = chooseInputs;
  row.append(seasonField.field, episodeField.field, setButton);
  list.append(row);

  function focusables() {
    return Array.from(list.querySelectorAll(FOCUSABLE));
  }

  function moveFocus(target, delta) {
    const items = focusables();
    if (!items.length) return;
    const index = items.indexOf(target);
    const next = items[(index + delta + items.length) % items.length] || items[0];
    next.focus?.({ preventScroll: true });
  }

  function isInput(target) {
    return target === seasonInput || target === episodeInput;
  }

  // Returns true when the menu used the key.
  function handleKey(event) {
    if (event.type !== "keydown") return false;
    const target = event.target;
    if (event.key === "Escape") {
      event.preventDefault();
      decide({ action: "cancel" });
      return true;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      moveFocus(target, event.shiftKey ? -1 : 1);
      return true;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (isInput(target)) return false;
      if (target === setButton) return true;
      event.preventDefault();
      moveFocus(target, event.key === "ArrowDown" ? 1 : -1);
      return true;
    }
    if (event.key === "Enter" || (event.key === " " && !isInput(target))) {
      if (event.repeat) {
        event.preventDefault();
        return true;
      }
      const choose = target?._episodeChoose || (target === setButton ? chooseInputs : null);
      if (!choose) return false;
      event.preventDefault();
      choose();
      return true;
    }
    return false;
  }

  return {
    element: list,
    handleKey,
    focusFirst() {
      focusables()[0]?.focus?.({ preventScroll: true });
    },
    cancel() {
      decide({ action: "cancel" });
    },
    get decided() {
      return decided;
    },
  };
}
