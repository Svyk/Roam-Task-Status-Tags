import { createBetterTasksStatusRouter } from "./better-tasks-bridge.js";
import { createLifecycle } from "./lifecycle.js";
import {
  createCertifiedBlockStringWriter,
  createFreshBlockStringReader,
} from "./status-write.js";
import {
  buildStatusCheckboxColors,
  buildStatusPillColors,
  CHECKBOX_UID_ATTRIBUTE,
  clearOwnedStatusCheckboxes,
  clearOwnedStatusPillPresentations,
  clearStatusPillPresentation,
  relativeLuminance,
  syncStatusPresentationForPill,
} from "./status-checkbox.js";
import { createStatusPeekController } from "./status-peek.js";

// Task Status Tags (Roam Depot dev extension)
//
// Stores task status as an inline tag on the same line as TODO:
//   {{[[TODO]]}} #[[task-status/Active]] Do the thing
//
// Interaction:
// - Click the status tag to choose a status
// - Shift+click the status tag to remove the status

const GLOBAL_KEY = "__svyk_roamTaskStatusTags";
const BUNDLED_VERSION =
  typeof __TASK_STATUS_VERSION__ !== "undefined"
    ? __TASK_STATUS_VERSION__
    : "development";

export function resolveTaskStatusRuntimeVersion(extensionVersion) {
  const reported = typeof extensionVersion === "string" ? extensionVersion.trim() : "";
  return reported && reported.toUpperCase() !== "DEV" ? reported : BUNDLED_VERSION;
}

const TEXT_HELPER_DEFAULTS = {
  cycleOrder: ["ACTIVE", "WAITING", "HOLDING", "INCUBATING", "ALERT", "CANCELLED"],
  todoPatterns: ["{{[[TODO]]}}", "{{TODO}}"],
  donePatterns: ["{{[[DONE]]}}", "{{DONE}}"],
  todoCanonical: "{{[[TODO]]}}",
  statusTagPrefix: "task-status/",
  statusNames: {
    ACTIVE: "Active",
    WAITING: "Waiting",
    HOLDING: "Holding",
    INCUBATING: "Incubating",
    ALERT: "Alert",
    CANCELLED: "Cancelled",
  },
};

function buildDefaultTextStatuses() {
  const statuses = {};
  TEXT_HELPER_DEFAULTS.cycleOrder.forEach((key) => {
    const name = TEXT_HELPER_DEFAULTS.statusNames[key] || key;
    const tagTitle = `${TEXT_HELPER_DEFAULTS.statusTagPrefix}${name}`;
    statuses[key] = {
      name,
      label: name,
      tagTitle,
      tagTitles: [tagTitle],
    };
  });
  return statuses;
}

export function createTaskStatusTextHelpers(options = {}) {
  const cycleOrder = options.cycleOrder || TEXT_HELPER_DEFAULTS.cycleOrder;
  const statusKeys = uniqueTextHelperStrings([
    ...cycleOrder,
    ...Object.keys(options.statuses || {}),
    ...(options.statusKeys || []),
  ]);
  const todoPatterns = options.todoPatterns || TEXT_HELPER_DEFAULTS.todoPatterns;
  const donePatterns = options.donePatterns || TEXT_HELPER_DEFAULTS.donePatterns;
  const todoCanonical = options.todoCanonical || TEXT_HELPER_DEFAULTS.todoCanonical;
  const statuses = options.statuses || buildDefaultTextStatuses();

  function uniqueTextHelperStrings(list) {
    const out = [];
    const seen = new Set();
    (list || []).forEach((v) => {
      const s = String(v || "").trim();
      if (!s) return;
      if (seen.has(s)) return;
      seen.add(s);
      out.push(s);
    });
    return out;
  }

  function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function containsAny(text, patterns) {
    if (!text || typeof text !== "string") return false;
    return patterns.some((p) => text.includes(p));
  }

  function isBoundaryChar(ch) {
    return !ch || /\s|[\.,;:!\?\)\]\}]/.test(ch);
  }

  function getStatusTagTitles(statusKey) {
    const status = statuses?.[statusKey];
    if (!status) return [];
    if (Array.isArray(status.tagTitles)) return status.tagTitles;
    return status.tagTitle ? [status.tagTitle] : [];
  }

  function hasPlainHashtagToken(text, tagTitle) {
    if (!text || typeof text !== "string") return false;
    const t = escapeRegex(tagTitle);
    const re = new RegExp(`(^|\\s)#${t}(?=\\s|$|[\\.,;:!\\?\\)\\]\\}])`, "g");
    return re.test(text);
  }

  function matchAnyPatternAt(text, index, patterns) {
    for (const token of patterns || []) {
      if (text.startsWith(token, index)) {
        return { token, start: index, end: index + token.length };
      }
    }
    return null;
  }

  function skipHorizontalWhitespace(text, index) {
    let i = index;
    while (text[i] === " " || text[i] === "\t") i += 1;
    return i;
  }

  function stripPrefixSeparator(text) {
    return String(text || "").replace(/^[ \t]+/, "");
  }

  function matchStatusTagAt(text, index) {
    for (const statusKey of statusKeys) {
      for (const tagTitle of getStatusTagTitles(statusKey)) {
        const bracket = `#[[${tagTitle}]]`;
        if (text.startsWith(bracket, index)) {
          return {
            token: bracket,
            statusKey,
            start: index,
            end: index + bracket.length,
            kind: "tag",
          };
        }

        const plain = `#${tagTitle}`;
        if (text.startsWith(plain, index) && isBoundaryChar(text[index + plain.length])) {
          return {
            token: plain,
            statusKey,
            start: index,
            end: index + plain.length,
            kind: "tag",
          };
        }
      }
    }
    return null;
  }

  function matchManagedStatusAt(text, index) {
    return matchStatusTagAt(text, index);
  }

  function parseManagedPrefix(text) {
    const original = String(text || "");
    const leadingMatch = original.match(/^[ \t]*/);
    const leading = leadingMatch ? leadingMatch[0] : "";
    let index = leading.length;

    const todo = matchAnyPatternAt(original, index, todoPatterns);
    const done = matchAnyPatternAt(original, index, donePatterns);
    const task = todo
      ? { ...todo, kind: "todo" }
      : done
        ? { ...done, kind: "done" }
        : null;

    if (!task) {
      return {
        managed: false,
        original,
        leading: "",
        body: original,
        taskKind: null,
        taskToken: null,
        currentStatus: null,
        hadStatus: false,
        hadTaskToken: false,
      };
    }

    const afterTask = task.end;
    const statusStart = skipHorizontalWhitespace(original, afterTask);
    const status = matchManagedStatusAt(original, statusStart);
    const bodyStart = status ? status.end : afterTask;

    return {
      managed: true,
      original,
      leading,
      body: stripPrefixSeparator(original.slice(bodyStart)),
      taskKind: task.kind,
      taskToken: task.token,
      currentStatus: status?.statusKey || null,
      hadStatus: Boolean(status),
      hadTaskToken: true,
    };
  }

  function joinManagedPrefix({ leading = "", taskToken, statusTag, body }) {
    const prefix = [taskToken, statusTag].filter(Boolean).join(" ");
    const bodyText = String(body || "");
    if (!bodyText) return `${leading}${prefix}`;
    if (/^[\r\n]/.test(bodyText)) return `${leading}${prefix}${bodyText}`;
    return `${leading}${prefix} ${bodyText}`;
  }

  function hasStatusTagAnywhere(text, statusKey) {
    const s = String(text || "");
    for (const tagTitle of getStatusTagTitles(statusKey)) {
      if (s.includes(`#[[${tagTitle}]]`) || hasPlainHashtagToken(s, tagTitle)) {
        return true;
      }
    }
    return parseManagedPrefix(s).currentStatus === statusKey;
  }

  function hasManagedStatusTag(text, statusKey) {
    const parsed = parseManagedPrefix(text);
    return parsed.hadStatus && parsed.currentStatus === statusKey;
  }

  function hasAnyManagedStatusTag(text) {
    return parseManagedPrefix(text).hadStatus;
  }

  function getCurrentStatus(text) {
    return parseManagedPrefix(text).currentStatus;
  }

  function getNextStatus(currentStatus) {
    if (!currentStatus) return cycleOrder[0] || null;
    const idx = cycleOrder.indexOf(currentStatus);
    if (idx === -1) return cycleOrder[0] || null;
    const next = idx + 1;
    return next >= cycleOrder.length ? null : cycleOrder[next];
  }

  function isDoneTask(text) {
    return containsAny(text, donePatterns);
  }

  function isTaskLike(text) {
    const s = String(text || "");
    const parsed = parseManagedPrefix(s);
    return (
      parsed.managed ||
      containsAny(s, todoPatterns) ||
      containsAny(s, donePatterns)
    );
  }

  function applyStatusToText(text, statusKey) {
    const original = String(text || "");
    const parsed = parseManagedPrefix(original);

    const status = statuses?.[statusKey];
    const statusTag = status ? `#[[${status.tagTitle}]]` : "";
    const body = parsed.managed ? parsed.body : original;
    const leading = parsed.managed ? parsed.leading : "";

    return joinManagedPrefix({
      leading,
      taskToken: parsed.managed && parsed.taskToken ? parsed.taskToken : todoCanonical,
      statusTag,
      body,
    });
  }

  function applyStatusToTexts(texts, statusKey) {
    return (Array.isArray(texts) ? texts : []).map((text) =>
      applyStatusToText(text, statusKey)
    );
  }

  function removeStatusFromText(text) {
    const original = String(text || "");
    const parsed = parseManagedPrefix(original);
    if (!parsed.managed || !parsed.hadStatus) return original;

    const taskToken =
      parsed.taskKind === "done" && parsed.taskToken ? parsed.taskToken : todoCanonical;

    return joinManagedPrefix({
      leading: parsed.leading,
      taskToken,
      statusTag: "",
      body: parsed.body,
    });
  }

  function removeSlashCommandFragment(blockString, indexes) {
    let text = String(blockString || "");
    if (!Array.isArray(indexes) || indexes.length !== 2) return text;

    const [start, end] = indexes;
    if (
      typeof start !== "number" ||
      typeof end !== "number" ||
      start < 0 ||
      end < start ||
      end > text.length
    ) {
      return text;
    }

    let removeStart = start;
    if (removeStart > 0 && text[removeStart - 1] === "/") {
      removeStart -= 1;
    }

    return text.slice(0, removeStart) + text.slice(end);
  }

  return {
    applyStatusToText,
    applyStatusToTexts,
    getCurrentStatus,
    getNextStatus,
    hasAnyManagedStatusTag,
    hasManagedStatusTag,
    hasStatusTagAnywhere,
    isDoneTask,
    isTaskLike,
    parseManagedPrefix,
    removeSlashCommandFragment,
    removeStatusFromText,
  };
}

