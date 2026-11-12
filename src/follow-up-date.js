// Waiting / In Review follow-up date.
//
// After the status chooser sets one of these statuses on a Better Tasks task,
// the chooser asks when to check back. The chosen date becomes the task's
// Better Tasks due date, written through Better Tasks' own `bt_modify` tool:
// it updates the existing due attribute block in place (same uid), formats
// the date the way the user configured Better Tasks, logs its own activity
// line and refreshes its dashboard. This module never writes a block itself.

export const FOLLOW_UP_STATUS_KEYS = Object.freeze(["WAITING", "IN_REVIEW"]);

const BETTER_TASKS_TOOLS_ID = "better-tasks";
const DEFAULT_DUE_ATTRIBUTE = "BT_attrDue";
const TODO_TOKEN_RE = /^\s*(?:\{\{\s*(?:\[\[\s*)?TODO(?:\s*\]\])?\s*\}\}|TODO)(?=$|[ \t\r\n])/i;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CHILDREN_PULL_PATTERN =
  "[:block/uid :block/string {:block/children [:block/uid :block/string]}]";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isFollowUpStatusKey(statusKey) {
  return FOLLOW_UP_STATUS_KEYS.includes(statusKey);
}

export function localNoon(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = localNoon(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function toIsoDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseIsoDate(value) {
  const match = typeof value === "string" ? value.trim().match(ISO_DATE_RE) : null;
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (toIsoDate(d) !== match[0]) return null;
  return d;
}

function ordinal(day) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  return `${day}${["th", "st", "nd", "rd"][day % 10] || "th"}`;
}

export function dailyNoteTitle(date) {
  return `${MONTHS[date.getMonth()]} ${ordinal(date.getDate())}, ${date.getFullYear()}`;
}

function sameDay(a, b) {
  return toIsoDate(a) === toIsoDate(b);
}

export function shortDateLabel(date, today = new Date()) {
  const base = `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === today.getFullYear() ? base : `${base}, ${date.getFullYear()}`;
}

export function quickPicks(today = new Date()) {
  const tomorrow = addDays(today, 1);
  const inThree = addDays(today, 3);
  const nextWeek = addDays(today, 7);
  return [
    { id: "tomorrow", label: "Tomorrow", hint: SHORT_DAYS[tomorrow.getDay()], date: tomorrow },
    { id: "in-3-days", label: "In 3 days", hint: SHORT_DAYS[inThree.getDay()], date: inThree },
    { id: "next-week", label: "Next week", hint: shortDateLabel(nextWeek, today), date: nextWeek },
  ];
}

// Parses a due attribute value as Better Tasks writes it: `[[November 5th, 2025]]`,
// `[[2025-11-05]]` or a bare `2025-11-05`.
export function parseDueValue(value, roamAlphaAPI = null) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const inner = raw.startsWith("[[") && raw.endsWith("]]") ? raw.slice(2, -2).trim() : raw;
  const iso = parseIsoDate(inner);
  if (iso) return iso;
  const toDate = roamAlphaAPI?.util?.pageTitleToDate;
  if (typeof toDate === "function") {
    try {
      const d = toDate.call(roamAlphaAPI.util, inner);
      if (d instanceof Date && !Number.isNaN(d.getTime())) return localNoon(d);
    } catch (_) {}
  }
  const match = inner.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})$/);
  if (!match) return null;
  const month = MONTHS.findIndex((name) => name.toLowerCase() === match[1].toLowerCase());
  if (month < 0) return null;
  const d = new Date(Number(match[3]), month, Number(match[2]), 12);
  return d.getMonth() === month ? d : null;
}

function findTool(windowLike, name) {
  const tools = windowLike?.RoamExtensionTools?.[BETTER_TASKS_TOOLS_ID]?.tools;
  if (!Array.isArray(tools)) return null;
  const tool = tools.find((entry) => entry?.name === name);
  return typeof tool?.execute === "function" ? tool : null;
}

// Better Tasks must offer both a v2 classifier and its modify tool; without
// them there is no prompt.
export function resolveFollowUpSurface(windowLike) {
  const classifyBlock = windowLike?.betterTasks?.v2?.classifyBlock;
  const pull = windowLike?.roamAlphaAPI?.data?.async?.pull;
  const modify = findTool(windowLike, "bt_modify");
  if (typeof classifyBlock !== "function" || typeof pull !== "function" || !modify) return null;
  return {
    classifyBlock: (uid) => classifyBlock.call(windowLike.betterTasks.v2, uid),
    pull: (pattern, eid) => pull.call(windowLike.roamAlphaAPI.data.async, pattern, eid),
    modify,
    attributes: findTool(windowLike, "bt_get_attributes"),
  };
}

function valueAt(value, key, fallback = null) {
  if (!value || typeof value !== "object") return fallback;
  const plain = key.replace(/^:/, "");
  return value[key] ?? value[plain] ?? value[plain.replace(/^block\//, "")] ?? fallback;
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function dueAttributeNames(surface) {
  const names = [DEFAULT_DUE_ATTRIBUTE];
  if (!surface.attributes) return names;
  try {
    const schema = await surface.attributes.execute({});
    const due = Array.isArray(schema?.attributes)
      ? schema.attributes.find((entry) => entry?.id === "due")
      : null;
    const configured = [due?.name, ...(Array.isArray(due?.aliases) ? due.aliases : [])]
      .filter((name) => typeof name === "string" && name.trim())
      .map((name) => name.trim());
    if (configured.length) return [...new Set(configured)];
  } catch (_) {}
  return names;
}

function findDueChild(children, names) {
  const patterns = names.map((name) => new RegExp(`^\\s*${escapeRegex(name)}::\\s*`, "i"));
  for (const child of Array.isArray(children) ? children : []) {
    const string = valueAt(child, ":block/string", "");
    const uid = valueAt(child, ":block/uid", null);
    if (typeof string !== "string" || typeof uid !== "string") continue;
    const pattern = patterns.find((re) => re.test(string));
    if (pattern) return { uid, value: string.replace(pattern, "").trim() };
  }
  return null;
}

async function readDueChild(surface, uid) {
  const block = await surface.pull(CHILDREN_PULL_PATTERN, [":block/uid", uid]);
  if (valueAt(block, ":block/uid", null) !== uid) return { block: null, due: null };
  const names = await dueAttributeNames(surface);
  return { block, due: findDueChild(valueAt(block, ":block/children", []), names) };
}

function result(eligible, reason, fields = {}) {
  return { eligible, reason, ...fields };
}

// Decides whether to ask, and reads the current due date to show.
export async function readFollowUpState({ windowLike, uid }) {
  const surface = resolveFollowUpSurface(windowLike);
  if (!surface) return result(false, "better-tasks-unavailable");
  if (typeof uid !== "string" || !uid) return result(false, "invalid-uid");
  try {
    const classification = await surface.classifyBlock(uid);
    if (classification?.kind !== "task") return result(false, "not-a-better-tasks-task");
    const { block, due } = await readDueChild(surface, uid);
    if (!block) return result(false, "block-not-found");
    if (!TODO_TOKEN_RE.test(valueAt(block, ":block/string", ""))) {
      return result(false, "not-an-open-task");
    }
    const existingDue = due
      ? { uid: due.uid, value: due.value, date: parseDueValue(due.value, windowLike?.roamAlphaAPI) }
      : null;
    return result(true, "ask", { existingDue });
  } catch (error) {
    return result(false, "read-failed", { error });
  }
}

// One Better Tasks call. Re-reads afterwards to report what landed.
export async function writeFollowUpDate({ windowLike, uid, date }) {
  const surface = resolveFollowUpSurface(windowLike);
  if (!surface) return { status: "rejected", reason: "better-tasks-unavailable" };
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return { status: "rejected", reason: "invalid-date" };
  }
  let before = null;
  try {
    before = (await readDueChild(surface, uid)).due;
  } catch (_) {}
  const target = localNoon(date);
  if (before && sameDay(parseDueValue(before.value, windowLike?.roamAlphaAPI) || new Date(NaN), target)) {
    return { status: "unchanged", reason: "same-date", dueUid: before.uid };
  }
  let response;
  try {
    response = await surface.modify.execute({ uid, attributes: { due: toIsoDate(target) } });
  } catch (error) {
    return { status: "unknown", reason: "better-tasks-modify-threw", error };
  }
  if (response?.error) return { status: "rejected", reason: "better-tasks-refused", error: response.error };
  let after = null;
  try {
    after = (await readDueChild(surface, uid)).due;
  } catch (_) {}
  const landed = after ? parseDueValue(after.value, windowLike?.roamAlphaAPI) : null;
  if (!after || !landed || !sameDay(landed, target)) {
    return { status: "unknown", reason: "due-not-confirmed", response };
  }
  return {
    status: "updated",
    dueUid: after.uid,
    value: after.value,
    sameUid: before ? before.uid === after.uid : null,
  };
}

// ---------------------------------------------------------------------------
// The prompt: menu items that replace the chooser's status list.

const FOCUSABLE = ".ts-follow-up-item, .ts-follow-up-date";

function menuItem(documentLike, { label, hint = "", className = "", action, onChoose }) {
  const li = documentLike.createElement("li");
  const item = documentLike.createElement("a");
  item.className = `ts-status-choice ts-follow-up-item bp3-menu-item ${className}`.trim();
  item.setAttribute("role", "menuitem");
  item.setAttribute("tabindex", "0");
  item.setAttribute("data-follow-up-action", action);
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
  item._followUpChoose = onChoose;
  li.append(item);
  return li;
}

export function createFollowUpPrompt({ document: documentLike, statusLabel, existingDue, today = new Date(), onDecision }) {
  let decided = false;
  const decide = (decision) => {
    if (decided) return;
    decided = true;
    onDecision(decision);
  };

  const list = documentLike.createElement("ul");
  list.className = "ts-status-choice-list ts-follow-up bp3-menu";
  list.setAttribute("role", "menu");
  list.setAttribute("aria-label", "Follow-up date");
  list.setAttribute("data-task-status-follow-up", "true");

  const header = documentLike.createElement("li");
  header.className = "ts-status-chooser-count ts-follow-up-header bp3-menu-header";
  const title = documentLike.createElement("h6");
  title.textContent = statusLabel ? `${statusLabel} · check back?` : "Check back?";
  header.append(title);
  list.append(header);

  const existingDate = existingDue?.date || null;
  if (existingDue) {
    const shown = existingDate ? shortDateLabel(existingDate, today) : existingDue.value;
    list.append(
      menuItem(documentLike, {
        label: `Keep due ${shown}`,
        className: "ts-follow-up-keep",
        action: "keep",
        onChoose: () => decide({ action: "keep" }),
      })
    );
  }

  for (const pick of quickPicks(today)) {
    const replacing = existingDate && sameDay(existingDate, pick.date);
    if (replacing) continue;
    list.append(
      menuItem(documentLike, {
        label: pick.label,
        hint: pick.hint,
        action: pick.id,
        onChoose: () => decide({ action: "set", date: pick.date }),
      })
    );
  }

  const dateRow = documentLike.createElement("li");
  dateRow.className = "ts-follow-up-date-row";
  const input = documentLike.createElement("input");
  input.className = "ts-follow-up-date bp3-input bp3-small";
  input.setAttribute("type", "date");
  input.setAttribute("aria-label", "Pick a date");
  input.setAttribute("min", toIsoDate(today));
  input.setAttribute("value", toIsoDate(existingDate || addDays(today, 1)));
  input.value = toIsoDate(existingDate || addDays(today, 1));
  const setButton = documentLike.createElement("button");
  setButton.className = "ts-follow-up-set bp3-button bp3-small";
  setButton.setAttribute("type", "button");
  setButton.textContent = "Set";
  const chooseInputDate = () => {
    const date = parseIsoDate(input.value);
    if (!date) {
      input.setAttribute("aria-invalid", "true");
      return;
    }
    if (existingDate && sameDay(existingDate, date)) decide({ action: "keep" });
    else decide({ action: "set", date });
  };
  setButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    chooseInputDate();
  });
  input._followUpChoose = chooseInputDate;
  dateRow.append(input, setButton);
  list.append(dateRow);

  list.append(
    menuItem(documentLike, {
      label: "Skip",
      className: "ts-follow-up-skip",
      action: "skip",
      onChoose: () => decide({ action: "skip" }),
    })
  );

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

  // Called for every key event aimed at the prompt (the caller stops it from
  // reaching Roam). Returns true when the prompt used the key.
  function handleKey(event) {
    if (event.type !== "keydown") return false;
    const target = event.target;
    if (event.key === "Escape") {
      event.preventDefault();
      decide({ action: "cancel" });
      return true;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (target === input) return false;
      event.preventDefault();
      moveFocus(target, event.key === "ArrowDown" ? 1 : -1);
      return true;
    }
    if (event.key === "Enter" || (event.key === " " && target !== input)) {
      const choose = target?._followUpChoose || (target === setButton ? chooseInputDate : null);
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