function uniqueUidStrings(list) {
  const out = [];
  const seen = new Set();
  (list || []).forEach((v) => {
    const s = String(v || "").trim();
    if (!s) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

function normalizeTargetUid(entry) {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return null;
  return entry["block-uid"] || entry.uid || entry["uid"] || null;
}

export async function resolveTaskStatusTargetUids({
  roamAlphaAPI,
  context = null,
  primaryUid = null,
  fallbackToFocused = true,
} = {}) {
  const contextBlocks = Array.isArray(context?.blocks) ? context.blocks : [];
  const contextBlockUids = uniqueUidStrings(contextBlocks.map(normalizeTargetUid));
  if (contextBlockUids.length) return contextBlockUids;

  const ui = roamAlphaAPI?.ui;

  try {
    const individual = await ui?.individualMultiselect?.getSelectedUids?.();
    const individualUids = uniqueUidStrings(
      (Array.isArray(individual) ? individual : []).map(normalizeTargetUid)
    );
    if (individualUids.length) return individualUids;
  } catch (_) {}

  try {
    const dragSelected = await ui?.multiselect?.getSelected?.();
    const dragUids = uniqueUidStrings(
      (Array.isArray(dragSelected) ? dragSelected : []).map(normalizeTargetUid)
    );
    if (dragUids.length) return dragUids;
  } catch (_) {}

  const explicitUid = primaryUid || context?.["block-uid"] || context?.uid || null;
  if (explicitUid) return uniqueUidStrings([explicitUid]);

  if (!fallbackToFocused) return [];

  try {
    const focused = await ui?.getFocusedBlock?.();
    return uniqueUidStrings([normalizeTargetUid(focused)]);
  } catch (_) {
    return [];
  }
}

function createTaskStatusExtension({ extensionAPI }) {
  const TOUCH_LISTENER_OPTIONS = { capture: true, passive: false };
  const STATUS_PILL_SELECTOR = [
    'span.rm-page-ref[data-tag^="task-status/"]',
    'a.rm-page-ref[data-tag^="task-status/"]',
    "span.rm-page-ref[data-task-status-key]",
    "a.rm-page-ref[data-task-status-key]",
  ].join(", ");
  const RENDER_SCOPE_SELECTOR = ".rm-block__input, .rm-block-ref";
  const EXTENSION_UI_SELECTOR = ".ts-status-portal, .ts-status-names-panel";
  const STATUS_MUTATION_SELECTOR = `${STATUS_PILL_SELECTOR}, .rm-checkbox`;

  const CONFIG = {
    // Active status order. This is replaced by persisted settings during startup.
    cycleOrder: ["ACTIVE", "WAITING", "HOLDING", "INCUBATING", "ALERT", "CANCELLED"],
    shiftClickRemoves: true,
    debug: false,
  };

  const TODO_PATTERNS = ["{{[[TODO]]}}", "{{TODO}}"];
  const DONE_PATTERNS = ["{{[[DONE]]}}", "{{DONE}}"];
  const TODO_CANONICAL = "{{[[TODO]]}}";

  const STATUS_TAG_PREFIX = "task-status/";

  const SETTINGS_KEYS = {
    statusList: "status-list",
    statusColorOverrides: "status-color-overrides",
    styleNativeCheckboxes: "task-status-style-native-checkboxes",
    statusLabelDisplay: "task-status-label-display",
    alertBeacon: "task-status-alert-beacon",
  };

  const STATUS_LABEL_DISPLAY = Object.freeze({
    CHECKBOX_ONLY: "Checkbox only — reveal on intent",
    CHECKBOX_AND_PILL: "Checkbox + status pill",
  });

  const DEFAULT_STATUS_NAMES = {
    ACTIVE: "Active",
    WAITING: "Waiting",
    HOLDING: "Holding",
    INCUBATING: "Incubating",
    ALERT: "Alert",
    CANCELLED: "Cancelled",
  };

  const DEFAULT_STATUS_LIST = [
    { key: "ACTIVE", name: "Active" },
    { key: "WAITING", name: "Waiting" },
    { key: "HOLDING", name: "Holding" },
    { key: "INCUBATING", name: "Incubating" },
    { key: "ALERT", name: "Alert" },
    { key: "CANCELLED", name: "Cancelled" },
  ];

  const DEFAULT_STATUS_BASE_COLORS = {
    ACTIVE: "#14b8a6",
    WAITING: "#eab308",
    HOLDING: "#94a3b8",
    INCUBATING: "#6366f1",
    ALERT: "#f43f5e",
    CANCELLED: "#1e293b",
  };

  const DEFAULT_CUSTOM_STATUS_BASE_COLOR = "#64748b";

  const STATUS_COLOR_PRESETS = [
    { name: "Teal", value: "#14b8a6" },
    { name: "Rose", value: "#f43f5e" },
    { name: "Amber", value: "#eab308" },
    { name: "Blue", value: "#3b82f6" },
    { name: "Indigo", value: "#6366f1" },
    { name: "Violet", value: "#8b5cf6" },
    { name: "Slate", value: "#64748b" },
    { name: "Dark", value: "#1e293b" },
  ];

  let statusColorOverrides = loadObjectSetting(SETTINGS_KEYS.statusColorOverrides, {});
  let checkboxStylingEnabled = loadBooleanSetting(
    SETTINGS_KEYS.styleNativeCheckboxes,
    true
  );
  let alertBeaconEnabled = loadBooleanSetting(SETTINGS_KEYS.alertBeacon, true);
  let statusLabelDisplay = loadStatusLabelDisplaySetting();
  let colorProbeEl = null;
  let statusColorStyleEl = null;
  let portalRoot = null;

  function ensureColorProbeElement() {
    if (colorProbeEl && colorProbeEl.isConnected) return colorProbeEl;
    try {
      const el = document.createElement("span");
      el.id = "ts-color-probe";
      el.style.position = "fixed";
      el.style.left = "-10000px";
      el.style.top = "-10000px";
      el.style.width = "0";
      el.style.height = "0";
      el.style.padding = "0";
      el.style.margin = "0";
      el.style.border = "0";
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      (portalRoot || document.body).appendChild(el);
      colorProbeEl = el;
      return el;
    } catch (_) {
      return null;
    }
  }

  function normalizeCssColorValue(value) {
    const v = String(value || "").trim();
    return v;
  }

  function cssColorIsSupported(value) {
    const v = normalizeCssColorValue(value);
    if (!v) return false;
    try {
      if (window.CSS?.supports) return window.CSS.supports("color", v);
    } catch (_) {}

    const probe = ensureColorProbeElement();
    if (!probe) return false;
    try {
      probe.style.color = "";
      probe.style.color = v;
      return Boolean(probe.style.color);
    } catch (_) {
      return false;
    }
  }

  function parseCssColorToRgb(value) {
    const v = normalizeCssColorValue(value);
    if (!v) return null;

    const probe = ensureColorProbeElement();
    if (!probe) return null;

    try {
      probe.style.color = "";
      probe.style.color = v;
      if (!probe.style.color) return null;

      const computed = window.getComputedStyle(probe).color;
      const match = computed.match(
        /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/
      );
      if (!match) return null;

      const r = Number(match[1]);
      const g = Number(match[2]);
      const b = Number(match[3]);
      const a = typeof match[4] === "string" ? Number(match[4]) : 1;
      if (![r, g, b, a].every((n) => Number.isFinite(n))) return null;

      return { r, g, b, a };
    } catch (_) {
      return null;
    }
  }

  function readComputedCssColor(element, propertyName) {
    if (!element || !window.getComputedStyle) return null;
    try {
      const styles = window.getComputedStyle(element);
      const raw = propertyName.startsWith("--")
        ? styles?.getPropertyValue?.(propertyName)
        : styles?.[propertyName];
      const parsed = parseCssColorToRgb(raw);
      return parsed && parsed.a !== 0 ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function resolveStatusSurfaces() {
    const lightFallback = { r: 245, g: 248, b: 250 };
    const darkFallback = { r: 32, g: 43, b: 51 };
    let lightSurface = lightFallback;
    let darkSurface = darkFallback;

    const candidates = [];

    const nativeCheckmark = document.querySelector?.(
      ".rm-checkbox.rm-todo:not([data-ts-checkbox-status]) .checkmark"
    );
    const nativeSurface = readComputedCssColor(nativeCheckmark, "backgroundColor");
    if (nativeSurface) candidates.push(nativeSurface);

    const roots = [document.documentElement, document.body].filter(Boolean);
    const tokenNames = ["--svy-surface", "--bp3-surface", "--svy-canvas"];
    tokenNames.forEach((token) => {
      roots.forEach((root) => {
        const color = readComputedCssColor(root, token);
        if (color) candidates.push(color);
      });
    });

    const bodySurface = readComputedCssColor(document.body, "backgroundColor");
    if (bodySurface) candidates.push(bodySurface);

    lightSurface =
      candidates.find((candidate) => relativeLuminance(candidate) >= 0.45) || lightSurface;
    darkSurface =
      candidates.find((candidate) => relativeLuminance(candidate) < 0.45) || darkSurface;

    return { lightSurface, darkSurface };
  }

  function cssString(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function cssStatusKeySelector(statusKey) {
    return cssString(statusKey);
  }

  function getRenderableStatusKeys() {
    return uniqueStrings(Object.keys(STATUSES || {}));
  }

  function getDefaultStatusColor(statusKey) {
    return DEFAULT_STATUS_BASE_COLORS[statusKey] || DEFAULT_CUSTOM_STATUS_BASE_COLOR;
  }

  function deriveStatusPillColorValues(statusKey, entry, surfaces) {
    const base = normalizeCssColorValue(entry?.base) || getDefaultStatusColor(statusKey);
    const text = normalizeCssColorValue(entry?.text);
    const defaultBase = getDefaultStatusColor(statusKey);
    const parsedBase = parseCssColorToRgb(base) || parseCssColorToRgb(defaultBase);
    const parsedText = parseCssColorToRgb(text) || parsedBase;

    return buildStatusPillColors({
      baseRgb: parsedBase || { r: 100, g: 116, b: 139 },
      preferredTextRgb: parsedText || parsedBase,
      lightSurfaceRgb: surfaces?.lightSurface,
      darkSurfaceRgb: surfaces?.darkSurface,
      minimumTextContrast: 4.8,
    });
  }

  function deriveStatusCheckboxColorValues(statusKey, entry, surfaces) {
    const base = normalizeCssColorValue(entry?.base) || getDefaultStatusColor(statusKey);
    const parsedBase = parseCssColorToRgb(base) || parseCssColorToRgb(
      getDefaultStatusColor(statusKey)
    );

    return buildStatusCheckboxColors({
      baseRgb: parsedBase || { r: 100, g: 116, b: 139 },
      lightSurfaceRgb: surfaces?.lightSurface,
      darkSurfaceRgb: surfaces?.darkSurface,
      minimumContrast: 3.2,
    });
  }

  function ensureStatusColorStyleElement() {
    if (statusColorStyleEl && statusColorStyleEl.isConnected) return statusColorStyleEl;
    try {
      const el = document.createElement("style");
      el.id = "ts-dynamic-status-colors";
      (portalRoot || document.body).appendChild(el);
      statusColorStyleEl = el;
      return el;
    } catch (_) {
      return null;
    }
  }

  function clearStatusColorOverrides() {
    if (colorProbeEl?.remove) {
      try {
        colorProbeEl.remove();
      } catch (_) {}
    }
    colorProbeEl = null;

    if (statusColorStyleEl?.remove) {
      try {
        statusColorStyleEl.remove();
      } catch (_) {}
    }
    statusColorStyleEl = null;
  }

  function applyStatusColorOverrides(overrides) {
    clearStatusColorOverrides();

    const dynamicRules = [];
    const statusSurfaces = resolveStatusSurfaces();

    getRenderableStatusKeys().forEach((statusKey) => {
      const entry = overrides?.[statusKey];
      const pillValues = deriveStatusPillColorValues(statusKey, entry, statusSurfaces);
      const checkboxValues = deriveStatusCheckboxColorValues(
        statusKey,
        entry,
        statusSurfaces
      );

      const keySelector = cssStatusKeySelector(statusKey);
      dynamicRules.push(`
span.rm-page-ref[data-task-status-key="${keySelector}"],
a.rm-page-ref[data-task-status-key="${keySelector}"],
.bt-pill[data-task-status-title="task-status/${cssString(STATUSES[statusKey]?.name || "")}"],
.ts-status-pill-preview[data-task-status-key="${keySelector}"],
.ts-status-peek[data-task-status-key="${keySelector}"],
.ts-status-choice-dot[data-task-status-key="${keySelector}"] {
  --ts-status-bg-light: ${pillValues.lightBackgroundCss};
  --ts-status-fg-light: ${pillValues.lightTextCss};
  --ts-status-border-light: ${pillValues.lightBorderCss};
  --ts-status-bg-dark: ${pillValues.darkBackgroundCss};
  --ts-status-fg-dark: ${pillValues.darkTextCss};
  --ts-status-border-dark: ${pillValues.darkBorderCss};
  background-color: var(--ts-status-bg) !important;
  color: var(--ts-status-fg) !important;
  border-color: var(--ts-status-border) !important;
}

.rm-checkbox[data-ts-checkbox-status="${keySelector}"] {
  --ts-checkbox-accent-light: ${checkboxValues.lightAccentCss};
  --ts-checkbox-accent-dark: ${checkboxValues.darkAccentCss};
  --ts-checkbox-wash-light: ${checkboxValues.lightWashCss};
  --ts-checkbox-wash-dark: ${checkboxValues.darkWashCss};
  --ts-checkbox-beacon-light: ${checkboxValues.lightBeaconCss};
  --ts-checkbox-beacon-dark: ${checkboxValues.darkBeaconCss};
}`);
    });

    const styleEl = ensureStatusColorStyleElement();
    if (styleEl) styleEl.textContent = dynamicRules.join("\n");
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function parseMaybeJson(value) {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch (_) {
      return value;
    }
  }

  function loadObjectSetting(key, fallback) {
    if (!extensionAPI?.settings?.get) return fallback;
    const raw = extensionAPI.settings.get(key);
    if (raw === null || typeof raw === "undefined") return fallback;
    const parsed = parseMaybeJson(raw);
    return isPlainObject(parsed) ? parsed : fallback;
  }

  function normalizeBooleanSetting(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (value && typeof value === "object") {
      if (typeof value.target?.checked === "boolean") return value.target.checked;
      if (typeof value.currentTarget?.checked === "boolean") {
        return value.currentTarget.checked;
      }
    }
    if (value === "true" || value === 1 || value === "1") return true;
    if (value === "false" || value === 0 || value === "0") return false;
    return fallback;
  }

  function loadBooleanSetting(key, fallback = false) {
    if (!extensionAPI?.settings?.get) return fallback;
    const raw = extensionAPI.settings.get(key);
    if (raw === null || typeof raw === "undefined") {
      saveSetting(key, fallback);
      return fallback;
    }
    return normalizeBooleanSetting(parseMaybeJson(raw), fallback);
  }

  function normalizeStatusLabelDisplay(value, fallback = STATUS_LABEL_DISPLAY.CHECKBOX_ONLY) {
    const candidate =
      value && typeof value === "object"
        ? value.target?.value ?? value.currentTarget?.value ?? value.value
        : value;
    const normalized = String(candidate || "").trim();
    return Object.values(STATUS_LABEL_DISPLAY).includes(normalized)
      ? normalized
      : fallback;
  }

  function loadStatusLabelDisplaySetting() {
    const fallback = STATUS_LABEL_DISPLAY.CHECKBOX_ONLY;
    if (!extensionAPI?.settings?.get) return fallback;
    const raw = extensionAPI.settings.get(SETTINGS_KEYS.statusLabelDisplay);
    if (raw === null || typeof raw === "undefined") {
      saveSetting(SETTINGS_KEYS.statusLabelDisplay, fallback);
      return fallback;
    }
    return normalizeStatusLabelDisplay(parseMaybeJson(raw), fallback);
  }

  function saveSetting(key, value) {
    if (!extensionAPI?.settings?.set) return;
    try {
      extensionAPI.settings.set(key, value);
    } catch (err) {
      log("Failed saving setting", key, err);
    }
  }

  function isThenable(value) {
    return Boolean(value) && typeof value.then === "function";
  }

  async function saveSettingAsync(key, value) {
    if (!extensionAPI?.settings?.set) return;
    try {
      const res = extensionAPI.settings.set(key, value);
      if (isThenable(res)) await res;
    } catch (err) {
      log("Failed saving setting", key, err);
    }
  }

  function normalizeStatusName(name) {
    return String(name || "").replace(/\s{2,}/g, " ").trim();
  }

  function validateStatusName(name) {
    const normalized = normalizeStatusName(name);
    if (!normalized) return "Name cannot be empty";
    if (normalized.includes("/")) return "Name cannot include '/'";
    if (/[\n\r\t]/.test(normalized)) return "Name cannot include newlines";
    if (normalized.includes("[[") || normalized.includes("]]")) {
      return "Name cannot include '[[', ']]'";
    }
    if (normalized.includes("#")) return "Name cannot include '#'.";
    return null;
  }

  function uniqueStrings(list) {
    const out = [];
    const seen = new Set();
    (list || []).forEach((v) => {
      const s = String(v || "").trim();
      if (!s) return;
      if (seen.has(s)) return;
      seen.add(s);
      out.push(s);
    });
    return out;
  }

  function normalizeStatusKey(key) {
    return String(key || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function normalizeStatusEntry(entry, fallback = {}) {
    const key = normalizeStatusKey(entry?.key ?? fallback.key);
    const fallbackName = fallback.name || DEFAULT_STATUS_NAMES[key] || key;
    const name = normalizeStatusName(entry?.name ?? fallbackName) || fallbackName;
    if (!key || !name) return null;
    return { key, name };
  }

  function normalizeStatusList(list, fallbackList = DEFAULT_STATUS_LIST) {
    const out = [];
    const seen = new Set();
    const source = Array.isArray(list) && list.length ? list : fallbackList;
    (source || []).forEach((entry, index) => {
      const fallback = fallbackList?.[index] || {};
      const normalized = normalizeStatusEntry(entry, fallback);
      if (!normalized || seen.has(normalized.key)) return;
      seen.add(normalized.key);
      out.push(normalized);
    });
    return out.length ? out : DEFAULT_STATUS_LIST.map((entry) => ({ ...entry }));
  }

  function loadStatusList() {
    const stored = parseMaybeJson(extensionAPI?.settings?.get?.(SETTINGS_KEYS.statusList));
    if (Array.isArray(stored) && stored.length) {
      return normalizeStatusList(stored);
    }

    const defaults = normalizeStatusList(DEFAULT_STATUS_LIST);
    saveSetting(SETTINGS_KEYS.statusList, defaults);
    return defaults;
  }

  function generateStatusKey(name) {
    const base =
      normalizeStatusKey(name)
        .replace(/^CUSTOM_/, "")
        .slice(0, 30) || "STATUS";
    const existing = new Set([
      ...statusList.map((entry) => entry.key),
      ...Object.keys(DEFAULT_STATUS_NAMES),
    ]);
    let key = `CUSTOM_${base}`;
    let i = 2;
    while (existing.has(key)) {
      key = `CUSTOM_${base}_${i}`;
      i += 1;
    }
    return key;
  }

  function syncCycleOrderFromStatusList() {
    CONFIG.cycleOrder = statusList.map((entry) => entry.key);
  }

  function getActiveStatusEntry(statusKey) {
    return statusList.find((entry) => entry.key === statusKey) || null;
  }

  function buildStatuses({ list }) {
    const statuses = {};
    (list || []).forEach((entry) => {
      const key = entry.key;
      const fallback = DEFAULT_STATUS_NAMES[key] || entry.name || key;
      const name = normalizeStatusName(entry.name ?? fallback) || fallback;
      const tagTitle = `${STATUS_TAG_PREFIX}${name}`;
      statuses[key] = {
        active: true,
        name,
        label: name,
        tagTitle,
        tagTitles: [tagTitle],
      };
    });

    return statuses;
  }

  function buildTagTitleIndex(statuses) {
    const idx = new Map();
    Object.entries(statuses || {}).forEach(([statusKey, status]) => {
      (status.tagTitles || []).forEach((t) => idx.set(t, statusKey));
    });
    return idx;
  }

  let statusList = loadStatusList();
  syncCycleOrderFromStatusList();
  let STATUSES = buildStatuses({
    list: statusList,
  });

  let statusTagToKey = buildTagTitleIndex(STATUSES);

  function rebuildStatusIndexes() {
    statusList = loadStatusList();
    syncCycleOrderFromStatusList();
    STATUSES = buildStatuses({
      list: statusList,
    });
    statusTagToKey = buildTagTitleIndex(STATUSES);
    applyStatusColorOverrides(statusColorOverrides);
    refreshStatusVisuals(document);
  }

  function rebuildStatusIndexesFromMemory() {
    syncCycleOrderFromStatusList();
    STATUSES = buildStatuses({
      list: statusList,
    });
    statusTagToKey = buildTagTitleIndex(STATUSES);
    applyStatusColorOverrides(statusColorOverrides);
    refreshStatusVisuals(document);
  }

  function escapeDatalogString(text) {
    return String(text || "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, "\\\"");
  }

  function getPageUidByTitle(title) {
    try {
      const t = escapeDatalogString(title);
      return window.roamAlphaAPI.q(`
        [:find ?uid .
         :where
         [?p :node/title "${t}"]
         [?p :block/uid ?uid]]
      `);
    } catch (err) {
      log("Failed to query page uid:", err);
      return null;
    }
  }

  async function renamePageTitle(oldTitle, newTitle) {
    const oldUid = getPageUidByTitle(oldTitle);
    if (!oldUid) return { renamed: false, reason: "missing-old" };

    const newUid = getPageUidByTitle(newTitle);
    if (newUid && newUid !== oldUid) {
      throw new Error(`Page already exists: ${newTitle}`);
    }

    await window.roamAlphaAPI.data.page.update({
      page: { uid: oldUid, title: newTitle },
    });

    return { renamed: true };
  }

  async function setStatusName(statusKey, nextName, { renameExisting } = {}) {
    if (!getActiveStatusEntry(statusKey)) {
      throw new Error(`Unknown status key: ${statusKey}`);
    }

    const error = validateStatusName(nextName);
    if (error) throw new Error(error);

    const desired = normalizeStatusName(nextName);
    const current = STATUSES[statusKey].name;
    if (desired === current) return { changed: false };

    const oldTagTitle = `${STATUS_TAG_PREFIX}${current}`;
    const newTagTitle = `${STATUS_TAG_PREFIX}${desired}`;

    const owner = statusTagToKey.get(newTagTitle);
    if (owner && owner !== statusKey) {
      throw new Error(`Conflicts with existing status: ${newTagTitle}`);
    }

    if (renameExisting) {
      await renamePageTitle(oldTagTitle, newTagTitle);
    }

    statusList = statusList.map((entry) =>
      entry.key === statusKey ? { ...entry, name: desired } : entry
    );

    await saveSettingAsync(SETTINGS_KEYS.statusList, statusList);

    await unregisterAllCommands();
    rebuildStatusIndexesFromMemory();
    await registerAllCommands();

    return { changed: true, oldTagTitle, newTagTitle };
  }

  function validateNewStatusName(name, currentStatusKey = null) {
    const error = validateStatusName(name);
    if (error) return error;
    const desired = normalizeStatusName(name);
    const tagTitle = `${STATUS_TAG_PREFIX}${desired}`;
    const owner = statusTagToKey.get(tagTitle);
    if (owner && owner !== currentStatusKey) {
      return `Conflicts with existing status: ${tagTitle}`;
    }
    return null;
  }

  async function addStatus(nextName) {
    const error = validateNewStatusName(nextName);
    if (error) throw new Error(error);

    const name = normalizeStatusName(nextName);
    const key = generateStatusKey(name);
    statusList = [...statusList, { key, name }];

    await saveSettingAsync(SETTINGS_KEYS.statusList, statusList);
    await unregisterAllCommands();
    rebuildStatusIndexesFromMemory();
    await registerAllCommands();

    return { key, name };
  }

  async function reorderStatus(statusKey, targetKey, placement = "before") {
    const idx = statusList.findIndex((entry) => entry.key === statusKey);
    if (idx === -1) throw new Error(`Unknown status key: ${statusKey}`);

    const targetIdx = statusList.findIndex((entry) => entry.key === targetKey);
    if (targetIdx === -1) throw new Error(`Unknown target status key: ${targetKey}`);
    if (statusKey === targetKey) return { changed: false };

    const next = [...statusList];
    const [entry] = next.splice(idx, 1);
    const remainingTargetIdx = next.findIndex((candidate) => candidate.key === targetKey);
    const insertIdx =
      placement === "after" ? remainingTargetIdx + 1 : remainingTargetIdx;
    next.splice(insertIdx, 0, entry);

    const changed = next.some((candidate, index) => candidate.key !== statusList[index]?.key);
    if (!changed) return { changed: false };

    statusList = next;

    await saveSettingAsync(SETTINGS_KEYS.statusList, statusList);
    await unregisterAllCommands();
    rebuildStatusIndexesFromMemory();
    await registerAllCommands();

    return { changed: true };
  }

  async function deleteStatus(statusKey) {
    if (statusList.length <= 1) {
      throw new Error("At least one status is required.");
    }

    const activeEntry = getActiveStatusEntry(statusKey);
    if (!activeEntry) throw new Error(`Unknown status key: ${statusKey}`);

    statusList = statusList.filter((entry) => entry.key !== statusKey);

    await saveSettingAsync(SETTINGS_KEYS.statusList, statusList);
    await unregisterAllCommands();
    rebuildStatusIndexesFromMemory();
    await registerAllCommands();

    return { deleted: true };
  }

  const registeredCommands = {
    slash: [],
    contextMenu: [],
    msContextMenu: [],
    palette: [],
  };

  const pendingOperations = new Set();

  let pillObserver = null;
  let themeObserver = null;
  let themeMediaQuery = null;
  let themeMediaListener = null;
  let themeRefreshFrame = null;
  let statusChooserEl = null;
  let statusChooserTeardown = null;
  let statusChooserReturnFocusEl = null;
  let statusPeekController = null;

  function log(...args) {
    if (CONFIG.debug) console.log("[TaskStatus]", ...args);
  }

  function getTextHelpers() {
    return createTaskStatusTextHelpers({
      statuses: STATUSES,
      cycleOrder: CONFIG.cycleOrder,
      todoPatterns: TODO_PATTERNS,
      donePatterns: DONE_PATTERNS,
      todoCanonical: TODO_CANONICAL,
    });
  }

  function containsAny(text, patterns) {
    if (!text || typeof text !== "string") return false;
    return patterns.some((p) => text.includes(p));
  }

  function hasStatusTag(text, statusKey) {
    return getTextHelpers().hasStatusTagAnywhere(text, statusKey);
  }

  function hasManagedStatusTag(text, statusKey) {
    return getTextHelpers().hasManagedStatusTag(text, statusKey);
  }

  function hasAnyStatusTag(text) {
    return getTextHelpers().hasAnyManagedStatusTag(text);
  }

  function getStatusDisplayLabelFromTagTitle(tagTitle) {
    if (!tagTitle || typeof tagTitle !== "string") return "";
    if (tagTitle.startsWith(STATUS_TAG_PREFIX)) {
      return tagTitle.slice(STATUS_TAG_PREFIX.length);
    }
    return tagTitle;
  }

  function annotateStatusPillElement(el) {
    if (!el?.getAttribute) return;
    const tagTitle = el.getAttribute("data-tag");
    const statusKey = tagTitle ? statusTagToKey.get(tagTitle) : null;
    if (statusKey) {
      el.setAttribute("data-task-status-key", statusKey);
      el.setAttribute("data-task-status-label", getStatusDisplayLabelFromTagTitle(tagTitle));
    } else {
      el.removeAttribute("data-task-status-key");
      el.removeAttribute("data-task-status-label");
    }
  }

  function elementsIncludingRoot(root, selector) {
    const nodes = [];
    if (root?.matches?.(selector)) nodes.push(root);
    if (root?.querySelectorAll) nodes.push(...root.querySelectorAll(selector));
    return nodes;
  }

  function resolveRefreshScope(root) {
    if (!root || root === document || root === document.body) return root || document;
    if (root.nodeType !== 1) return root.parentElement || document;
    return root.closest?.(RENDER_SCOPE_SELECTOR) || root;
  }

  function clearStatusPillAnnotations(root = document) {
    elementsIncludingRoot(
      root,
      "span.rm-page-ref[data-task-status-key], a.rm-page-ref[data-task-status-key]"
    ).forEach((pill) => {
      clearStatusPillPresentation(pill);
      pill.removeAttribute("data-task-status-key");
      pill.removeAttribute("data-task-status-label");
    });
  }

  function refreshStatusVisuals(root = document) {
    const scope = resolveRefreshScope(root);
    if (!scope?.querySelectorAll && !scope?.matches) return;

    // Fail visibly while the current render is re-certified. A tag is hidden
    // again only after its exact sibling checkbox is positively annotated.
    clearOwnedStatusPillPresentations(scope);
    clearOwnedStatusCheckboxes(scope);
    const pills = elementsIncludingRoot(scope, STATUS_PILL_SELECTOR);
    pills.forEach(annotateStatusPillElement);
    if (!checkboxStylingEnabled) {
      statusPeekController?.refresh?.();
      return;
    }

    const blockStringsByUid = new Map();
    const textHelpers = getTextHelpers();

    pills.forEach((pill) => {
      const tagTitle = pill.getAttribute?.("data-tag");
      const statusKey = pill.getAttribute?.("data-task-status-key");
      if (!tagTitle || !statusKey) return;

      const blockUid = getBlockUidFromElement(pill);
      if (!blockUid) return;
      if (!blockStringsByUid.has(blockUid)) {
        const liveValue = getLiveBlockInputValue(blockUid);
        blockStringsByUid.set(
          blockUid,
          typeof liveValue === "string" ? liveValue : getBlockString(blockUid)
        );
      }

      syncStatusPresentationForPill({
        statusPill: pill,
        enabled: checkboxStylingEnabled,
        alertBeaconEnabled,
        hideManagedPill:
          statusLabelDisplay === STATUS_LABEL_DISPLAY.CHECKBOX_ONLY,
        tagTitle,
        statusTagToKey,
        blockUid,
        blockString: blockStringsByUid.get(blockUid),
        textHelpers,
      });
    });
    statusPeekController?.refresh?.();
  }

  function isStatusPeekEnabled() {
    return (
      checkboxStylingEnabled &&
      statusLabelDisplay === STATUS_LABEL_DISPLAY.CHECKBOX_ONLY
    );
  }

  function setCheckboxStylingEnabled(nextValue) {
    checkboxStylingEnabled = normalizeBooleanSetting(nextValue, checkboxStylingEnabled);
    if (checkboxStylingEnabled) {
      refreshStatusVisuals(document);
      statusPeekController?.setEnabled?.(isStatusPeekEnabled());
    } else {
      // Restore readable metadata before removing either alternate visual cue.
      clearOwnedStatusPillPresentations(document);
      statusPeekController?.setEnabled?.(false);
      clearOwnedStatusCheckboxes(document);
    }
  }

  function setStatusLabelDisplay(nextValue) {
    statusLabelDisplay = normalizeStatusLabelDisplay(nextValue, statusLabelDisplay);
    if (statusLabelDisplay === STATUS_LABEL_DISPLAY.CHECKBOX_AND_PILL) {
      clearOwnedStatusPillPresentations(document);
      statusPeekController?.setEnabled?.(false);
      refreshStatusVisuals(document);
    } else {
      refreshStatusVisuals(document);
      statusPeekController?.setEnabled?.(isStatusPeekEnabled());
    }
  }

  function setAlertBeaconEnabled(nextValue) {
    alertBeaconEnabled = normalizeBooleanSetting(nextValue, alertBeaconEnabled);
    refreshStatusVisuals(document);
  }

  function refreshMutationScopes(mutations) {
    const refreshed = new Set();
    const isInsideExtensionUi = (node) =>
      Boolean(
        node?.nodeType === 1 &&
          (node.matches?.(EXTENSION_UI_SELECTOR) || node.closest?.(EXTENSION_UI_SELECTOR))
      );
    const containsStatusVisual = (node) =>
      Boolean(
        node?.nodeType === 1 &&
          !isInsideExtensionUi(node) &&
          (node.matches?.(STATUS_MUTATION_SELECTOR) ||
            node.querySelector?.(STATUS_MUTATION_SELECTOR))
      );
    const refreshOnce = (node) => {
      if (!node) return;
      const scope = resolveRefreshScope(node);
      if (!scope || refreshed.has(scope)) return;
      refreshed.add(scope);
      refreshStatusVisuals(scope);
    };

    for (const mutation of mutations || []) {
      if (isInsideExtensionUi(mutation.target)) continue;
      if (mutation.type === "attributes") {
        if (
          mutation.attributeName === "data-tag" &&
          containsStatusVisual(mutation.target)
        ) {
          refreshOnce(mutation.target);
        }
        continue;
      }

      for (const node of mutation.addedNodes || []) {
        if (containsStatusVisual(node)) refreshOnce(node);
      }

      const removedStatusVisual = Array.from(mutation.removedNodes || []).some(
        containsStatusVisual
      );
      if (removedStatusVisual) {
        refreshOnce(mutation.target);
      }
    }
  }

  function startStatusPillObserver() {
    if (pillObserver) return;
    if (!document?.body) return;

    pillObserver = new MutationObserver((mutations) => refreshMutationScopes(mutations));

    pillObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tag"],
    });
    refreshStatusVisuals(document);
  }

  function stopStatusPillObserver() {
    if (pillObserver) {
      try {
        pillObserver.disconnect();
      } catch (_) {}
    }
    pillObserver = null;
    clearOwnedStatusPillPresentations(document);
    clearOwnedStatusCheckboxes(document);
    clearStatusPillAnnotations(document);
  }

  function scheduleThemeColorRefresh() {
    if (themeRefreshFrame != null) return;
    const requestFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));
    themeRefreshFrame = requestFrame(() => {
      themeRefreshFrame = null;
      applyStatusColorOverrides(statusColorOverrides);
    });
  }

  function startThemeObserver() {
    if (themeObserver) return;
    themeObserver = new MutationObserver(() => scheduleThemeColorRefresh());
    [document.documentElement, document.body].filter(Boolean).forEach((target) => {
      themeObserver.observe(target, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    });

    try {
      themeMediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)") || null;
      themeMediaListener = () => scheduleThemeColorRefresh();
      if (themeMediaQuery?.addEventListener) {
        themeMediaQuery.addEventListener("change", themeMediaListener);
      } else if (themeMediaQuery?.addListener) {
        themeMediaQuery.addListener(themeMediaListener);
      }
    } catch (_) {
      themeMediaQuery = null;
      themeMediaListener = null;
    }
  }

  function stopThemeObserver() {
    if (themeObserver) {
      try {
        themeObserver.disconnect();
      } catch (_) {}
    }
    themeObserver = null;

    if (themeMediaQuery && themeMediaListener) {
      try {
        if (themeMediaQuery.removeEventListener) {
          themeMediaQuery.removeEventListener("change", themeMediaListener);
        } else if (themeMediaQuery.removeListener) {
          themeMediaQuery.removeListener(themeMediaListener);
        }
      } catch (_) {}
    }
    themeMediaQuery = null;
    themeMediaListener = null;

    if (themeRefreshFrame != null) {
      const cancelFrame = window.cancelAnimationFrame || window.clearTimeout;
      cancelFrame?.(themeRefreshFrame);
    }
    themeRefreshFrame = null;
  }

  function getBlockString(blockUid) {
    try {
      const blockData = window.roamAlphaAPI.data.pull(
        "[:block/string]",
        [":block/uid", blockUid]
      );
      return blockData?.[":block/string"] ?? null;
    } catch (err) {
      log("Error getting block string:", err);
      return null;
    }
  }

  function getLiveBlockInputValue(blockUid) {
    try {
      const active = document.activeElement;
      if (active && typeof active.value === "string") {
        const id = active.id || "";
        if (id.endsWith(blockUid)) return active.value;
      }

      const byId = document.getElementById(`block-input-${blockUid}`);
      if (byId && typeof byId.value === "string") return byId.value;

      const bySuffix = document.querySelector(`textarea[id$="${blockUid}"]`);
      if (bySuffix && typeof bySuffix.value === "string") return bySuffix.value;
    } catch (_) {}

    return null;
  }

  async function updateBlock(blockUid, newText) {
    await window.roamAlphaAPI.data.block.update({
      block: { uid: blockUid, string: newText },
    });
  }

  const readBlockStringFresh = createFreshBlockStringReader(window.roamAlphaAPI);
  const certifiedBlockWriter = createCertifiedBlockStringWriter({
    readFresh: readBlockStringFresh,
    updateBlock,
    getLiveEditorString: getLiveBlockInputValue,
  });
  const statusWriteRouter = createBetterTasksStatusRouter({
    windowLike: window,
    directWriter: certifiedBlockWriter,
  });

  function getCurrentStatus(text) {
    return getTextHelpers().getCurrentStatus(text);
  }

  function getNextStatus(currentStatus) {
    return getTextHelpers().getNextStatus(currentStatus);
  }

  function isDoneTask(text) {
    return getTextHelpers().isDoneTask(text);
  }

  function isTaskLike(text) {
    return getTextHelpers().isTaskLike(text);
  }

  function applyStatusToText(text, statusKey) {
    return getTextHelpers().applyStatusToText(text, statusKey);
  }

  function removeStatusFromText(text) {
    return getTextHelpers().removeStatusFromText(text);
  }

  async function getOperationTargetUids({ primaryUid = null, context = null } = {}) {
    return await resolveTaskStatusTargetUids({
      roamAlphaAPI: window.roamAlphaAPI,
      context,
      primaryUid,
    });
  }

  async function setBlockStatus(
    blockUid,
    statusKey,
    { editorString, expectedLiveEditorString } = {}
  ) {
    if (!blockUid) return { status: "rejected", didWrite: false, reason: "missing-uid" };
    if (statusKey != null && !STATUSES[statusKey]?.active) {
      return { status: "rejected", didWrite: false, reason: "inactive-status" };
    }
    if (pendingOperations.has(blockUid)) {
      return { status: "rejected", didWrite: false, reason: "operation-pending" };
    }

    let expectedString;
    try {
      expectedString = await readBlockStringFresh(blockUid);
    } catch (error) {
      return { status: "unknown", didWrite: false, reason: "fresh-read-failed", error };
    }
    if (expectedString === null) {
      return { status: "rejected", didWrite: false, reason: "block-not-found" };
    }

    const hasEditorHandoff =
      editorString !== undefined || expectedLiveEditorString !== undefined;
    if (
      hasEditorHandoff &&
      (typeof editorString !== "string" || typeof expectedLiveEditorString !== "string")
    ) {
      return { status: "rejected", didWrite: false, reason: "invalid-editor-handoff" };
    }
    const sourceString = hasEditorHandoff ? editorString : expectedString;

    const newText =
      statusKey === null
        ? removeStatusFromText(sourceString)
        : applyStatusToText(sourceString, statusKey);

    if (newText === expectedString) {
      return { status: "unchanged", didWrite: false, reason: "already-current", string: expectedString };
    }

    pendingOperations.add(blockUid);
    try {
      const outcome = await statusWriteRouter.apply({
        uid: blockUid,
        expectedString,
        nextString: newText,
        statusTagTitle: statusKey === null ? null : STATUSES[statusKey].tagTitle,
        expectedLiveEditorString,
        editorString,
      });
      if (!["updated", "unchanged"].includes(outcome?.status)) {
        console.warn("[TaskStatus] Status edit refused", {
          uid: blockUid,
          reason: outcome?.reason || "unknown",
        });
      }
      return outcome;
    } finally {
      pendingOperations.delete(blockUid);
    }
  }

  async function setStatusForTargets(primaryUid, statusKey, context = null) {
    const targets = await getOperationTargetUids({ primaryUid, context });
    await setStatusForBlockUids(targets, statusKey);
  }

  async function setStatusForBlockUids(targets, statusKey) {
    const blockUids = uniqueStrings(targets || []);
    for (const blockUid of blockUids) {
      await setBlockStatus(blockUid, statusKey);
    }
  }

  async function cycleBlockStatus(blockUid) {
    try {
      const blockString = await readBlockStringFresh(blockUid);
      if (blockString === null) return { status: "rejected", didWrite: false, reason: "block-not-found" };

      if (isDoneTask(blockString)) return;

      const current = getCurrentStatus(blockString);
      const next = getNextStatus(current);
      return await setBlockStatus(blockUid, next);
    } catch (error) {
      return { status: "unknown", didWrite: false, reason: "fresh-read-failed", error };
    }
  }

  async function cycleStatusForTargets(primaryUid, context = null) {
    const targets = await getOperationTargetUids({ primaryUid, context });
    for (const blockUid of targets) {
      await cycleBlockStatus(blockUid);
    }
  }

  function extractUid(idString) {
    if (!idString) return null;
    const match = idString.match(/([A-Za-z0-9_-]{9})$/);
    return match ? match[1] : null;
  }

  function getBlockUidFromDomElement(element) {
    if (!element) return null;

    const withDataUid = element.closest?.("[data-uid]");
    if (withDataUid) {
      const uid = withDataUid.getAttribute("data-uid");
      if (uid) return uid;
    }

    const blockInput =
      element.closest?.("[id^='block-input-']") ||
      element
        .closest?.(".roam-block-container")
        ?.querySelector("[id^='block-input-']");
    if (blockInput) {
      const uid = extractUid(blockInput.id);
      if (uid) return uid;
    }

    const roamBlock = element.closest?.(".roam-block");
    if (roamBlock) {
      return roamBlock.getAttribute("data-uid") || roamBlock.dataset?.uid || null;
    }

    return null;
  }

  function getBlockUidFromElement(element) {
    if (!element) return null;

    const domUtil = window.roamAlphaAPI?.util?.dom;
    if (domUtil?.blockUidFromTarget) {
      try {
        const uid = domUtil.blockUidFromTarget(element);
        if (uid) return uid;
      } catch (_) {}
    }

    return getBlockUidFromDomElement(element);
  }

  function getStatusKeyFromElement(target) {
    if (!target) return null;

    // New: status tag element
    const tagEl = getStatusPillElement(target);
    if (tagEl) {
      const tagTitle = tagEl.getAttribute("data-tag");
      if (tagTitle && statusTagToKey.has(tagTitle)) {
        return statusTagToKey.get(tagTitle);
      }
      const annotatedKey = tagEl.getAttribute("data-task-status-key");
      if (annotatedKey && STATUSES[annotatedKey]) return annotatedKey;
    }

    return null;
  }

  function getStatusPillElement(target) {
    if (!target?.closest) return null;
    return (
      target.closest("span.rm-page-ref[data-tag]") ||
      target.closest("a.rm-page-ref[data-tag]") ||
      target.closest("span.rm-page-ref[data-task-status-key]") ||
      target.closest("a.rm-page-ref[data-task-status-key]")
    );
  }

  function stopRoamNavigation(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }

  function getStatusEventContext(event) {
    const target = event.target;
    const statusKey = getStatusKeyFromElement(target);
    if (!statusKey) return null;

    const anchorEl = getStatusPillElement(target);

    const blockUid = getBlockUidFromElement(target);
    if (!blockUid) return null;

    const blockString = getBlockString(blockUid);
    if (blockString === null) return null;

    // Guard: only intercept the managed status slot. A later task-status tag in
    // prose should stay navigable and should not be treated as a task control.
    const isManagedStatus = hasManagedStatusTag(blockString, statusKey);
    if (!isManagedStatus) return null;

    // Guard: only treat status tags as task controls when the block is actually a task.
    // Prevents cycling on unrelated blocks that happen to use these tags.
    const hasTodo = containsAny(blockString, TODO_PATTERNS);
    if (!hasTodo && !isTaskLike(blockString)) return null;

    return { statusKey, blockUid, anchorEl, returnFocusEl: anchorEl };
  }

  function resolveStatusPeekContext({ checkbox, input, statusKey }) {
    if (!checkbox || !input || !statusKey || !STATUSES[statusKey]?.active) return null;

    const blockUid = getBlockUidFromDomElement(checkbox);
    if (!blockUid) return null;
    const certifiedUid = checkbox.getAttribute?.(CHECKBOX_UID_ATTRIBUTE);
    if (!certifiedUid || certifiedUid !== blockUid) return null;

    // Hover/focus is presentation-only. The checkbox annotation was already
    // certified from graph text by refreshStatusVisuals, so resolving the
    // reveal control must stay DOM-only. Every eventual status write performs
    // its own fresh graph precondition through the certified write router.
    return {
      blockUid,
      statusKey,
      label: STATUSES[statusKey].label || statusKey,
      anchorEl: checkbox,
      returnFocusEl: input,
    };
  }

  function closeStatusChooser({ restoreFocus = false } = {}) {
    const hadChooser = Boolean(statusChooserEl || statusChooserTeardown);
    const returnFocusEl = statusChooserReturnFocusEl;
    if (statusChooserTeardown) {
      try {
        statusChooserTeardown();
      } catch (_) {}
    }
    statusChooserTeardown = null;

    if (statusChooserEl?.remove) {
      try {
        statusChooserEl.remove();
      } catch (_) {}
    }
    statusChooserEl = null;
    statusChooserReturnFocusEl = null;
    if (hadChooser) statusPeekController?.chooserClosed?.();

    if (restoreFocus && returnFocusEl?.isConnected) {
      try {
        returnFocusEl.focus?.({ preventScroll: true });
      } catch (_) {}
    }
  }

  function positionStatusChooser(el, anchorEl) {
    if (!el || !anchorEl?.getBoundingClientRect) return;
    const rect = anchorEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const margin = 8;
    const arrow = el.querySelector(".bp3-popover-arrow");
    const arrowSvg = arrow?.querySelector("svg");

    el.style.visibility = "hidden";
    el.style.left = "0px";
    el.style.top = "0px";

    window.requestAnimationFrame(() => {
      if (!el.isConnected) return;
      const chooserRect = el.getBoundingClientRect();
      const left = Math.max(
        margin,
        Math.min(rect.left, viewportWidth - chooserRect.width - margin)
      );
      const below = rect.bottom + 8;
      const above = rect.top - chooserRect.height - 8;
      const opensBelow = below + chooserRect.height <= viewportHeight - margin || above < margin;
      const top = opensBelow ? below : Math.max(margin, above);
      const arrowLeft = Math.max(
        4,
        Math.min(rect.left + rect.width / 2 - left - 15, chooserRect.width - 34)
      );

      el.style.left = `${Math.round(left)}px`;
      el.style.top = `${Math.round(top)}px`;
      el.style.transformOrigin = `${Math.round(arrowLeft + 15)}px ${
        opensBelow ? "top" : "bottom"
      }`;
      el.classList.toggle("ts-status-chooser-above", !opensBelow);
      if (arrow) {
        arrow.style.left = `${Math.round(arrowLeft)}px`;
        arrow.style.top = opensBelow ? "-11px" : "";
        arrow.style.bottom = opensBelow ? "" : "-11px";
      }
      if (arrowSvg) arrowSvg.style.transform = opensBelow ? "rotate(90deg)" : "rotate(270deg)";
      el.style.visibility = "visible";
    });
  }

  function makeBlueprintPopoverArrow() {
    const arrow = document.createElement("div");
    arrow.className = "bp3-popover-arrow";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 30 30");
    svg.style.transform = "rotate(90deg)";

    const border = document.createElementNS("http://www.w3.org/2000/svg", "path");
    border.setAttribute("class", "bp3-popover-arrow-border");
    border.setAttribute(
      "d",
      "M8.11 6.302c1.015-.936 1.887-2.922 1.887-4.297v26c0-1.378-.868-3.357-1.888-4.297L.925 17.09c-1.237-1.14-1.233-3.034 0-4.17L8.11 6.302z"
    );

    const fill = document.createElementNS("http://www.w3.org/2000/svg", "path");
    fill.setAttribute("class", "bp3-popover-arrow-fill");
    fill.setAttribute(
      "d",
      "M8.787 7.036c1.22-1.125 2.21-3.376 2.21-5.03V0v30-2.005c0-1.654-.983-3.9-2.21-5.03l-7.183-6.616c-.81-.746-.802-1.96 0-2.7l7.183-6.614z"
    );

    svg.append(border, fill);
    arrow.append(svg);
    return arrow;
  }

  function makeStatusMenuItem({ label, className = "", ariaCurrent = false, onChoose }) {
    const li = document.createElement("li");

    const item = document.createElement("a");
    item.className = `ts-status-choice bp3-menu-item bp3-popover-dismiss ${className}`.trim();
    item.setAttribute("role", "menuitem");
    item.setAttribute("tabindex", "0");
    if (ariaCurrent) {
      item.setAttribute("aria-current", "true");
      item.classList.add("bp3-active", "bp3-intent-primary");
    }

    const text = document.createElement("div");
    text.className = "ts-status-choice-label bp3-fill bp3-text-overflow-ellipsis";
    text.textContent = label;

    item.append(text);
    item.addEventListener("mousedown", stopRoamNavigation);
    item.addEventListener("click", (event) => {
      stopRoamNavigation(event);
      onChoose();
    });
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      stopRoamNavigation(event);
      onChoose();
    });

    li.append(item);
    return li;
  }

  function makeStatusChoiceButton({ statusKey, currentStatusKey, targetUids }) {
    const status = STATUSES[statusKey];
    const item = makeStatusMenuItem({
      label: status?.label || statusKey,
      ariaCurrent: statusKey === currentStatusKey,
      onChoose: () => {
        void setStatusForBlockUids(targetUids, statusKey)
          .catch((err) => log("Status chooser set error:", err))
          .finally(closeStatusChooser);
      },
    });
    const choice = item.querySelector(".ts-status-choice");
    if (choice) choice.setAttribute("data-task-status-choice", statusKey);

    return item;
  }

  async function openStatusChooser({
    blockUid,
    statusKey,
    anchorEl,
    returnFocusEl = null,
    isIntentCurrent = null,
  }) {
    closeStatusChooser();

    const targetUids = await getOperationTargetUids({ primaryUid: blockUid });
    if (typeof isIntentCurrent === "function" && !isIntentCurrent()) return false;
    if (!targetUids.length) return false;

    const chooser = document.createElement("div");
    chooser.className = "ts-status-chooser bp3-popover";

    const content = document.createElement("div");
    content.className = "bp3-popover-content";

    const choices = document.createElement("ul");
    choices.className = "ts-status-choice-list bp3-menu";
    choices.setAttribute("role", "menu");
    if (targetUids.length > 1) {
      const count = document.createElement("li");
      count.className = "ts-status-chooser-count bp3-menu-header";
      const countText = document.createElement("h6");
      countText.textContent = `${targetUids.length} selected blocks`;
      count.append(countText);
      choices.append(count);
    }

    CONFIG.cycleOrder.forEach((key) => {
      if (!STATUSES[key]?.active) return;
      choices.append(
        makeStatusChoiceButton({
          statusKey: key,
          currentStatusKey: statusKey,
          targetUids,
        })
      );
    });

    choices.append(
      makeStatusMenuItem({
        label: "Remove status",
        className: "ts-status-choice-remove",
        onChoose: () => {
          void setStatusForBlockUids(targetUids, null)
            .catch((err) => log("Status chooser remove error:", err))
            .finally(closeStatusChooser);
        },
      })
    );
    content.append(choices);
    chooser.append(makeBlueprintPopoverArrow(), content);

    (portalRoot || document.body).appendChild(chooser);
    statusChooserEl = chooser;
    statusChooserReturnFocusEl = returnFocusEl || anchorEl || null;
    positionStatusChooser(chooser, anchorEl);
    chooser.querySelector(".ts-status-choice[aria-current='true']")?.focus?.({
      preventScroll: true,
    });

    const closeOnOutsideMouseDown = (event) => {
      if (statusChooserEl?.contains(event.target)) return;
      closeStatusChooser();
    };
    const closeOnKeyDown = (event) => {
      if (event.key === "Escape") {
        stopRoamNavigation(event);
        closeStatusChooser({ restoreFocus: true });
      }
    };
    const closeOnViewportChange = () => closeStatusChooser();

    document.addEventListener("mousedown", closeOnOutsideMouseDown, true);
    document.addEventListener("keydown", closeOnKeyDown, true);
    window.addEventListener("resize", closeOnViewportChange, true);
    window.addEventListener("scroll", closeOnViewportChange, true);

    statusChooserTeardown = () => {
      document.removeEventListener("mousedown", closeOnOutsideMouseDown, true);
      document.removeEventListener("keydown", closeOnKeyDown, true);
      window.removeEventListener("resize", closeOnViewportChange, true);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
    return true;
  }

  function handleStatusMouseDown(event) {
    // Only intercept primary button clicks
    if (typeof event.button === "number" && event.button !== 0) return;

    const ctx = getStatusEventContext(event);
    if (!ctx) return;

    // Roam navigates tags/pages on mousedown; stop that before it reaches target handlers.
    stopRoamNavigation(event);
  }

  function handleStatusTouchStart(event) {
    const ctx = getStatusEventContext(event);
    if (!ctx) return;

    stopRoamNavigation(event);
  }

  async function handleStatusClick(event) {
    const ctx = getStatusEventContext(event);
    if (!ctx) return;

    stopRoamNavigation(event);

    if (CONFIG.shiftClickRemoves && event.shiftKey) {
      await setStatusForTargets(ctx.blockUid, null);
      return;
    }

    await openStatusChooser(ctx);
  }

  async function registerSlashCommand(statusKey) {
    const status = STATUSES[statusKey];
    const label = `task status: ${status.label}`;
    const slashCommandApi = extensionAPI?.ui?.slashCommand;
    if (!slashCommandApi?.addCommand || !slashCommandApi?.removeCommand) {
      throw new Error("Roam did not provide extensionAPI.ui.slashCommand");
    }

    await slashCommandApi.addCommand({
      label,
      callback: (context) => {
        void (async () => {
          const blockUid = context["block-uid"];
          const indexes = context["indexes"];

          // Prefer live editor value (avoids clobbering unsaved text while typing)
          const liveEditorString = getLiveBlockInputValue(blockUid);
          let blockString = liveEditorString ?? getBlockString(blockUid);
          if (blockString === null) return;

          blockString = getTextHelpers().removeSlashCommandFragment(blockString, indexes);

          await setBlockStatus(blockUid, statusKey, {
            editorString: liveEditorString === null ? undefined : blockString,
            expectedLiveEditorString: liveEditorString === null ? undefined : liveEditorString,
          });
        })().catch((err) => log("Slash command error:", err));
        return null;
      },
    });

    registeredCommands.slash.push({ label, api: slashCommandApi });
  }

  function registerContextMenu(statusKey) {
    const status = STATUSES[statusKey];
    const label = `Task Status: Set ${status.label}`;

    window.roamAlphaAPI.ui.blockContextMenu.addCommand({
      label,
      "display-conditional": (context) => {
        if (context?.["read-only?"]) return false;
        const text = context?.["block-string"];
        if (!text || typeof text !== "string") return false;
        if (!isTaskLike(text)) return false;
        return true;
      },
      callback: async (context) => {
        const blockUid = context?.["block-uid"];
        if (!blockUid) return;
        await setStatusForTargets(blockUid, statusKey, context);
      },
    });

    registeredCommands.contextMenu.push(label);
  }

  function registerMultiSelectContextMenu(statusKey) {
    const api = window.roamAlphaAPI?.ui?.msContextMenu;
    if (!api?.addCommand) return;

    const status = STATUSES[statusKey];
    const label = `Task Status: Set ${status.label}`;

    api.addCommand({
      label,
      callback: async (context) => {
        await setStatusForTargets(null, statusKey, context);
      },
    });

    registeredCommands.msContextMenu.push({ label, api });
  }

  async function registerPaletteCommand(statusKey) {
    const status = STATUSES[statusKey];
    const label = `Task Status: Set ${status.label}`;

    const api = extensionAPI?.ui?.commandPalette || window.roamAlphaAPI.ui.commandPalette;
    try {
      const res = api.addCommand({
        label,
        "disable-hotkey": false,
        callback: async () => {
          await setStatusForTargets(null, statusKey);
        },
      });
      if (isThenable(res)) await res;
    } catch (err) {
      log("Failed to add palette command:", label, err);
    }

    registeredCommands.palette.push({ label, api });
  }

  async function registerUtilityPaletteCommands() {
    const api = extensionAPI?.ui?.commandPalette || window.roamAlphaAPI.ui.commandPalette;

    const cycleLabel = "Task Status: Cycle";
    try {
      const res = api.addCommand({
        label: cycleLabel,
        "disable-hotkey": false,
        callback: async () => {
          await cycleStatusForTargets(null);
        },
      });
      if (isThenable(res)) await res;
    } catch (err) {
      log("Failed to add palette command:", cycleLabel, err);
    }
    registeredCommands.palette.push({ label: cycleLabel, api });

    const msApi = window.roamAlphaAPI?.ui?.msContextMenu;
    if (msApi?.addCommand) {
      try {
        msApi.addCommand({
          label: cycleLabel,
          callback: async (context) => {
            await cycleStatusForTargets(null, context);
          },
        });
        registeredCommands.msContextMenu.push({ label: cycleLabel, api: msApi });
      } catch (err) {
        log("Failed to add multiselect context menu command:", cycleLabel, err);
      }
    }

    const removeLabel = "Task Status: Remove";
    try {
      const res = api.addCommand({
        label: removeLabel,
        "disable-hotkey": false,
        callback: async () => {
          await setStatusForTargets(null, null);
        },
      });
      if (isThenable(res)) await res;
    } catch (err) {
      log("Failed to add palette command:", removeLabel, err);
    }
    registeredCommands.palette.push({ label: removeLabel, api });

    if (msApi?.addCommand) {
      try {
        msApi.addCommand({
          label: removeLabel,
          callback: async (context) => {
            await setStatusForTargets(null, null, context);
          },
        });
        registeredCommands.msContextMenu.push({ label: removeLabel, api: msApi });
      } catch (err) {
        log("Failed to add multiselect context menu command:", removeLabel, err);
      }
    }
  }

  async function registerAllCommands() {
    for (const statusKey of CONFIG.cycleOrder) {
      await registerSlashCommand(statusKey);
      registerContextMenu(statusKey);
      registerMultiSelectContextMenu(statusKey);
      await registerPaletteCommand(statusKey);
    }

    await registerUtilityPaletteCommands();
  }

  async function unregisterAllCommands() {
    for (const entry of registeredCommands.slash) {
      try {
        await entry.api.removeCommand({ label: entry.label });
      } catch (_) {}
    }

    registeredCommands.contextMenu.forEach((label) => {
      try {
        window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label });
      } catch (_) {}
    });

    registeredCommands.msContextMenu.forEach((entry) => {
      try {
        entry.api.removeCommand({ label: entry.label });
      } catch (_) {}
    });

    for (const entry of registeredCommands.palette) {
      try {
        const res = entry.api.removeCommand({ label: entry.label });
        if (isThenable(res)) await res;
      } catch (_) {}
    }

    registeredCommands.slash = [];
    registeredCommands.contextMenu = [];
    registeredCommands.msContextMenu = [];
    registeredCommands.palette = [];
  }

  async function registerSettingsPanel() {
    if (!extensionAPI?.settings?.panel?.create) return;

    const React = window.React;

    const StatusNamesPanel = () => {
      if (!React?.useState || !React?.useEffect || !React?.useRef) {
        return React?.createElement
          ? React.createElement(
              "div",
              { className: "bp3-text-small" },
              "React not available."
            )
          : null;
      }

      const rootRef = React.useRef(null);

      React.useEffect(() => {
        try {
          const root = rootRef.current;
          if (!root?.closest) return;

          const formGroup =
            root.closest(".bp3-form-group") ||
            root.closest(".bp4-form-group") ||
            root.closest(".bp5-form-group") ||
            root.parentElement;
          if (!formGroup?.querySelector) return;

          const label =
            formGroup.querySelector("label.bp3-label") ||
            formGroup.querySelector(".bp3-label") ||
            formGroup.querySelector("label.bp4-label") ||
            formGroup.querySelector(".bp4-label") ||
            formGroup.querySelector("label.bp5-label") ||
            formGroup.querySelector(".bp5-label");
          const labelWidth = label ? label.getBoundingClientRect().width : 0;
          if (label) label.style.display = "none";

          const content =
            formGroup.querySelector(".bp3-form-content") ||
            formGroup.querySelector(".bp4-form-content") ||
            formGroup.querySelector(".bp5-form-content");
          if (content) {
            content.style.marginLeft = "0";
            content.style.width = "100%";
          }

          // Roam's extension settings layout is two-column (label + content). To avoid
          // having this UI pinned to the far right, expand across the label column.
          if (labelWidth > 0) {
            root.style.position = "relative";
            root.style.left = `-${Math.round(labelWidth)}px`;
            root.style.width = `calc(100% + ${Math.round(labelWidth)}px)`;
          }
        } catch (_) {}
      }, []);

      const readStatusRows = () =>
        statusList.map((entry) => ({
          key: entry.key,
          name: STATUSES?.[entry.key]?.name ?? entry.name,
        }));

      const rowsToNameMap = (rows) => {
        const out = {};
        (rows || []).forEach((row) => {
          out[row.key] = row.name;
        });
        return out;
      };

      const [statusRows, setStatusRows] = React.useState(() => readStatusRows());
      const order = statusRows.map((row) => row.key);

      const readSaved = () => rowsToNameMap(readStatusRows());

      const [savedByKey, setSavedByKey] = React.useState(() =>
        rowsToNameMap(statusRows)
      );
      const [draftByKey, setDraftByKey] = React.useState(() =>
        rowsToNameMap(statusRows)
      );
      const [workingKey, setWorkingKey] = React.useState(null);
      const [errorByKey, setErrorByKey] = React.useState({});
      const [infoByKey, setInfoByKey] = React.useState({});
      const [newStatusName, setNewStatusName] = React.useState("");
      const [newStatusError, setNewStatusError] = React.useState(null);
      const [newStatusInfo, setNewStatusInfo] = React.useState(null);
      const [openStatusMenuKey, setOpenStatusMenuKey] = React.useState(null);
      const [dragState, setDragState] = React.useState({
        key: null,
        targetKey: null,
        placement: null,
      });
      const [openColorPopover, setOpenColorPopover] = React.useState(null);

      React.useEffect(() => {
        const closePanels = (event) => {
          const root = rootRef.current;
          const target = event.target;
          if (root?.contains?.(target)) {
            const keepOpen = target?.closest?.(
              ".ts-status-row-menu, .ts-status-row-menu-button, .ts-status-color-popover, .ts-status-color-swatch-button"
            );
            if (keepOpen) return;
          }
          setOpenStatusMenuKey(null);
          setOpenColorPopover(null);
        };

        const closeOnEscape = (event) => {
          if (event.key !== "Escape") return;
          setOpenStatusMenuKey(null);
          setOpenColorPopover(null);
        };

        document.addEventListener("mousedown", closePanels, true);
        document.addEventListener("keydown", closeOnEscape, true);
        return () => {
          document.removeEventListener("mousedown", closePanels, true);
          document.removeEventListener("keydown", closeOnEscape, true);
        };
      }, []);

      const refreshStatusRows = () => {
        const rows = readStatusRows();
        const names = rowsToNameMap(rows);
        setStatusRows(rows);
        setSavedByKey(names);
        setDraftByKey(names);
        return { rows, names };
      };

      const setDraft = (k, v) => {
        setDraftByKey((prev) => ({ ...prev, [k]: v }));
      };

      const clearMessages = (k) => {
        setErrorByKey((prev) => ({ ...prev, [k]: null }));
        setInfoByKey((prev) => ({ ...prev, [k]: null }));
      };

      const apply = async (k, renameExisting) => {
        clearMessages(k);
        setWorkingKey(k);
        try {
          const res = await setStatusName(k, draftByKey[k], { renameExisting });
          if (!res?.changed) {
            setInfoByKey((prev) => ({ ...prev, [k]: "No change." }));
            return;
          }

          refreshStatusRows();
          setInfoByKey((prev) => ({
            ...prev,
            [k]: renameExisting
              ? "Renamed tag page."
              : "Updated name.",
          }));
        } catch (e) {
          const msg = e?.message || String(e);
          setErrorByKey((prev) => ({ ...prev, [k]: msg }));
        } finally {
          setWorkingKey(null);
        }
      };

      const addStatusFromDraft = async () => {
        const error = validateNewStatusName(newStatusName);
        setNewStatusError(error);
        setNewStatusInfo(null);
        if (error) return;

        setWorkingKey("__ADD__");
        try {
          const added = await addStatus(newStatusName);
          refreshStatusRows();
          setNewStatusName("");
          setInfoByKey((prev) => ({ ...prev, [added.key]: "Added." }));
          setNewStatusInfo(null);
        } catch (e) {
          setNewStatusError(e?.message || String(e));
        } finally {
          setWorkingKey(null);
        }
      };

      const reorderStatusRow = async (k, targetKey, placement) => {
        if (!k || !targetKey || k === targetKey) return;

        clearMessages(k);
        setOpenStatusMenuKey(null);
        setWorkingKey(k);
        try {
          await reorderStatus(k, targetKey, placement);
          refreshStatusRows();
        } catch (e) {
          setErrorByKey((prev) => ({ ...prev, [k]: e?.message || String(e) }));
        } finally {
          setWorkingKey(null);
          setDragState({ key: null, targetKey: null, placement: null });
        }
      };

      const deleteStatusRow = async (k) => {
        setOpenStatusMenuKey(null);
        const label = savedByKey[k] || STATUSES?.[k]?.label || k;
        const ok = window.confirm(
          `Delete "${label}" from active statuses? Existing tags will remain in the graph but will no longer be managed by this extension.`
        );
        if (!ok) return;

        clearMessages(k);
        setWorkingKey(k);
        try {
          await deleteStatus(k);
          refreshStatusRows();
          setNewStatusInfo(`Deleted "${label}".`);
        } catch (e) {
          setErrorByKey((prev) => ({ ...prev, [k]: e?.message || String(e) }));
        } finally {
          setWorkingKey(null);
        }
      };

      const onStatusDragStart = (event, k) => {
        if (workingKey) {
          event.preventDefault();
          return;
        }
        setOpenStatusMenuKey(null);
        setDragState({ key: k, targetKey: null, placement: null });
        try {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", k);
        } catch (_) {}
      };

      const onStatusDragOver = (event, k) => {
        const draggedKey = dragState.key;
        if (!draggedKey || draggedKey === k || workingKey) return;
        event.preventDefault();
        try {
          event.dataTransfer.dropEffect = "move";
        } catch (_) {}

        const rect = event.currentTarget.getBoundingClientRect();
        const placement = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
        if (dragState.targetKey !== k || dragState.placement !== placement) {
          setDragState((prev) => ({ ...prev, targetKey: k, placement }));
        }
      };

      const onStatusDrop = (event, targetKey) => {
        event.preventDefault();
        const draggedKey =
          dragState.key ||
          (() => {
            try {
              return event.dataTransfer.getData("text/plain");
            } catch (_) {
              return null;
            }
          })();
        const placement =
          dragState.targetKey === targetKey && dragState.placement
            ? dragState.placement
            : "before";
        void reorderStatusRow(draggedKey, targetKey, placement);
      };

      const onStatusDragEnd = () => {
        setDragState({ key: null, targetKey: null, placement: null });
      };

      const normalizeColorEntry = (entry) => {
        return {
          base: normalizeCssColorValue(entry?.base),
          text: normalizeCssColorValue(entry?.text),
        };
      };

      const normalizeColorsState = (overrides) => {
        const out = {};
        order.forEach((k) => {
          out[k] = normalizeColorEntry(overrides?.[k]);
        });
        return out;
      };

      const readSavedColors = () => {
        const stored = loadObjectSetting(SETTINGS_KEYS.statusColorOverrides, {});
        return normalizeColorsState(stored);
      };

      const [savedColorsByKey, setSavedColorsByKey] = React.useState(() => readSavedColors());
      const [draftColorsByKey, setDraftColorsByKey] = React.useState(() => readSavedColors());
      const [workingColorKey, setWorkingColorKey] = React.useState(null);
      const [colorErrorByKey, setColorErrorByKey] = React.useState({});
      const [colorInfoByKey, setColorInfoByKey] = React.useState({});

      const setDraftColors = (k, patch) => {
        setDraftColorsByKey((prev) => ({
          ...prev,
          [k]: { ...(prev[k] || {}), ...(patch || {}) },
        }));
      };

      const clearColorMessages = (k) => {
        setColorErrorByKey((prev) => ({ ...prev, [k]: null }));
        setColorInfoByKey((prev) => ({ ...prev, [k]: null }));
      };

      const validateColorEntry = (entry) => {
        const base = normalizeCssColorValue(entry?.base);
        const text = normalizeCssColorValue(entry?.text);

        if (base && !cssColorIsSupported(base)) {
          return "Base color must be a valid CSS color (e.g. #14b8a6, rgb(20,184,166)).";
        }
        if (text && !cssColorIsSupported(text)) {
          return "Text override must be a valid CSS color.";
        }
        if (base && !parseCssColorToRgb(base)) {
          return "Could not derive background/border from the base color.";
        }
        return null;
      };

      const applyColors = async (k, nextEntry) => {
        clearColorMessages(k);
        setWorkingColorKey(k);

        try {
          const normalized = normalizeColorEntry(nextEntry);
          const validation = validateColorEntry(normalized);
          if (validation) {
            setColorErrorByKey((prev) => ({ ...prev, [k]: validation }));
            return;
          }

          const base = normalized.base;
          const text = normalized.text;
          const current = loadObjectSetting(SETTINGS_KEYS.statusColorOverrides, {});
          const nextOverrides = { ...(current || {}) };

          if (!base && !text) {
            delete nextOverrides[k];
          } else {
            nextOverrides[k] = { base, text };
          }

          await saveSettingAsync(SETTINGS_KEYS.statusColorOverrides, nextOverrides);
          statusColorOverrides = nextOverrides;

          clearStatusColorOverrides();
          applyStatusColorOverrides(statusColorOverrides);

          const refreshed = normalizeColorsState(nextOverrides);
          setSavedColorsByKey(refreshed);
          setDraftColorsByKey(refreshed);
          setColorInfoByKey((prev) => ({ ...prev, [k]: "Saved." }));
        } catch (e) {
          const msg = e?.message || String(e);
          setColorErrorByKey((prev) => ({ ...prev, [k]: msg }));
        } finally {
          setWorkingColorKey(null);
        }
      };

      const resetAllColors = async () => {
        const key = "__ALL__";
        clearColorMessages(key);
        setWorkingColorKey(key);
        try {
          const nextOverrides = {};
          await saveSettingAsync(SETTINGS_KEYS.statusColorOverrides, nextOverrides);
          statusColorOverrides = nextOverrides;
          applyStatusColorOverrides(statusColorOverrides);

          const refreshed = normalizeColorsState(nextOverrides);
          setSavedColorsByKey(refreshed);
          setDraftColorsByKey(refreshed);
          setColorInfoByKey((prev) => ({ ...prev, [key]: "Reset." }));
        } catch (e) {
          const msg = e?.message || String(e);
          setColorErrorByKey((prev) => ({ ...prev, [key]: msg }));
        } finally {
          setWorkingColorKey(null);
        }
      };

      const clamp8 = (n) => {
        const v = Math.round(Number(n));
        if (!Number.isFinite(v)) return 0;
        if (v < 0) return 0;
        if (v > 255) return 255;
        return v;
      };

      const rgbToHex = (rgb) => {
        const r = clamp8(rgb?.r);
        const g = clamp8(rgb?.g);
        const b = clamp8(rgb?.b);
        const to2 = (x) => x.toString(16).padStart(2, "0");
        return `#${to2(r)}${to2(g)}${to2(b)}`;
      };

      const colorToHex = (value, fallback) => {
        const rgb = parseCssColorToRgb(value) || parseCssColorToRgb(fallback);
        return rgb ? rgbToHex(rgb) : "#000000";
      };

      const makeRowMenuButton = ({ label, icon, disabled, intent, onClick }) =>
        React.createElement(
          "li",
          null,
          React.createElement(
            "button",
            {
              type: "button",
              className: `bp3-menu-item ${
                icon ? `bp3-icon-${icon}` : ""
              } ${intent ? `bp3-intent-${intent}` : ""}`.trim(),
              disabled: Boolean(disabled),
              role: "menuitem",
              onClick,
            },
            React.createElement("div", { className: "bp3-fill" }, label)
          )
        );

      const renderStatusRowMenu = (k, label) =>
        React.createElement(
          "div",
          { className: "ts-status-row-menu-wrap" },
          React.createElement("button", {
            type: "button",
            className: "bp3-button bp3-small bp3-minimal bp3-icon-more ts-status-row-menu-button",
            disabled: Boolean(workingKey),
            title: `Actions for ${label}`,
            "aria-label": `Actions for ${label}`,
            "aria-haspopup": "menu",
            "aria-expanded": openStatusMenuKey === k ? "true" : "false",
            onClick: (event) => {
              event.preventDefault();
              setOpenColorPopover(null);
              setOpenStatusMenuKey((prev) => (prev === k ? null : k));
            },
          }),
          openStatusMenuKey === k
            ? React.createElement(
                "div",
                { className: "ts-status-row-menu bp3-popover" },
                React.createElement(
                  "div",
                  { className: "bp3-popover-content" },
                  React.createElement(
                    "ul",
                    { className: "bp3-menu", role: "menu" },
                    makeRowMenuButton({
                      label: "Delete",
                      icon: "trash",
                      intent: "danger",
                      disabled: order.length <= 1,
                      onClick: () => void deleteStatusRow(k),
                    })
                  )
                )
              )
            : null
        );

      const setColorDraftValue = (k, channel, value) => {
        clearColorMessages(k);
        setDraftColors(k, { [channel]: value });
      };

      const renderColorPopover = ({
        k,
        channel,
        label,
        draftValue,
        hexValue,
        fallbackValue,
        disabled,
      }) => {
        const popoverKey = `${k}:${channel}`;
        const isText = channel === "text";
        const isOpen = openColorPopover === popoverKey;

        return React.createElement(
          "div",
          { className: "ts-status-color-picker-wrap" },
          React.createElement(
            "button",
            {
              type: "button",
              className: "bp3-button bp3-small ts-status-color-swatch-button",
              disabled,
              title: label,
              "aria-label": label,
              "aria-haspopup": "dialog",
              "aria-expanded": isOpen ? "true" : "false",
              onClick: (event) => {
                event.preventDefault();
                setOpenStatusMenuKey(null);
                setOpenColorPopover((prev) => (prev === popoverKey ? null : popoverKey));
              },
            },
            React.createElement("span", {
              className: "ts-status-color-swatch-dot",
              style: { backgroundColor: hexValue },
            }),
            React.createElement(
              "span",
              { className: "ts-status-color-swatch-label" },
              label
            )
          ),
          isOpen
            ? React.createElement(
                "div",
                { className: "ts-status-color-popover bp3-popover", role: "dialog" },
                React.createElement(
                  "div",
                  { className: "bp3-popover-content" },
                  React.createElement(
                    "div",
                    { className: "ts-status-color-popover-inner" },
                    React.createElement(
                      "div",
                      { className: "ts-status-color-popover-title" },
                      label
                    ),
                    React.createElement(
                      "div",
                      { className: "ts-status-color-preset-grid" },
                      ...STATUS_COLOR_PRESETS.map((preset) =>
                        React.createElement("button", {
                          key: preset.value,
                          type: "button",
                          className: "ts-status-color-preset",
                          style: { backgroundColor: preset.value },
                          title: preset.name,
                          "aria-label": `Use ${preset.name}`,
                          onClick: () => setColorDraftValue(k, channel, preset.value),
                        })
                      )
                    ),
                    React.createElement(
                      "div",
                      { className: "ts-status-color-custom-row" },
                      React.createElement("input", {
                        type: "color",
                        className: "ts-status-native-color-input",
                        value: hexValue,
                        disabled,
                        onChange: (e) => setColorDraftValue(k, channel, e.target.value),
                        "aria-label": `${label} native color picker`,
                      }),
                      React.createElement("input", {
                        className: "bp3-input bp3-small ts-status-color-input",
                        value: draftValue,
                        disabled,
                        placeholder: isText ? "Optional text color" : fallbackValue || "#14b8a6",
                        onChange: (e) => setColorDraftValue(k, channel, e.target.value),
                        "aria-label": `${label} color value`,
                      })
                    ),
                    React.createElement(
                      "div",
                      { className: "ts-status-color-popover-actions" },
                      React.createElement(
                        "button",
                        {
                          type: "button",
                          className: "bp3-button bp3-small bp3-minimal",
                          disabled,
                          onClick: () => setColorDraftValue(k, channel, ""),
                        },
                        isText ? "Clear Text" : "Clear Base"
                      )
                    )
                  )
                )
              )
            : null
        );
      };

      const getColorControlState = (k) => {
        const saved = savedColorsByKey[k] || { base: "", text: "" };
        const draft = draftColorsByKey[k] || { base: "", text: "" };

        const savedBase = normalizeCssColorValue(saved.base);
        const savedText = normalizeCssColorValue(saved.text);
        const draftBase = normalizeCssColorValue(draft.base);
        const draftText = normalizeCssColorValue(draft.text);

        const dirty = savedBase !== draftBase || savedText !== draftText;
        const validation = dirty
          ? validateColorEntry({ base: draftBase, text: draftText })
          : null;
        const effectiveDefault = getDefaultStatusColor(k);
        const baseSwatchSource = draftBase || effectiveDefault;
        const textSwatchSource = draftText || draftBase || effectiveDefault;
        const previewValues = deriveStatusPillColorValues(
          k,
          { base: draftBase, text: draftText },
          resolveStatusSurfaces()
        );
        const previewStyle = {
          "--ts-status-bg-light": previewValues.lightBackgroundCss,
          "--ts-status-fg-light": previewValues.lightTextCss,
          "--ts-status-border-light": previewValues.lightBorderCss,
          "--ts-status-bg-dark": previewValues.darkBackgroundCss,
          "--ts-status-fg-dark": previewValues.darkTextCss,
          "--ts-status-border-dark": previewValues.darkBorderCss,
        };

        return {
          savedBase,
          savedText,
          draftBase,
          draftText,
          dirty,
          validation,
          error: validation || colorErrorByKey[k],
          info: colorInfoByKey[k],
          isWorking: workingColorKey === k || workingColorKey === "__ALL__",
          hasSavedOverride: Boolean(savedBase || savedText),
          baseSwatchSource,
          baseHex: colorToHex(baseSwatchSource, "#000000"),
          textHex: colorToHex(textSwatchSource, baseSwatchSource || "#000000"),
          previewStyle,
        };
      };

      const renderInlineColorControls = (k, state) =>
        React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "div",
            { className: "ts-status-inline-colors" },
            renderColorPopover({
              k,
              channel: "base",
              label: "Base",
              draftValue: state.draftBase,
              hexValue: state.baseHex,
              fallbackValue: "#14b8a6",
              disabled: state.isWorking,
            }),
            renderColorPopover({
              k,
              channel: "text",
              label: "Text",
              draftValue: state.draftText,
              hexValue: state.textHex,
              fallbackValue: state.baseSwatchSource || "#000000",
              disabled: state.isWorking,
            })
          ),
          state.dirty
            ? React.createElement(
                "div",
                { className: "bp3-button-group ts-status-inline-color-actions" },
                React.createElement(
                  "button",
                  {
                    type: "button",
                    className:
                      "bp3-button bp3-small bp3-intent-primary bp3-icon-tick ts-status-color-commit-button",
                    disabled: state.isWorking || Boolean(state.validation),
                    title: "Apply color changes",
                    "aria-label": "Apply color changes",
                    onClick: () =>
                      applyColors(k, {
                        base: state.draftBase,
                        text: state.draftText,
                      }),
                  }
                ),
                React.createElement(
                  "button",
                  {
                    type: "button",
                    className:
                      "bp3-button bp3-small bp3-minimal bp3-icon-cross ts-status-color-commit-button",
                    disabled: state.isWorking,
                    title: "Revert color changes",
                    "aria-label": "Revert color changes",
                    onClick: () => {
                      clearColorMessages(k);
                      setDraftColorsByKey((prev) => ({
                        ...prev,
                        [k]: { base: state.savedBase, text: state.savedText },
                      }));
                    },
                  }
                )
              )
            : state.hasSavedOverride
              ? React.createElement(
                  "button",
                  {
                    type: "button",
                    className:
                      "bp3-button bp3-small bp3-minimal ts-status-inline-color-actions",
                    disabled: state.isWorking,
                    onClick: () => applyColors(k, { base: "", text: "" }),
                  },
                  "Clear"
                )
              : null,
          state.isWorking && workingColorKey === k
            ? React.createElement(
                "span",
                { className: "bp3-text-small", style: { opacity: 0.7 } },
                "Working..."
              )
            : null
        );

      const addStatusRow = React.createElement(
        "div",
        { className: "ts-status-add-row", key: "add-status" },
        React.createElement(
          "div",
          { className: "ts-status-row-main" },
          React.createElement("span", {
            className: "ts-status-add-spacer",
            "aria-hidden": "true",
          }),
          React.createElement("input", {
            className: "bp3-input bp3-small ts-status-name-input",
            value: newStatusName,
            disabled: Boolean(workingKey),
            placeholder: "New status name",
            onChange: (e) => {
              setNewStatusName(e.target.value);
              setNewStatusError(null);
              setNewStatusInfo(null);
            },
            onKeyDown: (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addStatusFromDraft();
              }
            },
            "aria-label": "New status name",
          }),
          React.createElement(
            "button",
            {
              type: "button",
              className: "bp3-button bp3-small bp3-intent-primary",
              disabled: Boolean(workingKey) || !normalizeStatusName(newStatusName),
              onClick: () => addStatusFromDraft(),
            },
            "Add Status"
          ),
          newStatusError
            ? React.createElement(
                "span",
                { className: "bp3-text-small ts-status-row-error" },
                newStatusError
              )
            : null,
          !newStatusError && newStatusInfo
            ? React.createElement(
                "span",
                { className: "bp3-text-small ts-status-row-info" },
                newStatusInfo
              )
            : null
        )
      );

      return React.createElement(
        "div",
        { className: "ts-status-names-panel", ref: rootRef },
        React.createElement(
          "div",
          { className: "bp3-card ts-status-names-card" },
          React.createElement(
            "div",
            { className: "ts-status-names-header" },
            React.createElement(
              "h3",
              { className: "bp3-heading ts-status-names-title" },
              "Statuses"
            ),
            React.createElement(
              "div",
              { className: "bp3-text-small ts-status-names-subtitle" },
              "Drag to reorder. Rename inline."
            ),
            React.createElement(
              "div",
              { className: "ts-status-colors-toolbar ts-status-inline-colors-toolbar" },
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "bp3-button bp3-small bp3-minimal",
                  disabled: workingColorKey != null,
                  onClick: () => resetAllColors(),
                },
                "Reset colors"
              ),
              colorErrorByKey["__ALL__"]
                ? React.createElement(
                    "span",
                    { className: "bp3-text-small ts-status-colors-toolbar-error" },
                    colorErrorByKey["__ALL__"]
                  )
                : null,
              !colorErrorByKey["__ALL__"] && colorInfoByKey["__ALL__"]
                ? React.createElement(
                    "span",
                    { className: "bp3-text-small ts-status-colors-toolbar-info" },
                    colorInfoByKey["__ALL__"]
                  )
                : null
            )
          ),
          React.createElement(
            "div",
            { className: "ts-status-names-list" },
            ...order.flatMap((k) => {
              const saved = savedByKey[k] ?? "";
              const draft = draftByKey[k] ?? "";
              const dirty = normalizeStatusName(draft) !== normalizeStatusName(saved);
              const validation = dirty ? validateNewStatusName(draft, k) : null;
              const showPrompt = dirty && !validation && !workingKey;

              const prompt = showPrompt
                ? React.createElement(
                    "div",
                    { className: "ts-rename-prompt" },
                      React.createElement(
                        "span",
                        { className: "bp3-text-small ts-rename-prompt-label" },
                      "Rename tag page?"
                      ),
                    React.createElement(
                      "div",
                      { className: "bp3-button-group" },
                      React.createElement(
                        "button",
                        {
                          type: "button",
                          className: "bp3-button bp3-small bp3-intent-primary",
                          onClick: () => apply(k, true),
                        },
                        "Yes"
                      ),
                      React.createElement(
                        "button",
                        {
                          type: "button",
                          className: "bp3-button bp3-small",
                          onClick: () => apply(k, false),
                        },
                        "No"
                      )
                    )
                  )
                : null;

              const error = validation || errorByKey[k];
              const info = infoByKey[k];
              const colorState = getColorControlState(k);
              const rowError = error || colorState.error;
              const rowInfo = info || colorState.info;
              const rowLabel = saved || STATUSES?.[k]?.label || k;
              const rowClasses = [
                "ts-status-row",
                "ts-status-edit-row",
                dragState.key === k ? "ts-status-row-dragging" : "",
                dragState.targetKey === k && dragState.placement
                  ? `ts-status-row-drop-${dragState.placement}`
                  : "",
              ]
                .filter(Boolean)
                .join(" ");

              const row = React.createElement(
                "div",
                {
                  key: `row-${k}`,
                  className: rowClasses,
                  onDragOver: (event) => onStatusDragOver(event, k),
                  onDrop: (event) => onStatusDrop(event, k),
                  onDragLeave: () => {
                    if (dragState.targetKey === k) {
                      setDragState((prev) => ({
                        ...prev,
                        targetKey: null,
                        placement: null,
                      }));
                    }
                  },
                },
                React.createElement(
                  "div",
                  { className: "ts-status-row-main" },
                  React.createElement("button", {
                    type: "button",
                    className:
                      "bp3-button bp3-small bp3-minimal bp3-icon-drag-handle-vertical ts-status-drag-handle",
                    disabled: Boolean(workingKey),
                    draggable: !workingKey,
                    title: `Drag ${rowLabel} to reorder`,
                    "aria-label": `Drag ${rowLabel} to reorder`,
                    onDragStart: (event) => onStatusDragStart(event, k),
                    onDragEnd: onStatusDragEnd,
                  }),
                  React.createElement("input", {
                    className: "bp3-input bp3-small ts-status-name-input",
                    value: draft,
                    disabled: Boolean(workingKey),
                    onChange: (e) => {
                      clearMessages(k);
                      setDraft(k, e.target.value);
                    },
                    "aria-label": `Status name for ${k}`,
                  }),
                  React.createElement(
                    "span",
                    { className: "ts-status-pill-surface ts-status-row-preview" },
                    React.createElement(
                      "span",
                      {
                        className: "ts-status-pill-preview",
                        title: k,
                        "data-task-status-key": k,
                        style: colorState.previewStyle,
                      },
                      draft || rowLabel
                    )
                  ),
                  renderInlineColorControls(k, colorState),
                  renderStatusRowMenu(k, rowLabel),
                  prompt,
                  workingKey === k
                    ? React.createElement(
                        "span",
                        { className: "bp3-text-small", style: { opacity: 0.7 } },
                        "Working..."
                      )
                    : null
                ),
                rowError
                  ? React.createElement(
                      "div",
                      { className: "bp3-text-small ts-status-row-error" },
                      rowError
                    )
                  : null,
                !rowError && rowInfo
                  ? React.createElement(
                      "div",
                      { className: "bp3-text-small ts-status-row-info" },
                      rowInfo
                    )
                  : null
              );

              return [row];
            }),
            addStatusRow
          )
        )
      );
    };

    const panelConfig = {
      tabTitle: "Task Status Tags",
      settings: [
        {
          id: SETTINGS_KEYS.styleNativeCheckboxes,
          name: "Style native checkboxes by task status",
          description:
            "Adds an accessible color-and-shape treatment to the exact TODO/DONE checkbox. This is cosmetic and never changes completion or Better Tasks data.",
          action: {
            type: "switch",
            onChange: (value) => setCheckboxStylingEnabled(value),
          },
        },
        {
          id: SETTINGS_KEYS.statusLabelDisplay,
          name: "Status label display",
          description:
            "Checkbox-only keeps the queryable task-status tag in the block but hides its exact rendered pill after the checkbox is safely styled. Hover or focus the checkbox to reveal the status control.",
          action: {
            type: "select",
            items: Object.values(STATUS_LABEL_DISPLAY),
            onChange: (value) => setStatusLabelDisplay(value),
          },
        },
        {
          id: SETTINGS_KEYS.alertBeacon,
          name: "Animate Alert status",
          description:
            "Adds a brief two-beat attention halo to exact unchecked Alert tasks, then stays quiet. This is cosmetic, writes no task data, and automatically stays still for reduced-motion, forced-colors, and print.",
          action: {
            type: "switch",
            onChange: (value) => setAlertBeaconEnabled(value),
          },
        },
        {
          id: "task-status-status-names",
          name: "",
          description: "",
          action: { type: "reactComponent", component: StatusNamesPanel },
        },
        {
          id: "task-status-help",
          name: "Help",
          description:
            "Stores a queryable workflow label as a task-status/<Name> tag after TODO/DONE. In checkbox-only mode, hover or focus the checkbox to reveal it; Enter or Alt+Down opens the chooser, Space remains native completion, and Shift+click removes.",
          action: {
            type: "button",
            content: "Print Help",
            onClick: () => {
              const exampleKey = CONFIG.cycleOrder[0];
              const exampleTagTitle =
                STATUSES?.[exampleKey]?.tagTitle ||
                `${STATUS_TAG_PREFIX}${DEFAULT_STATUS_NAMES[exampleKey] || "Active"}`;
              console.log("[TaskStatus] Usage:");
              console.log(
                `  - Format: {{[[TODO]]}} #[[${exampleTagTitle}]] Task text`
              );
              console.log("  - Click status tag: choose status");
              console.log("  - Shift+click status tag: remove status");
              console.log("  - Checkbox-only mode: hover/focus checkbox to reveal status");
              console.log("  - Enter or Alt+Down: choose status; Space: native completion");
              console.log("  - Command palette: 'Task Status: ...'");
            },
          },
        },
      ],
    };

    await extensionAPI.settings.panel.create(panelConfig);
  }

  async function init(isActive = () => true) {
    portalRoot = document.createElement("div");
    portalRoot.className = "ts-status-portal";
    portalRoot.setAttribute("data-task-status-portal", "true");
    document.body.appendChild(portalRoot);

    await registerSettingsPanel();
    if (!isActive()) return false;

    statusPeekController = createStatusPeekController({
      document,
      window,
      portalRoot,
      resolveContext: resolveStatusPeekContext,
      onOpen: (context) => openStatusChooser(context),
      onRemove: (context) => setStatusForTargets(context.blockUid, null),
      onAnchorInvalid: () => closeStatusChooser(),
      onError: (error) => log("Status peek error:", error),
    });
    statusPeekController.start();
    statusPeekController.setEnabled(isStatusPeekEnabled());

    // Apply persisted status color overrides (if any)
    clearStatusColorOverrides();
    applyStatusColorOverrides(statusColorOverrides);
    if (!isActive()) return false;
    startThemeObserver();

    await registerAllCommands();
    if (!isActive()) {
      await cleanup();
      return false;
    }

    startStatusPillObserver();

    // Roam's page/tag navigation triggers on mouse down. We intercept mousedown/touchstart
    // to prevent navigation, and use click to actually apply the cycle/remove behavior.
    window.addEventListener("mousedown", handleStatusMouseDown, true);
    window.addEventListener("touchstart", handleStatusTouchStart, TOUCH_LISTENER_OPTIONS);
    window.addEventListener("click", handleStatusClick, true);
    console.log("[TaskStatus] Loaded. Statuses:", CONFIG.cycleOrder.join(", "));
    return true;
  }

  async function cleanup() {
    // The readable tag is restored before any alternate control is removed.
    clearOwnedStatusPillPresentations(document);
    closeStatusChooser();
    statusPeekController?.destroy?.();
    statusPeekController = null;
    stopStatusPillObserver();
    stopThemeObserver();

    clearStatusColorOverrides();
    if (portalRoot?.remove) portalRoot.remove();
    portalRoot = null;

    window.removeEventListener("mousedown", handleStatusMouseDown, true);
    window.removeEventListener("touchstart", handleStatusTouchStart, TOUCH_LISTENER_OPTIONS);
    window.removeEventListener("click", handleStatusClick, true);
    pendingOperations.clear();

    await unregisterAllCommands();

    console.log("[TaskStatus] Unloaded.");
  }

  return { init, cleanup };
}

let activeLifecycle = null;

export async function onload({ extensionAPI, extension }) {
  if (!extensionAPI) throw new TypeError("Roam did not provide extensionAPI");
  if (activeLifecycle) await activeLifecycle.dispose();

  const previousRuntime = window[GLOBAL_KEY];
  if (previousRuntime && typeof previousRuntime.dispose === "function") {
    await previousRuntime.dispose();
  }

  const lifecycle = createLifecycle();
  const instance = createTaskStatusExtension({ extensionAPI });
  const runtime = Object.freeze({
    version: resolveTaskStatusRuntimeVersion(extension?.version),
    dispose: () => lifecycle.dispose(),
  });
  activeLifecycle = lifecycle;
  window[GLOBAL_KEY] = runtime;

  lifecycle.add(async () => {
    await instance.cleanup();
    if (window[GLOBAL_KEY] === runtime) delete window[GLOBAL_KEY];
    if (activeLifecycle === lifecycle) activeLifecycle = null;
  });

  try {
    const initialized = await instance.init(
      () => window[GLOBAL_KEY] === runtime && !lifecycle.disposed
    );
    if (initialized) console.info(`[TaskStatus] Runtime v${runtime.version}`);
  } catch (error) {
    await lifecycle.dispose().catch((cleanupError) => console.error(cleanupError));
    throw error;
  }

  return () => lifecycle.dispose();
}

export async function onunload() {
  const lifecycle = activeLifecycle;
  activeLifecycle = null;
  if (lifecycle) await lifecycle.dispose();
}

export default { onload, onunload };
