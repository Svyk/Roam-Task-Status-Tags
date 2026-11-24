/* Roam Task Status Tags v0.16.0 | generated; edit src/ */

// src/status-checkbox.js
var CHECKBOX_STATUS_ATTRIBUTE = "data-ts-checkbox-status";
var CHECKBOX_SHAPE_ATTRIBUTE = "data-ts-checkbox-shape";
var CHECKBOX_UID_ATTRIBUTE = "data-ts-checkbox-block-uid";
var CHECKBOX_STYLE_ATTRIBUTE = "data-ts-checkbox-style";
var AMBIENT_MOTION_ATTRIBUTE = "data-ts-ambient-motion";
var ALERT_BEACON_ATTRIBUTE = "data-ts-alert-beacon";
var STATUS_POP_ATTRIBUTE = "data-ts-status-pop";
var STATUS_POP_RECENT_WINDOW_MS = 2e3;
var STATUS_POP_DURATION_MS = 520;
var OWNED_CHECKBOX_SELECTOR = `.rm-checkbox[${CHECKBOX_STATUS_ATTRIBUTE}]`;
var MANAGED_STATUS_PILL_ATTRIBUTE = "data-ts-managed-status-pill";
var HIDDEN_STATUS_PILL_ATTRIBUTE = "data-ts-status-pill-hidden";
var OWNED_STATUS_PILL_SELECTOR = `[${MANAGED_STATUS_PILL_ATTRIBUTE}]`;
var CHECKBOX_STYLE_VALUES = Object.freeze({
  OUTLINE: "Outline",
  GLASS: "Glass",
  SOLID: "Solid",
  MINIMAL: "Minimal"
});
function normalizeCheckboxStyle(value, fallback = CHECKBOX_STYLE_VALUES.OUTLINE) {
  const candidate = value && typeof value === "object" ? value.target?.value ?? value.currentTarget?.value ?? value.value : value;
  const normalized = String(candidate || "").trim();
  return Object.values(CHECKBOX_STYLE_VALUES).includes(normalized) ? normalized : fallback;
}
function checkboxStyleToAttributeValue(value) {
  const normalized = normalizeCheckboxStyle(value);
  if (normalized === CHECKBOX_STYLE_VALUES.GLASS) return "glass";
  if (normalized === CHECKBOX_STYLE_VALUES.SOLID) return "solid";
  if (normalized === CHECKBOX_STYLE_VALUES.MINIMAL) return "minimal";
  return null;
}
var DEFAULT_LIGHT_SURFACE = Object.freeze({ r: 245, g: 248, b: 250 });
var DEFAULT_DARK_SURFACE = Object.freeze({ r: 32, g: 43, b: 51 });
var BLACK = Object.freeze({ r: 0, g: 0, b: 0 });
var NEAR_BLACK = Object.freeze({ r: 16, g: 22, b: 26 });
var WHITE = Object.freeze({ r: 255, g: 255, b: 255 });
var NEAR_BLACK_CSS = "#10161a";
var WHITE_CSS = "#ffffff";
var BUILTIN_SHAPES = Object.freeze({
  ACTIVE: "active",
  WAITING: "waiting",
  IN_REVIEW: "in-review",
  HOLDING: "holding",
  INCUBATING: "incubating",
  ALERT: "alert",
  CANCELLED: "cancelled",
  SERIES: "series",
  MOVIE: "movie",
  WATCHING: "watching",
  WATCHLIST: "watchlist",
  UPCOMING: "upcoming",
  REWATCH: "rewatch",
  DROPPED: "dropped",
  IMPORTANT: "important",
  STARRED: "starred",
  DISCUSS: "discuss",
  BILLABLE: "billable",
  BUG: "bug",
  DRAFT: "draft",
  DEADLINE: "deadline",
  KAWAII: "kawaii",
  FLOWER: "flower",
  SUN: "sun",
  MOON: "moon"
});
var MEDIA_STATUS_SHAPES = Object.freeze({
  series: "series",
  movie: "movie",
  watching: "watching",
  watchlist: "watchlist",
  upcoming: "upcoming",
  rewatch: "rewatch",
  dropped: "dropped"
});
var EXTRA_STATUS_SHAPES = Object.freeze({
  important: "important",
  starred: "starred",
  discuss: "discuss",
  billable: "billable",
  bug: "bug",
  draft: "draft",
  deadline: "deadline",
  kawaii: "kawaii",
  flower: "flower",
  sun: "sun",
  moon: "moon"
});
function getMediaStatusShape(name) {
  const key = String(name ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(MEDIA_STATUS_SHAPES, key) ? MEDIA_STATUS_SHAPES[key] : null;
}
function getExtraStatusShape(name) {
  const key = String(name ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(EXTRA_STATUS_SHAPES, key) ? EXTRA_STATUS_SHAPES[key] : null;
}
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
function channel(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 255) : 0;
}
function normalizeRgb(value, fallback = BLACK) {
  if (!value || typeof value !== "object") return { ...fallback };
  return {
    r: channel(value.r),
    g: channel(value.g),
    b: channel(value.b)
  };
}
function linearizedChannel(value) {
  const normalized = channel(value) / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}
function relativeLuminance(rgb) {
  const value = normalizeRgb(rgb);
  return 0.2126 * linearizedChannel(value.r) + 0.7152 * linearizedChannel(value.g) + 0.0722 * linearizedChannel(value.b);
}
function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}
function mixRgb(from, to, amount) {
  const start = normalizeRgb(from);
  const end = normalizeRgb(to);
  const ratio = clamp(Number(amount) || 0, 0, 1);
  return {
    r: start.r + (end.r - start.r) * ratio,
    g: start.g + (end.g - start.g) * ratio,
    b: start.b + (end.b - start.b) * ratio
  };
}
function compositeRgb(foreground, background, alpha) {
  const front = normalizeRgb(foreground);
  const back = normalizeRgb(background);
  const opacity = clamp(Number(alpha) || 0, 0, 1);
  return {
    r: front.r * opacity + back.r * (1 - opacity),
    g: front.g * opacity + back.g * (1 - opacity),
    b: front.b * opacity + back.b * (1 - opacity)
  };
}
function nearestPassingMix(base, surface, target, minimumContrast) {
  if (contrastRatio(target, surface) < minimumContrast) return null;
  let low = 0;
  let high = 1;
  for (let index = 0; index < 28; index += 1) {
    const middle = (low + high) / 2;
    const candidate = mixRgb(base, target, middle);
    if (contrastRatio(candidate, surface) >= minimumContrast) high = middle;
    else low = middle;
  }
  return {
    amount: high,
    color: mixRgb(base, target, high)
  };
}
function deriveAccessibleAccent(baseRgb, surfaceRgb, minimumContrast = 3.2) {
  const base = normalizeRgb(baseRgb);
  const surface = normalizeRgb(surfaceRgb, DEFAULT_LIGHT_SURFACE);
  const required = Math.max(1, Number(minimumContrast) || 3.2);
  if (contrastRatio(base, surface) >= required) return base;
  const candidates = [
    nearestPassingMix(base, surface, BLACK, required),
    nearestPassingMix(base, surface, WHITE, required)
  ].filter(Boolean);
  candidates.sort((a, b) => a.amount - b.amount);
  return candidates[0]?.color || (relativeLuminance(surface) > 0.5 ? { ...BLACK } : { ...WHITE });
}
function roundedRgb(rgb) {
  const value = normalizeRgb(rgb);
  return {
    r: Math.round(value.r),
    g: Math.round(value.g),
    b: Math.round(value.b)
  };
}
function rgbCss(rgb) {
  const value = roundedRgb(rgb);
  return `rgb(${value.r}, ${value.g}, ${value.b})`;
}
function rgbaCss(rgb, alpha) {
  const value = roundedRgb(rgb);
  const opacity = clamp(Number(alpha) || 0, 0, 1);
  return `rgba(${value.r}, ${value.g}, ${value.b}, ${opacity})`;
}
function pickOnAccentColor(accentRgb) {
  const accent = normalizeRgb(accentRgb);
  const whiteContrast = contrastRatio(WHITE, accent);
  const darkContrast = contrastRatio(NEAR_BLACK, accent);
  if (whiteContrast >= 3.4) return WHITE_CSS;
  return whiteContrast >= darkContrast ? WHITE_CSS : NEAR_BLACK_CSS;
}
function buildStatusCheckboxColors({
  baseRgb,
  lightSurfaceRgb = DEFAULT_LIGHT_SURFACE,
  darkSurfaceRgb = DEFAULT_DARK_SURFACE,
  minimumContrast = 3.2
} = {}) {
  const base = normalizeRgb(baseRgb, { r: 100, g: 116, b: 139 });
  const lightSurface = normalizeRgb(lightSurfaceRgb, DEFAULT_LIGHT_SURFACE);
  const darkSurface = normalizeRgb(darkSurfaceRgb, DEFAULT_DARK_SURFACE);
  const certificationContrast = Math.max(1, Number(minimumContrast) || 3.2) + 0.05;
  const lightAccent = deriveAccessibleAccent(base, lightSurface, certificationContrast);
  const darkAccent = deriveAccessibleAccent(base, darkSurface, certificationContrast);
  const roundedLightAccent = roundedRgb(lightAccent);
  const roundedDarkAccent = roundedRgb(darkAccent);
  return Object.freeze({
    base: roundedRgb(base),
    lightSurface: roundedRgb(lightSurface),
    darkSurface: roundedRgb(darkSurface),
    lightAccent: roundedLightAccent,
    darkAccent: roundedDarkAccent,
    lightAccentCss: rgbCss(roundedLightAccent),
    darkAccentCss: rgbCss(roundedDarkAccent),
    lightOnAccentCss: pickOnAccentColor(roundedLightAccent),
    darkOnAccentCss: pickOnAccentColor(roundedDarkAccent),
    lightWashCss: rgbaCss(base, 0.09),
    darkWashCss: rgbaCss(base, 0.16),
    lightBeaconCss: rgbaCss(roundedLightAccent, 0.52),
    darkBeaconCss: rgbaCss(roundedDarkAccent, 0.68)
  });
}
function buildStatusPillColors({
  baseRgb,
  preferredTextRgb,
  lightSurfaceRgb = DEFAULT_LIGHT_SURFACE,
  darkSurfaceRgb = DEFAULT_DARK_SURFACE,
  minimumTextContrast = 4.8,
  lightBackgroundAlpha = 0.1,
  darkBackgroundAlpha = 0.2
} = {}) {
  const base = normalizeRgb(baseRgb, { r: 100, g: 116, b: 139 });
  const preferredText = normalizeRgb(preferredTextRgb, base);
  const lightSurface = normalizeRgb(lightSurfaceRgb, DEFAULT_LIGHT_SURFACE);
  const darkSurface = normalizeRgb(darkSurfaceRgb, DEFAULT_DARK_SURFACE);
  const lightBackground = compositeRgb(base, lightSurface, lightBackgroundAlpha);
  const darkBackground = compositeRgb(base, darkSurface, darkBackgroundAlpha);
  const certificationContrast = Math.max(1, Number(minimumTextContrast) || 4.8) + 0.08;
  const lightText = deriveAccessibleAccent(
    preferredText,
    lightBackground,
    certificationContrast
  );
  const darkText = deriveAccessibleAccent(
    preferredText,
    darkBackground,
    certificationContrast
  );
  const lightBorder = deriveAccessibleAccent(base, lightSurface, 3.25);
  const darkBorder = deriveAccessibleAccent(base, darkSurface, 3.25);
  return Object.freeze({
    base: roundedRgb(base),
    lightSurface: roundedRgb(lightSurface),
    darkSurface: roundedRgb(darkSurface),
    lightBackground: roundedRgb(lightBackground),
    darkBackground: roundedRgb(darkBackground),
    lightText: roundedRgb(lightText),
    darkText: roundedRgb(darkText),
    lightBackgroundCss: rgbaCss(base, lightBackgroundAlpha),
    darkBackgroundCss: rgbaCss(base, darkBackgroundAlpha),
    lightTextCss: rgbCss(lightText),
    darkTextCss: rgbCss(darkText),
    lightBorderCss: rgbaCss(lightBorder, 0.48),
    darkBorderCss: rgbaCss(darkBorder, 0.62)
  });
}
function getStatusCheckboxShape(statusKey, statusName) {
  const key = String(statusKey || "").trim().toUpperCase();
  return BUILTIN_SHAPES[key] || getMediaStatusShape(statusName) || getExtraStatusShape(statusName) || "custom";
}
function getStatusGroup(statusKey, statusName) {
  const shape = getStatusCheckboxShape(statusKey, statusName);
  if (Object.values(MEDIA_STATUS_SHAPES).includes(shape)) return "media";
  if (Object.values(EXTRA_STATUS_SHAPES).includes(shape)) return "extra";
  return "task";
}
function isMediaStatus(statusKey, statusName) {
  return getStatusGroup(statusKey, statusName) === "media";
}
function lookupStatusName(statusNames, statusKey) {
  if (!statusKey) return null;
  if (statusNames instanceof Map) return statusNames.get(statusKey) || null;
  return statusNames?.[statusKey] || null;
}
function lookupStatusKey(statusTagToKey, tagTitle) {
  if (!tagTitle) return null;
  if (statusTagToKey instanceof Map) return statusTagToKey.get(tagTitle) || null;
  return statusTagToKey?.[tagTitle] || null;
}
function decideStatusCheckboxAnnotation({
  enabled = true,
  tagTitle,
  statusTagToKey,
  statusNames,
  blockString,
  textHelpers
} = {}) {
  if (!enabled || typeof blockString !== "string" || !textHelpers?.parseManagedPrefix) {
    return null;
  }
  const statusKey = lookupStatusKey(statusTagToKey, tagTitle);
  if (!statusKey) return null;
  const parsed = textHelpers.parseManagedPrefix(blockString);
  if (!parsed?.managed || !parsed?.hadStatus || parsed.currentStatus !== statusKey || parsed.taskKind !== "todo" && parsed.taskKind !== "done") {
    return null;
  }
  return Object.freeze({
    statusKey,
    shape: getStatusCheckboxShape(statusKey, lookupStatusName(statusNames, statusKey))
  });
}
function hasClass(element, className) {
  return Boolean(element?.classList?.contains?.(className));
}
function findSiblingTaskCheckbox(statusPill) {
  const parent = statusPill?.parentElement;
  if (!parent) return null;
  const children = Array.from(parent.children || []);
  const candidates = children.filter((child) => hasClass(child, "rm-checkbox"));
  if (candidates.length !== 1) return null;
  const checkbox = candidates[0];
  const input = checkbox.querySelector?.('input[type="checkbox"]');
  const checkmark = checkbox.querySelector?.(".checkmark");
  return input && checkmark ? checkbox : null;
}
function clearStatusCheckboxAnnotation(checkbox) {
  if (!checkbox?.removeAttribute) return;
  checkbox.removeAttribute(CHECKBOX_STATUS_ATTRIBUTE);
  checkbox.removeAttribute(CHECKBOX_SHAPE_ATTRIBUTE);
  checkbox.removeAttribute(CHECKBOX_UID_ATTRIBUTE);
  checkbox.removeAttribute(ALERT_BEACON_ATTRIBUTE);
  checkbox.removeAttribute(STATUS_POP_ATTRIBUTE);
}
function applyStatusCheckboxAnnotation(checkbox, decision, blockUid = null) {
  if (!checkbox?.setAttribute || !decision?.statusKey) {
    clearStatusCheckboxAnnotation(checkbox);
    return false;
  }
  checkbox.setAttribute(CHECKBOX_STATUS_ATTRIBUTE, decision.statusKey);
  checkbox.setAttribute(
    CHECKBOX_SHAPE_ATTRIBUTE,
    decision.shape || getStatusCheckboxShape(decision.statusKey)
  );
  const certifiedUid = String(blockUid || "").trim();
  if (certifiedUid) checkbox.setAttribute(CHECKBOX_UID_ATTRIBUTE, certifiedUid);
  else checkbox.removeAttribute(CHECKBOX_UID_ATTRIBUTE);
  return true;
}
function syncStatusCheckboxForPill({
  statusPill,
  enabled = true,
  tagTitle,
  statusTagToKey,
  statusNames,
  blockString,
  blockUid,
  textHelpers
} = {}) {
  const checkbox = findSiblingTaskCheckbox(statusPill);
  if (!checkbox) return Object.freeze({ annotated: false, reason: "missing-exact-checkbox" });
  clearStatusCheckboxAnnotation(checkbox);
  const decision = decideStatusCheckboxAnnotation({
    enabled,
    tagTitle,
    statusTagToKey,
    statusNames,
    blockString,
    textHelpers
  });
  if (!decision) return Object.freeze({ annotated: false, reason: "not-managed" });
  applyStatusCheckboxAnnotation(checkbox, decision, blockUid);
  return Object.freeze({
    annotated: true,
    checkbox,
    statusKey: decision.statusKey,
    shape: decision.shape
  });
}
function clearStatusPillPresentation(statusPill) {
  if (!statusPill?.removeAttribute) return;
  statusPill.removeAttribute(MANAGED_STATUS_PILL_ATTRIBUTE);
  statusPill.removeAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE);
  statusPill.removeAttribute(ALERT_BEACON_ATTRIBUTE);
}
function applyManagedStatusPillPresentation(statusPill, { hidden = false } = {}) {
  if (!statusPill?.setAttribute) {
    clearStatusPillPresentation(statusPill);
    return false;
  }
  statusPill.setAttribute(MANAGED_STATUS_PILL_ATTRIBUTE, "true");
  if (hidden) statusPill.setAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE, "true");
  else statusPill.removeAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE);
  return true;
}
function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function countExactStatusTagOccurrences(blockString, tagTitle) {
  if (typeof blockString !== "string" || !tagTitle) return 0;
  const title = escapeRegex(tagTitle);
  const matcher = new RegExp(
    `#\\[\\[${title}\\]\\]|#${title}(?=$|\\s|[\\.,;:!\\?\\)\\]\\}])`,
    "g"
  );
  return Array.from(blockString.matchAll(matcher)).length;
}
function isExactManagedStatusPill({
  statusPill,
  tagTitle,
  blockString
} = {}) {
  const parent = statusPill?.parentElement;
  if (!parent || statusPill.getAttribute?.("data-tag") !== tagTitle) return false;
  const checkbox = findSiblingTaskCheckbox(statusPill);
  if (!checkbox) return false;
  const children = Array.from(parent.children || []);
  if (children.indexOf(checkbox) >= children.indexOf(statusPill)) return false;
  const renderedMatches = children.filter(
    (child) => child?.classList?.contains?.("rm-page-ref") && child.getAttribute?.("data-tag") === tagTitle
  );
  const textOccurrences = countExactStatusTagOccurrences(blockString, tagTitle);
  return renderedMatches.length > 0 && renderedMatches.length === textOccurrences && renderedMatches[0] === statusPill;
}
function syncStatusPresentationForPill({
  statusPill,
  hideManagedPill = false,
  alertBeaconEnabled = false,
  ...checkboxOptions
} = {}) {
  clearStatusPillPresentation(statusPill);
  if (!findSiblingTaskCheckbox(statusPill)) {
    return Object.freeze({ annotated: false, reason: "missing-exact-checkbox" });
  }
  if (!isExactManagedStatusPill({
    statusPill,
    tagTitle: checkboxOptions.tagTitle,
    blockString: checkboxOptions.blockString
  })) {
    return Object.freeze({
      annotated: false,
      managed: false,
      hidden: false,
      reason: "not-exact-managed-pill"
    });
  }
  const checkboxResult = syncStatusCheckboxForPill({
    statusPill,
    ...checkboxOptions
  });
  if (!checkboxResult.annotated) return checkboxResult;
  applyManagedStatusPillPresentation(statusPill, { hidden: hideManagedPill });
  const input = checkboxResult.checkbox?.querySelector?.('input[type="checkbox"]');
  const shouldBeacon = Boolean(alertBeaconEnabled) && checkboxResult.statusKey === "ALERT" && input?.checked === false;
  if (shouldBeacon) {
    checkboxResult.checkbox.setAttribute(ALERT_BEACON_ATTRIBUTE, "true");
    statusPill.setAttribute(ALERT_BEACON_ATTRIBUTE, "true");
  }
  return Object.freeze({
    ...checkboxResult,
    managed: true,
    hidden: Boolean(hideManagedPill),
    alertBeacon: shouldBeacon
  });
}
function includingRoot(root, selector) {
  const nodes = [];
  if (root?.matches?.(selector)) nodes.push(root);
  if (root?.querySelectorAll) nodes.push(...root.querySelectorAll(selector));
  return nodes;
}
function clearOwnedStatusCheckboxes(root) {
  const checkboxes = includingRoot(root, OWNED_CHECKBOX_SELECTOR).filter(
    (checkbox) => !checkbox.closest?.(".ts-style-preview, .ts-status-chooser, .ts-rendered-icon")
  );
  checkboxes.forEach(clearStatusCheckboxAnnotation);
  return checkboxes.length;
}
function clearOwnedStatusPillPresentations(root) {
  const statusPills = includingRoot(root, OWNED_STATUS_PILL_SELECTOR);
  statusPills.forEach(clearStatusPillPresentation);
  return statusPills.length;
}
function createStatusPopTracker({
  windowLike = typeof window !== "undefined" ? window : globalThis,
  lifecycle = null,
  recentWindowMs = STATUS_POP_RECENT_WINDOW_MS,
  popDurationMs = STATUS_POP_DURATION_MS
} = {}) {
  const recentWrites = /* @__PURE__ */ new Map();
  const activePops = /* @__PURE__ */ new Map();
  let enabled = true;
  let disposed = false;
  const setTimer = (fn, delay) => (windowLike?.setTimeout || globalThis.setTimeout)(fn, delay);
  const clearTimer = (id) => {
    if (id == null) return;
    (windowLike?.clearTimeout || globalThis.clearTimeout)(id);
  };
  function clearRecent(blockUid) {
    const entry = recentWrites.get(blockUid);
    if (!entry) return;
    clearTimer(entry.timerId);
    recentWrites.delete(blockUid);
  }
  function clearPopForCheckbox(checkbox) {
    const active = activePops.get(checkbox);
    if (active) {
      clearTimer(active.timerId);
      if (active.onAnimationEnd) {
        try {
          checkbox?.removeEventListener?.("animationend", active.onAnimationEnd);
        } catch (_) {
        }
      }
      activePops.delete(checkbox);
    }
    checkbox?.removeAttribute?.(STATUS_POP_ATTRIBUTE);
  }
  function markWritten(blockUid, statusKey) {
    if (disposed || !enabled || !blockUid || !statusKey) return false;
    clearRecent(blockUid);
    const timerId = setTimer(() => {
      recentWrites.delete(blockUid);
    }, recentWindowMs);
    recentWrites.set(blockUid, { statusKey, timerId });
    return true;
  }
  function hasPendingWrite(blockUid, statusKey) {
    if (disposed || !enabled || !blockUid) return false;
    const entry = recentWrites.get(blockUid);
    if (!entry) return false;
    return !statusKey || entry.statusKey === statusKey;
  }
  function consumeWrite(blockUid) {
    clearRecent(blockUid);
  }
  function isPopping(checkbox, statusKey) {
    if (disposed || !enabled || !checkbox) return false;
    const active = activePops.get(checkbox);
    if (!active) return false;
    return !statusKey || active.statusKey === statusKey;
  }
  function triggerPop(checkbox, statusKey) {
    if (disposed || !enabled || !checkbox?.setAttribute || !statusKey) return false;
    const input = checkbox.querySelector?.('input[type="checkbox"]');
    if (input?.checked === true) {
      clearPopForCheckbox(checkbox);
      return false;
    }
    clearPopForCheckbox(checkbox);
    checkbox.setAttribute(STATUS_POP_ATTRIBUTE, "true");
    const finish = () => clearPopForCheckbox(checkbox);
    const onAnimationEnd = (event) => {
      if (event?.animationName && !String(event.animationName).startsWith("ts-status-pop-")) {
        return;
      }
      finish();
    };
    const timerId = setTimer(finish, popDurationMs);
    activePops.set(checkbox, { timerId, statusKey, onAnimationEnd });
    try {
      checkbox.addEventListener?.("animationend", onAnimationEnd);
    } catch (_) {
    }
    return true;
  }
  function restorePopAttributeIfActive(checkbox, statusKey) {
    if (!isPopping(checkbox, statusKey)) {
      if (activePops.has(checkbox)) clearPopForCheckbox(checkbox);
      return false;
    }
    const input = checkbox.querySelector?.('input[type="checkbox"]');
    if (input?.checked === true) {
      clearPopForCheckbox(checkbox);
      return false;
    }
    checkbox.setAttribute?.(STATUS_POP_ATTRIBUTE, "true");
    return true;
  }
  function clearAll() {
    for (const uid of [...recentWrites.keys()]) clearRecent(uid);
    for (const checkbox of [...activePops.keys()]) clearPopForCheckbox(checkbox);
  }
  function setEnabled(nextValue) {
    enabled = Boolean(nextValue);
    if (!enabled) clearAll();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearAll();
  }
  lifecycle?.add?.(dispose);
  return {
    get enabled() {
      return enabled;
    },
    get pendingCount() {
      return recentWrites.size;
    },
    get activeCount() {
      return activePops.size;
    },
    setEnabled,
    markWritten,
    hasPendingWrite,
    consumeWrite,
    isPopping,
    triggerPop,
    restorePopAttributeIfActive,
    clearPopForCheckbox,
    clearAll,
    dispose
  };
}

// src/public-api.js
var API_VERSION = 1;
var GLOBAL_NAME = "RoamTaskStatusTags";
var READY_EVENT = "roam-task-status-tags:ready";
var UNLOAD_EVENT = "roam-task-status-tags:unload";
var API_EVENTS = Object.freeze(["change", "statuses"]);
var API_FEATURES = Object.freeze([
  "statusOfBlock",
  "tasks",
  "counts",
  "renderIcon",
  "aiTools"
]);
var DEFAULT_TASK_LIMIT = 50;
var MIN_TASK_LIMIT = 1;
var MAX_TASK_LIMIT = 200;
var EVENT_TYPES = new Set(API_EVENTS);
var PUBLIC_STATUSES = /* @__PURE__ */ new Set([
  "updated",
  "rejected",
  "unknown",
  "conflict",
  "not-updated",
  "unchanged"
]);
var emitters = /* @__PURE__ */ new WeakMap();
var renderedIconCleanups = /* @__PURE__ */ new WeakMap();
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
      tagTitles: [tagTitle]
    };
  }
  return { statuses, cycleOrder };
}
function validStatusNames(catalog) {
  return (Array.isArray(catalog) ? catalog : []).map((row) => row?.name).filter((name) => typeof name === "string" && name.length > 0);
}
function unknownStatusError(name, catalog) {
  const valid = validStatusNames(catalog);
  const label = name === null ? "null" : String(name);
  const list = valid.length ? valid.join(", ") : "(none)";
  return new Error(`Unknown status "${label}". Valid statuses: ${list}`);
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
function clampTaskLimit(value, fallback = DEFAULT_TASK_LIMIT) {
  if (value === void 0 || value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_TASK_LIMIT, Math.max(MIN_TASK_LIMIT, Math.trunc(parsed)));
}
function isElementLike(node) {
  if (!node || typeof node !== "object") return false;
  if (node.nodeType !== void 0 && node.nodeType !== 1) return false;
  return typeof node.appendChild === "function" && typeof node.tagName === "string";
}
function noop() {
}
function mapPublicResult(outcome) {
  if (outcome == null || typeof outcome !== "object") {
    return { status: "unknown", didWrite: false, reason: "unmapped-result" };
  }
  const known = PUBLIC_STATUSES.has(outcome.status);
  const status = known ? outcome.status : "unknown";
  const mapped = {
    status,
    didWrite: status === "updated" && outcome.didWrite === true
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
function publicStatusRow({ key, name, tag, glyph, group, inCycle, colors }) {
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
      text: String(colors?.lightTextCss ?? "")
    }),
    dark: Object.freeze({
      base: String(colors?.darkBackgroundCss ?? ""),
      text: String(colors?.darkTextCss ?? "")
    })
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
function emitStatusChange(api, detail) {
  const emitter = emitters.get(api);
  if (!emitter) return;
  dispatch(emitter, "change", detail);
}
function emitStatusCatalog(api, detail) {
  const emitter = emitters.get(api);
  if (!emitter) return;
  dispatch(emitter, "statuses", detail ?? { apiVersion: API_VERSION });
}
function clearRenderedIcons(api) {
  const active = renderedIconCleanups.get(api);
  if (!active) return;
  for (const cleanup of [...active]) {
    try {
      cleanup();
    } catch (_) {
    }
  }
  active.clear();
}
function emitChange(emitter, detail) {
  dispatch(emitter, "change", detail);
}
function createPublicApi({
  readCatalog,
  readStatuses,
  createTextHelpers,
  setBlockStatus,
  cycleBlockStatus,
  readBlockString = null,
  queryTasks = null,
  documentLike = null
} = {}) {
  requiredFunction("readCatalog", readCatalog);
  requiredFunction("readStatuses", readStatuses);
  requiredFunction("createTextHelpers", createTextHelpers);
  requiredFunction("setBlockStatus", setBlockStatus);
  requiredFunction("cycleBlockStatus", cycleBlockStatus);
  const emitter = new EventTarget();
  const buckets = /* @__PURE__ */ new Map();
  const liveIcons = /* @__PURE__ */ new Set();
  function statusEntriesForQuery(entries) {
    return (Array.isArray(entries) ? entries : []).filter((entry) => entry?.key && entry?.name).map((entry) => ({
      key: entry.key,
      name: entry.name,
      tagTitle: entry.tag || `task-status/${entry.name}`
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
        const row = parsed.currentStatus ? (catalog || []).find((entry) => entry?.key === parsed.currentStatus) : null;
        return {
          found: true,
          isTask: true,
          done: parsed.taskKind === "done",
          status: typeof row?.name === "string" && row.name ? row.name : null
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
      if (status !== void 0) {
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
        includeDone: Boolean(includeDone)
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
        page: typeof row.page === "string" ? row.page : null
      }));
      return { tasks: sliced, truncated };
    },
    async counts({ includeDone = false } = {}) {
      if (typeof queryTasks !== "function") {
        throw new Error("Task query reader is unavailable");
      }
      const catalog = readCatalog() || [];
      const counts = {};
      const nameByKey = /* @__PURE__ */ new Map();
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
        includeDone: Boolean(includeDone)
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
      const mapped = mapPublicResult(outcome);
      if (mapped.status !== "updated") return mapped;
      const row = (catalog || []).find((entry) => entry?.key === resolved.key);
      emitChange(emitter, {
        apiVersion: API_VERSION,
        uid,
        name: row?.name ?? null,
        status: "updated"
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
        status: "updated"
      });
      return mapped;
    },
    addEventListener(type, cb) {
      if (!EVENT_TYPES.has(type) || typeof cb !== "function") return;
      let bag = buckets.get(type);
      if (!bag) {
        bag = /* @__PURE__ */ new Map();
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
    }
  };
  const frozen = Object.freeze(api);
  emitters.set(frozen, emitter);
  renderedIconCleanups.set(frozen, liveIcons);
  return frozen;
}
var fire = (win, type, detail, Ctor) => {
  try {
    const C = Ctor ?? win.CustomEvent ?? globalThis.CustomEvent;
    if (C) win.dispatchEvent(new C(type, { detail }));
  } catch (error) {
    console.warn("[TaskStatus] event dispatch failed", error);
  }
};
function installPublicApi(api, { win = globalThis.window ?? globalThis, CustomEventCtor } = {}) {
  win[GLOBAL_NAME] = api;
  fire(win, READY_EVENT, { apiVersion: API_VERSION }, CustomEventCtor);
}
function uninstallPublicApi(api, { win = globalThis.window ?? globalThis, CustomEventCtor } = {}) {
  const ours = win[GLOBAL_NAME] === api;
  if (ours) delete win[GLOBAL_NAME];
  fire(win, UNLOAD_EVENT, { apiVersion: API_VERSION }, CustomEventCtor);
  return ours;
}

// src/ai-tools.js
var AI_TOOL_NAMES = Object.freeze([
  "list_statuses",
  "get_task_status",
  "list_tasks",
  "status_counts",
  "set_task_status"
]);
var TAG_FORMAT = "{{[[TODO]]}} #[[task-status/<Name>]] text";
var MAX_TOOLS = 25;
var MAX_GET_UIDS = 50;
var MAX_SET_CHANGES = 10;
var MAX_SCHEMA_CHARS = 3800;
function normalizeBlockUid(raw) {
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
  return readLiveStatuses(api).map((row) => row?.name).filter((name) => typeof name === "string" && name.length > 0);
}
function buildListTasksSchema(names) {
  const make = (statusProp) => ({
    type: "object",
    properties: {
      status: statusProp,
      include_done: {
        type: "boolean",
        description: "Include DONE tasks when true. Default false."
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 200,
        description: "Maximum tasks to return, from 1 to 200 (default 50)."
      }
    },
    additionalProperties: false
  });
  if (Array.isArray(names) && names.length > 0) {
    const withEnum = make({
      type: "string",
      enum: [...names],
      description: "Optional status name to filter by."
    });
    if (JSON.stringify(withEnum).length <= MAX_SCHEMA_CHARS) {
      return withEnum;
    }
  }
  return make({
    type: "string",
    description: "Optional status name to filter by."
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
              description: "Block uid of an existing task, bare or wrapped in (( ))."
            },
            status: statusProp
          },
          required: ["uid", "status"],
          additionalProperties: false
        }
      }
    },
    required: ["changes"],
    additionalProperties: false
  });
  if (Array.isArray(names) && names.length > 0) {
    const withEnum = make({
      type: ["string", "null"],
      enum: [...names, null],
      description: "Target status name, or null to clear the status tag."
    });
    if (JSON.stringify(withEnum).length <= MAX_SCHEMA_CHARS) {
      return withEnum;
    }
  }
  return make({
    type: ["string", "null"],
    description: "Target status name, or null to clear the status tag."
  });
}
function createAiTools({ api, setStatusForAgent } = {}) {
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
    description: "Lists every task status configured in this graph with its tag, group (task, media, or extra), whether click-to-cycle visits it, and the tag format used on task blocks.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    handler() {
      const statuses = readLiveStatuses(api).map((row) => ({
        name: row.name,
        tag: row.tag,
        group: row.group,
        cycles: Boolean(row.inCycle)
      }));
      return { statuses, tagFormat: TAG_FORMAT };
    }
  };
  const get_task_status = {
    name: "get_task_status",
    scope: "read",
    description: "Reads the current workflow status and TODO/DONE state for 1 to 50 blocks by uid (bare or wrapped in double parentheses). Reports whether each block exists and starts with a TODO or DONE macro.",
    inputSchema: {
      type: "object",
      properties: {
        uids: {
          type: "array",
          minItems: 1,
          maxItems: MAX_GET_UIDS,
          items: { type: "string" },
          description: "1 to 50 block uids, bare or wrapped in (( ))."
        }
      },
      required: ["uids"],
      additionalProperties: false
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
          status: info?.status ?? null
        });
      }
      return { tasks };
    }
  };
  const list_tasks = {
    name: "list_tasks",
    scope: "read",
    description: "Lists tasks that carry a configured task status tag, optionally filtered to one status. Excludes DONE tasks unless include_done is true. Returns uid, text without prefix, status, done state, and page title.",
    inputSchema: buildListTasksSchema(names),
    async handler(args) {
      const status = args?.status;
      if (status !== void 0) {
        const live = readLiveStatuses(api);
        if (status === null) throw unknownStatusError(status, live);
        const resolved = resolveStatusKey(status, live);
        if (!resolved.ok || !resolved.key) throw unknownStatusError(status, live);
      }
      const includeDone = Boolean(args?.include_done);
      const limit = args?.limit;
      return api.tasks({ status, includeDone, limit });
    }
  };
  const status_counts = {
    name: "status_counts",
    scope: "read",
    description: "Counts tasks per configured status across the graph, including statuses with zero tasks. Excludes DONE tasks unless include_done is true.",
    inputSchema: {
      type: "object",
      properties: {
        include_done: {
          type: "boolean",
          description: "Include DONE tasks when true. Default false."
        }
      },
      additionalProperties: false
    },
    async handler(args) {
      return api.counts({ includeDone: Boolean(args?.include_done) });
    }
  };
  const set_task_status = {
    name: "set_task_status",
    scope: "edit",
    description: "Sets or clears the workflow status on 1 to 10 existing TODO or DONE tasks. Use this tool instead of editing block text directly: it is the safe way to change a status because it routes Better Tasks tasks through Better Tasks and updates the activity log. Pass status null to clear the tag. Never creates statuses, never converts plain blocks into tasks, and never changes TODO/DONE.",
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
        if (!Object.prototype.hasOwnProperty.call(entry, "status") || entry.status === void 0) {
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
      const userUid = typeof context?.tokenUserUid === "string" && context.tokenUserUid.trim() ? context.tokenUserUid.trim() : void 0;
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
          name: item.name
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
    }
  };
  return [list_statuses, get_task_status, list_tasks, status_counts, set_task_status];
}
function registerAiTools(extensionAPI, tools) {
  const ai = extensionAPI?.ai;
  if (typeof ai?.addTool !== "function") return () => {
  };
  const added = [];
  let warned = false;
  for (const tool of (tools ?? []).slice(0, MAX_TOOLS)) {
    try {
      ai.addTool({
        name: tool.name,
        description: tool.description,
        scope: tool.scope,
        inputSchema: tool.inputSchema,
        handler: tool.handler
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
      }
    }
  };
}
function createAiToolsManager({ extensionAPI, api, setStatusForAgent } = {}) {
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
          handler: tool.handler
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
    }
  });
}

// src/better-tasks-activity.js
var ACTIVITY_LOG_CONTAINER_TITLES = Object.freeze([
  "**Activity log**",
  "**Aktivitätsprotokoll**",
  "**Journal d'activité**",
  "**Log de atividade**",
  "**Registo de atividade**",
  "**Registro attività**",
  "**Registro de actividad**",
  "**Журнал активности**",
  "**سجل النشاط**",
  "**活动日志**",
  "**活動ログ**",
  "**活動日誌**",
  "**활동 로그**"
]);
var CONTAINER_TITLE_SET = new Set(ACTIVITY_LOG_CONTAINER_TITLES);
var STATUS_PREFIX = "task-status/";
var TASK_TOKEN_RE = /^\s*(?:\{\{\s*(?:\[\[\s*)?(?:TODO|DONE)(?:\s*\]\])?\s*\}\}|TODO|DONE)(?=$|[ \t\r\n])/i;
var STATUS_TAG_RE = /^[ \t]*#(?:\[\[(task-status\/[^\]\r\n]+)\]\]|(task-status\/[^\s.,;:!?)\]}\r\n]+))/i;
var ACTIVITY_FIELD = "status";
var ACTIVITY_SOURCE = "task-status-tags";
var TASK_CHILDREN_PULL_PATTERN = "[:block/uid {:block/children [:block/uid :block/string :block/order]}]";
function valueAt(value, keyword, fallback = null) {
  if (!value || typeof value !== "object") return fallback;
  const plain = keyword.replace(/^:/, "");
  return value[keyword] ?? value[plain] ?? value[plain.replace(/^block\//, "")] ?? fallback;
}
function orderedChildren(block) {
  const children = valueAt(block, ":block/children", []);
  if (!Array.isArray(children)) return [];
  return children.map((child) => ({
    uid: valueAt(child, ":block/uid", null),
    string: valueAt(child, ":block/string", null),
    order: Number(valueAt(child, ":block/order", 0)) || 0
  })).filter((child) => typeof child.uid === "string").sort((a, b) => a.order - b.order);
}
function isActivityLogContainerString(value) {
  return typeof value === "string" && CONTAINER_TITLE_SET.has(value.trim());
}
function statusLabelFromTaskText(text) {
  const source = String(text || "");
  const token = source.match(TASK_TOKEN_RE);
  if (!token) return null;
  const tag = source.slice(token[0].length).match(STATUS_TAG_RE);
  const title = tag?.[1] || tag?.[2];
  return title ? title.slice(STATUS_PREFIX.length) : null;
}
function statusLabelFromTagTitle(title) {
  if (typeof title !== "string") return null;
  const trimmed = title.trim();
  if (!trimmed.toLowerCase().startsWith(STATUS_PREFIX)) return null;
  const label = trimmed.slice(STATUS_PREFIX.length);
  return label || null;
}
function formatActivityTimestamp(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function renderStatusActivityLine({ to, ts }) {
  const label = to ? `${ACTIVITY_FIELD} → ${to}` : `${ACTIVITY_FIELD} removed`;
  return `${formatActivityTimestamp(ts)} — ${label}`;
}
function buildAttributeActivityProps({ field: field2, from, to, ts }) {
  const bt = { kind: "event", event: "attr_change", ts, field: field2, source: ACTIVITY_SOURCE };
  if (from) bt.from = from;
  if (to) bt.to = to;
  return { bt };
}
function buildStatusActivityProps({ from, to, ts }) {
  return buildAttributeActivityProps({ field: ACTIVITY_FIELD, from, to, ts });
}
function renderAttributeActivityLine({ field: field2, to, ts }) {
  return `${formatActivityTimestamp(ts)} — ${field2} → ${to}`;
}
function result(recorded, fields = {}) {
  return { recorded, ...fields };
}
function resolveRoamSurface(roamAlphaAPI) {
  const pull = roamAlphaAPI?.data?.async?.pull;
  const create = roamAlphaAPI?.data?.block?.create;
  const generateUID = roamAlphaAPI?.util?.generateUID;
  if ([pull, create, generateUID].some((fn) => typeof fn !== "function")) return null;
  return {
    pull: (...args) => pull.call(roamAlphaAPI.data.async, ...args),
    create: (...args) => create.call(roamAlphaAPI.data.block, ...args),
    generateUID: () => generateUID.call(roamAlphaAPI.util)
  };
}
function createBetterTasksActivityRecorder({ roamAlphaAPI, now = Date.now }) {
  async function pullChildren(roam, uid) {
    const block = await roam.pull(TASK_CHILDREN_PULL_PATTERN, [":block/uid", uid]);
    if (valueAt(block, ":block/uid", null) !== uid) return null;
    return orderedChildren(block);
  }
  async function appendLine(uid, roam, buildLine, { userUid } = {}) {
    let containerUid;
    let siblings;
    try {
      const taskChildren = await pullChildren(roam, uid);
      if (!taskChildren) return result(false, { reason: "block-not-found" });
      const container = taskChildren.find((child) => isActivityLogContainerString(child.string));
      if (!container) return result(false, { reason: "no-activity-log" });
      containerUid = container.uid;
      siblings = await pullChildren(roam, containerUid) || [];
    } catch (error) {
      return result(false, { reason: "activity-read-failed", error });
    }
    const { text, props } = buildLine(now());
    const last = siblings[siblings.length - 1];
    if (last && last.string === text) {
      return result(false, { reason: "duplicate", containerUid, entryUid: last.uid, text });
    }
    const entryUid = roam.generateUID();
    const block = { uid: entryUid, string: text, props };
    if (typeof userUid === "string" && userUid.trim()) {
      block["user-uid"] = userUid.trim();
    }
    try {
      await roam.create({
        location: { "parent-uid": containerUid, order: "last" },
        block
      });
    } catch (error) {
      return result(false, { reason: "activity-write-failed", error, containerUid });
    }
    return result(true, { reason: "recorded", containerUid, entryUid, text });
  }
  return Object.freeze({
    async record({ uid, previousString, nextString, statusTagTitle, userUid }) {
      if (typeof uid !== "string" || !uid.trim()) return result(false, { reason: "invalid-uid" });
      const roam = resolveRoamSurface(roamAlphaAPI);
      if (!roam) return result(false, { reason: "roam-api-unavailable" });
      const from = statusLabelFromTaskText(previousString);
      const to = statusTagTitle == null ? statusLabelFromTaskText(nextString) : statusLabelFromTagTitle(statusTagTitle);
      if ((from || null) === (to || null)) return result(false, { reason: "status-unchanged" });
      return appendLine(
        uid,
        roam,
        (ts) => ({
          text: renderStatusActivityLine({ to, ts }),
          props: buildStatusActivityProps({ from, to, ts })
        }),
        { userUid }
      );
    },
    async recordAttributeChange({ uid, field: field2, from, to, userUid }) {
      if (typeof uid !== "string" || !uid.trim()) return result(false, { reason: "invalid-uid" });
      if (typeof field2 !== "string" || !field2.trim() || typeof to !== "string" || !to) {
        return result(false, { reason: "invalid-change" });
      }
      const roam = resolveRoamSurface(roamAlphaAPI);
      if (!roam) return result(false, { reason: "roam-api-unavailable" });
      if ((from || null) === to) return result(false, { reason: "attribute-unchanged" });
      return appendLine(
        uid,
        roam,
        (ts) => ({
          text: renderAttributeActivityLine({ field: field2, to, ts }),
          props: buildAttributeActivityProps({ field: field2, from, to, ts })
        }),
        { userUid }
      );
    }
  });
}

// src/better-tasks-bridge.js
function callable(value, name) {
  return value && typeof value[name] === "function";
}
function resolveBetterTasksProvider(windowLike) {
  const namespace = windowLike?.betterTasks;
  const v2 = namespace?.v2;
  if (callable(v2, "classifyBlock") && callable(v2, "requestStatusTag")) {
    return { kind: "v2", capability: v2 };
  }
  const v1 = namespace?.v1;
  if (callable(v1, "classifyBlock")) {
    return { kind: "v1", capability: v1 };
  }
  const legacy = windowLike?.RoamExtensionTools?.["better-tasks"];
  if (namespace != null || legacy != null) return { kind: "legacy", capability: null };
  return { kind: "absent", capability: null };
}
function routed(status, fields = {}) {
  return { status, didWrite: status === "updated", ...fields };
}
function createBetterTasksStatusRouter({
  windowLike,
  directWriter,
  activityRecorder = null,
  readChildStrings = null
}) {
  if (!directWriter || typeof directWriter.apply !== "function") {
    throw new TypeError("directWriter.apply is required");
  }
  if (activityRecorder != null && typeof activityRecorder.record !== "function") {
    throw new TypeError("activityRecorder.record must be a function");
  }
  if (readChildStrings != null && typeof readChildStrings !== "function") {
    throw new TypeError("readChildStrings must be a function");
  }
  async function recordActivity(outcome, { uid, expectedString, nextString, statusTagTitle, userUid }) {
    if (!activityRecorder || outcome?.status !== "updated") return outcome;
    if (outcome.activity !== void 0) return outcome;
    let activity;
    try {
      const recordArgs = {
        uid,
        previousString: expectedString,
        nextString: typeof outcome.string === "string" ? outcome.string : nextString,
        statusTagTitle
      };
      if (typeof userUid === "string" && userUid.trim()) {
        recordArgs.userUid = userUid.trim();
      }
      activity = await activityRecorder.record(recordArgs);
    } catch (error) {
      activity = { recorded: false, reason: "activity-recorder-threw", error };
    }
    return { ...outcome, activity };
  }
  return Object.freeze({
    async apply({
      uid,
      expectedString,
      nextString,
      statusTagTitle,
      expectedLiveEditorString,
      editorString,
      userUid,
      requireExistingTask = false,
      requireBetterTasksReady = false
    }) {
      const editorOptions = expectedLiveEditorString === void 0 && editorString === void 0 ? {} : { expectedLiveEditorString, editorString };
      const normalizedUserUid = typeof userUid === "string" && userUid.trim() ? userUid.trim() : null;
      const directExtra = {};
      if (normalizedUserUid) directExtra.userUid = normalizedUserUid;
      if (requireExistingTask) directExtra.requireExistingTask = true;
      const provider = resolveBetterTasksProvider(windowLike);
      if (provider.kind === "absent") {
        if (requireBetterTasksReady) {
          if (typeof readChildStrings !== "function") {
            return routed("unknown", { reason: "better-tasks-children-read-unavailable" });
          }
          let childStrings;
          try {
            childStrings = await readChildStrings(uid);
          } catch (error) {
            return routed("unknown", { reason: "better-tasks-children-read-failed", error });
          }
          if (Array.isArray(childStrings) && childStrings.some(
            (child) => typeof child === "string" && child.trimStart().startsWith("BT_attr")
          )) {
            return routed("rejected", { reason: "better-tasks-not-ready" });
          }
        }
        return directWriter.apply({
          uid,
          expectedString,
          nextString,
          ...editorOptions,
          ...directExtra
        });
      }
      if (provider.kind === "legacy") {
        return routed("rejected", { reason: "better-tasks-capability-unavailable" });
      }
      let classification;
      try {
        classification = await provider.capability.classifyBlock(uid);
        if (classification?.kind === "ordinary") {
          classification = await provider.capability.classifyBlock(uid, {
            includeDescendants: true
          });
        }
      } catch (error) {
        return routed("unknown", { reason: "better-tasks-classification-failed", error });
      }
      if (!classification || classification.kind === "unknown") {
        return routed("unknown", {
          reason: classification?.reason || "better-tasks-classification-unknown",
          classification
        });
      }
      if (classification.kind === "task-owned") {
        return routed("rejected", { reason: "better-tasks-owned-child", classification });
      }
      if (classification.kind === "ordinary") {
        if (classification.containsManagedTasks) {
          return routed("rejected", {
            reason: "contains-better-tasks-descendants",
            classification
          });
        }
        return directWriter.apply({
          uid,
          expectedString,
          nextString,
          ...editorOptions,
          ...directExtra
        });
      }
      if (classification.kind !== "task") {
        return routed("unknown", { reason: "unsupported-classification", classification });
      }
      if (provider.kind !== "v2") {
        return routed("rejected", {
          reason: "better-tasks-v2-required",
          classification
        });
      }
      let outcome;
      try {
        outcome = await provider.capability.requestStatusTag(uid, {
          expectedString,
          statusTagTitle,
          source: "task-status-tags",
          ...editorOptions
        });
      } catch (error) {
        return routed("unknown", { reason: "better-tasks-status-request-failed", error });
      }
      return recordActivity(outcome, {
        uid,
        expectedString,
        nextString,
        statusTagTitle,
        userUid: normalizedUserUid
      });
    }
  });
}

// src/depot-settings.js
var EXTENSION_ID_NEEDLE = "roam-task-status-tags";
function normalizeId(value) {
  return typeof value === "string" ? value.trim() : "";
}
function findExtensionSettingsCandidates({ depot, extensionId = null } = {}) {
  const candidates = [];
  const seen = /* @__PURE__ */ new Set();
  const addCandidate = (value) => {
    const id = normalizeId(value);
    if (!id || seen.has(id)) return;
    seen.add(id);
    candidates.push(id);
  };
  addCandidate(extensionId);
  if (typeof depot?.getInstalledExtensions !== "function") {
    return candidates;
  }
  let installed;
  try {
    installed = depot.getInstalledExtensions();
  } catch (_) {
    return candidates;
  }
  if (!installed || typeof installed !== "object") {
    return candidates;
  }
  const entries = Array.isArray(installed) ? installed.map((entry) => [entry?.id, entry]) : Object.entries(installed);
  for (const [key, entry] of entries) {
    if (!entry || entry.running !== true) continue;
    const id = normalizeId(entry.id) || normalizeId(key);
    if (!id) continue;
    if (id.toLowerCase().includes(EXTENSION_ID_NEEDLE)) {
      addCandidate(id);
    }
  }
  return candidates;
}
function canOpenExtensionSettings({ roamAlphaAPI, extensionId = null } = {}) {
  const depot = roamAlphaAPI?.depot;
  if (typeof depot?.openSettings !== "function") return false;
  return findExtensionSettingsCandidates({ depot, extensionId }).length > 0;
}
async function openExtensionSettings({
  roamAlphaAPI,
  extensionId = null,
  warn = console.warn
} = {}) {
  const depot = roamAlphaAPI?.depot;
  if (typeof depot?.openSettings !== "function") {
    return { opened: false, reason: "api-unavailable" };
  }
  const candidates = findExtensionSettingsCandidates({ depot, extensionId });
  if (!candidates.length) {
    return { opened: false, reason: "no-candidates" };
  }
  let lastError = null;
  for (const id of candidates) {
    try {
      await depot.openSettings({ id });
      return { opened: true, id };
    } catch (error) {
      lastError = error;
    }
  }
  try {
    warn?.("[TaskStatus] Failed to open extension settings", lastError);
  } catch (_) {
  }
  return { opened: false, reason: "rejected", error: lastError };
}

// src/lifecycle.js
function isPromiseLike(value) {
  return value != null && typeof value.then === "function";
}
async function callSafely(disposer) {
  const result4 = disposer();
  if (isPromiseLike(result4)) await result4;
}
function createLifecycle() {
  let disposed = false;
  const disposers = [];
  const add = (disposer) => {
    if (typeof disposer !== "function") throw new TypeError("A disposer must be a function");
    if (disposed) {
      void callSafely(disposer).catch((error) => console.error("[TaskStatus] Late cleanup failed", error));
      return disposer;
    }
    disposers.push(disposer);
    return disposer;
  };
  return {
    get disposed() {
      return disposed;
    },
    add,
    async command(commandApi, config) {
      if (!commandApi?.addCommand || !commandApi?.removeCommand) {
        throw new TypeError("A command API with addCommand/removeCommand is required");
      }
      await commandApi.addCommand(config);
      add(() => commandApi.removeCommand({ label: config.label }));
    },
    event(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      add(() => target.removeEventListener(type, listener, options));
      return listener;
    },
    interval(callback, delay, ...args) {
      const id = globalThis.setInterval(callback, delay, ...args);
      add(() => globalThis.clearInterval(id));
      return id;
    },
    timeout(callback, delay, ...args) {
      const id = globalThis.setTimeout(callback, delay, ...args);
      add(() => globalThis.clearTimeout(id));
      return id;
    },
    observer(observer, target, options) {
      observer.observe(target, options);
      add(() => observer.disconnect());
      return observer;
    },
    node(node, parent = globalThis.document?.body) {
      if (!parent) throw new Error("A parent node is required outside the browser");
      parent.append(node);
      add(() => node.remove());
      return node;
    },
    pullWatch(dataApi, pattern, entity, callback) {
      if (!dataApi?.addPullWatch || !dataApi?.removePullWatch) {
        throw new TypeError("A Roam data API with addPullWatch/removePullWatch is required");
      }
      dataApi.addPullWatch(pattern, entity, callback);
      add(() => dataApi.removePullWatch(pattern, entity, callback));
      return callback;
    },
    async settingsPanel(extensionAPI, config) {
      await extensionAPI.settings.panel.create(config);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      const errors = [];
      for (const disposer of disposers.splice(0).reverse()) {
        try {
          await callSafely(disposer);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "One or more extension cleanups failed");
    }
  };
}

// src/episode-counter.js
var EPISODE_ATTRIBUTE = "Episode";
var EPISODE_GLYPHS = Object.freeze(["series", "watching", "rewatch"]);
var EPISODE_COUNTER_CLASS = "ts-episode-counter";
var EPISODE_UID_ATTRIBUTE = "data-ts-episode-uid";
var EPISODE_MAX = 9999;
var EPISODE_VALUE_RE = /^\s*S(\d+)E(\d+)\s*$/i;
var EPISODE_CHILD_RE = /^[ \t]*Episode::[ \t]*([^\r\n]*)/i;
var CHILDREN_PULL_PATTERN = "[:block/uid :block/string {:block/children [:block/uid :block/string :block/order]}]";
function validPart(value) {
  return Number.isInteger(value) && value >= 1 && value <= EPISODE_MAX;
}
function isValidEpisode(value) {
  return Boolean(value) && validPart(value.season) && validPart(value.episode);
}
function parseEpisode(text) {
  const match = typeof text === "string" ? text.match(EPISODE_VALUE_RE) : null;
  if (!match) return null;
  const parsed = { season: Number(match[1]), episode: Number(match[2]) };
  return isValidEpisode(parsed) ? parsed : null;
}
function formatEpisode({ season, episode }) {
  return `S${season}E${episode}`;
}
function nextEpisode({ season, episode }) {
  return { season, episode: episode + 1 };
}
function newSeason({ season }) {
  return { season: season + 1, episode: 1 };
}
function sameEpisode(a, b) {
  return Boolean(a) && Boolean(b) && a.season === b.season && a.episode === b.episode;
}
function valueAt2(value, key, fallback = null) {
  if (!value || typeof value !== "object") return fallback;
  const plain = key.replace(/^:/, "");
  return value[key] ?? value[plain] ?? value[plain.replace(/^block\//, "")] ?? fallback;
}
function orderedChildren2(block) {
  const children = valueAt2(block, ":block/children", []);
  if (!Array.isArray(children)) return [];
  return children.map((child) => ({
    uid: valueAt2(child, ":block/uid", null),
    string: valueAt2(child, ":block/string", null),
    order: Number(valueAt2(child, ":block/order", 0)) || 0
  })).filter((child) => typeof child.uid === "string" && typeof child.string === "string").sort((a, b) => a.order - b.order);
}
function episodeStateFromChildren(children) {
  const ordered = (Array.isArray(children) ? children : []).filter((child2) => typeof child2?.uid === "string" && typeof child2?.string === "string").map((child2) => ({ uid: child2.uid, string: child2.string, order: Number(child2.order) || 0 })).sort((a, b) => a.order - b.order);
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
    duplicate
  };
}
function stateFromBlock(block, uid) {
  if (valueAt2(block, ":block/uid", null) !== uid) return { found: false };
  return { found: true, ...episodeStateFromChildren(orderedChildren2(block)) };
}
function replaceFirstLine(childString, value) {
  const prefix = childString.match(/^[ \t]*Episode::[ \t]*/i)?.[0] ?? `${EPISODE_ATTRIBUTE}:: `;
  const rest = childString.slice(childString.search(/[\r\n]|$/));
  return `${prefix}${value}${rest}`;
}
async function readEpisodeState({ roamAlphaAPI, uid }) {
  const pull = roamAlphaAPI?.data?.async?.pull;
  if (typeof pull !== "function") throw new Error("roamAlphaAPI.data.async.pull is unavailable");
  const block = await pull.call(roamAlphaAPI.data.async, CHILDREN_PULL_PATTERN, [":block/uid", uid]);
  return stateFromBlock(block, uid);
}
function readEpisodeStateSync({ roamAlphaAPI, uid }) {
  try {
    const block = roamAlphaAPI.data.pull(CHILDREN_PULL_PATTERN, [":block/uid", uid]);
    return stateFromBlock(block, uid);
  } catch (_) {
    return { found: false };
  }
}
var writeQueues = /* @__PURE__ */ new Map();
function enqueue(uid, task) {
  const previous = writeQueues.get(uid) || Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.then(() => {
  }, () => {
  });
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
  const string = before.childUid ? replaceFirstLine(before.childString, formatEpisode(next)) : `${EPISODE_ATTRIBUTE}:: ${formatEpisode(next)}`;
  try {
    if (before.childUid) {
      await roamAlphaAPI.data.block.update({ block: { uid: before.childUid, string } });
    } else {
      const childUid = roamAlphaAPI.util.generateUID();
      await roamAlphaAPI.data.block.create({
        location: { "parent-uid": uid, order: "last" },
        block: { uid: childUid, string }
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
  if (!after.found || after.childString !== string || before.childUid && after.childUid !== before.childUid) {
    return { status: "unknown", reason: "not-confirmed", value: formatEpisode(next), childUid: after.childUid };
  }
  const value = formatEpisode(next);
  if (typeof activityRecorder?.recordAttributeChange === "function") {
    try {
      await activityRecorder.recordAttributeChange({
        uid,
        field: "episode",
        from: before.episode ? formatEpisode(before.episode) : void 0,
        to: value
      });
    } catch (_) {
    }
  }
  return { status: "updated", value, childUid: after.childUid };
}
function writeEpisode(options) {
  if (typeof options?.uid !== "string" || !options.uid) {
    return Promise.resolve({ status: "rejected", reason: "invalid-uid" });
  }
  if (typeof options.compute !== "function") {
    return Promise.resolve({ status: "rejected", reason: "invalid-compute" });
  }
  return enqueue(options.uid, () => writeEpisodeNow(options));
}
function computeFromDecision(decision) {
  switch (decision?.action) {
    case "next":
    case "start":
      return (current) => current ? nextEpisode(current) : { season: 1, episode: 1 };
    case "season":
      return (current) => current ? newSeason(current) : { season: 1, episode: 1 };
    case "set":
      return () => ({ season: decision.season, episode: decision.episode });
    default:
      return null;
  }
}
var PLACEHOLDER = "+";
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
function createEpisodeCounterController({
  document: documentLike,
  roamAlphaAPI,
  activityRecorder = null,
  onOpenMenu = () => {
  },
  onChange = () => {
  },
  getBlockUid = () => null,
  warn = (...args) => console.warn(...args)
}) {
  const inFlight = /* @__PURE__ */ new Map();
  const warned = /* @__PURE__ */ new Set();
  const isCounter = (node) => Boolean(node?.getAttribute?.(EPISODE_UID_ATTRIBUTE) != null) && String(node.className || "").split(/\s+/).includes(EPISODE_COUNTER_CLASS);
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
    let result4;
    try {
      result4 = await writeEpisode({ roamAlphaAPI, uid, compute, activityRecorder });
    } catch (error) {
      result4 = { status: "unknown", reason: "write-threw", error };
    }
    const remaining = (inFlight.get(uid) || 1) - 1;
    if (remaining > 0) inFlight.set(uid, remaining);
    else inFlight.delete(uid);
    if (remaining > 0) return result4;
    if (result4.status === "updated") {
      try {
        onChange(uid);
      } catch (_) {
      }
    }
    if (result4.status === "updated" || result4.status === "unchanged") {
      const settled = parseEpisode(result4.value);
      if (settled) countersFor(uid).forEach((el) => render(el, { episode: settled }));
    } else {
      warnOnce(uid, result4.reason || "unknown", { status: result4.status });
      resyncUid(uid);
    }
    return result4;
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
      } else if (event.key === "ContextMenu" || event.key === "F10" && event.shiftKey) {
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
      ["keydown", onKeyDown]
    ];
    counter._tsListeners.forEach(([type, handler]) => counter.addEventListener(type, handler));
    return counter;
  }
  function destroy(counter) {
    (counter._tsListeners || []).forEach(([type, handler]) => counter.removeEventListener(type, handler));
    counter._tsListeners = [];
    counter.remove();
  }
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
  function sweep(scope, kept = /* @__PURE__ */ new Set()) {
    elementsIncludingRoot(scope, `.${EPISODE_COUNTER_CLASS}`).filter((counter) => !kept.has(counter)).forEach(destroy);
  }
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
  function taskUidForAttributeNode(node, fallbackTarget = null) {
    const anchor = node?.isConnected ? node : fallbackTarget;
    const container = anchor?.closest?.(".roam-block-container");
    if (!container) return null;
    const zone = anchor.closest(".rm-block-children, .rm-block-main");
    const inOwnChildren = zone && String(zone.className || "").split(/\s+/).includes("rm-block-children") && zone.closest(".roam-block-container") === container;
    const taskContainer = inOwnChildren ? container : container.parentElement?.closest?.(".roam-block-container");
    if (!taskContainer) return null;
    const main = Array.from(taskContainer.children || []).find(
      (child) => String(child.className || "").split(/\s+/).includes("rm-block-main")
    );
    const input = main?.querySelector?.(".rm-block__input");
    return input ? getBlockUid(input) : null;
  }
  function destroyAll(root = documentLike) {
    sweep(root, /* @__PURE__ */ new Set());
  }
  return Object.freeze({
    sync,
    sweep,
    destroyAll,
    resyncUid,
    applyDecision,
    isEpisodeAttributeNode,
    taskUidForAttributeNode,
    isCounter
  });
}
var FOCUSABLE = ".ts-episode-item, .ts-episode-input, .ts-episode-set";
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
function createEpisodeMenu({ document: documentLike, current = null, onDecision }) {
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
        onChoose: () => decide({ action: "next" })
      }),
      menuItem(documentLike, {
        label: "New season",
        hint: formatEpisode(newSeason(current)),
        action: "season",
        onChoose: () => decide({ action: "season" })
      })
    );
  } else {
    list.append(
      menuItem(documentLike, {
        label: "Start S1E1",
        action: "start",
        onChoose: () => decide({ action: "start" })
      })
    );
  }
  const row = documentLike.createElement("li");
  row.className = "ts-follow-up-date-row ts-episode-row";
  const makeInput = (label, prefix, value) => {
    const field2 = documentLike.createElement("label");
    field2.className = "ts-episode-field";
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
    field2.append(tag, input);
    return { field: field2, input };
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
    if (event.key === "Enter" || event.key === " " && !isInput(target)) {
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
    }
  };
}

// src/follow-up-date.js
var FOLLOW_UP_STATUS_KEYS = Object.freeze(["WAITING", "IN_REVIEW"]);
var BETTER_TASKS_TOOLS_ID = "better-tasks";
var DEFAULT_DUE_ATTRIBUTE = "BT_attrDue";
var DEFAULT_REPEAT_ATTRIBUTE = "BT_attrRepeat";
var TODO_TOKEN_RE = /^\s*(?:\{\{\s*(?:\[\[\s*)?TODO(?:\s*\]\])?\s*\}\}|TODO)(?=$|[ \t\r\n])/i;
var ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
var CHILDREN_PULL_PATTERN2 = "[:block/uid :block/string {:block/children [:block/uid :block/string]}]";
var MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));
var SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function isFollowUpStatusKey(statusKey) {
  return FOLLOW_UP_STATUS_KEYS.includes(statusKey);
}
function localNoon(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d;
}
function addDays(date, days) {
  const d = localNoon(date);
  d.setDate(d.getDate() + days);
  return d;
}
function toIsoDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function parseIsoDate(value) {
  const match = typeof value === "string" ? value.trim().match(ISO_DATE_RE) : null;
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (toIsoDate(d) !== match[0]) return null;
  return d;
}
function sameDay(a, b) {
  return toIsoDate(a) === toIsoDate(b);
}
function shortDateLabel(date, today = /* @__PURE__ */ new Date()) {
  const base = `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === today.getFullYear() ? base : `${base}, ${date.getFullYear()}`;
}
function quickPicks(today = /* @__PURE__ */ new Date()) {
  const tomorrow = addDays(today, 1);
  const inThree = addDays(today, 3);
  const nextWeek = addDays(today, 7);
  return [
    { id: "tomorrow", label: "Tomorrow", hint: SHORT_DAYS[tomorrow.getDay()], date: tomorrow },
    { id: "in-3-days", label: "In 3 days", hint: SHORT_DAYS[inThree.getDay()], date: inThree },
    { id: "next-week", label: "Next week", hint: shortDateLabel(nextWeek, today), date: nextWeek }
  ];
}
function parseDueValue(value, roamAlphaAPI = null) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const inner = raw.startsWith("[[") && raw.endsWith("]]") ? raw.slice(2, -2).trim() : raw;
  const iso = parseIsoDate(inner);
  if (iso) return iso;
  const toDate = roamAlphaAPI?.util?.pageTitleToDate;
  if (typeof toDate === "function") {
    try {
      const d2 = toDate.call(roamAlphaAPI.util, inner);
      if (d2 instanceof Date && !Number.isNaN(d2.getTime())) return localNoon(d2);
    } catch (_) {
    }
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
function resolveFollowUpSurface(windowLike) {
  const classifyBlock = windowLike?.betterTasks?.v2?.classifyBlock;
  const pull = windowLike?.roamAlphaAPI?.data?.async?.pull;
  const modify = findTool(windowLike, "bt_modify");
  if (typeof classifyBlock !== "function" || typeof pull !== "function" || !modify) return null;
  return {
    classifyBlock: (uid) => classifyBlock.call(windowLike.betterTasks.v2, uid),
    pull: (pattern, eid) => pull.call(windowLike.roamAlphaAPI.data.async, pattern, eid),
    modify,
    attributes: findTool(windowLike, "bt_get_attributes")
  };
}
function valueAt3(value, key, fallback = null) {
  if (!value || typeof value !== "object") return fallback;
  const plain = key.replace(/^:/, "");
  return value[key] ?? value[plain] ?? value[plain.replace(/^block\//, "")] ?? fallback;
}
function escapeRegex2(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function attributeNames(schema, id, fallback) {
  const entry = Array.isArray(schema?.attributes) ? schema.attributes.find((attr) => attr?.id === id) : null;
  const clean = (name) => typeof name === "string" && name.trim() ? name.trim() : null;
  const primary = clean(entry?.name) || fallback;
  const aliases = (Array.isArray(entry?.aliases) ? entry.aliases : []).map(clean).filter((name) => name && name.toLowerCase() !== String(primary).toLowerCase());
  return { primary, aliases };
}
async function attributeSchema(surface) {
  if (!surface.attributes) return null;
  try {
    return await surface.attributes.execute({});
  } catch (_) {
    return null;
  }
}
function findChild(children, names) {
  for (const child of Array.isArray(children) ? children : []) {
    const string = valueAt3(child, ":block/string", "");
    const uid = valueAt3(child, ":block/uid", null);
    if (typeof string !== "string" || typeof uid !== "string") continue;
    for (const name of names) {
      const pattern = new RegExp(`^\\s*${escapeRegex2(name)}::\\s*`, "i");
      if (pattern.test(string)) return { uid, name, value: string.replace(pattern, "").trim() };
    }
  }
  return null;
}
async function readTaskAttributes(surface, uid) {
  const block = await surface.pull(CHILDREN_PULL_PATTERN2, [":block/uid", uid]);
  if (valueAt3(block, ":block/uid", null) !== uid) return { block: null, due: null };
  const schema = await attributeSchema(surface);
  const due = attributeNames(schema, "due", DEFAULT_DUE_ATTRIBUTE);
  const repeat = attributeNames(schema, "repeat", DEFAULT_REPEAT_ATTRIBUTE);
  const children = valueAt3(block, ":block/children", []);
  const primaryDue = findChild(children, [due.primary]);
  const aliasDue = primaryDue ? null : findChild(children, due.aliases);
  return {
    block,
    due: primaryDue,
    aliased: Boolean(aliasDue),
    repeats: Boolean(findChild(children, [repeat.primary, ...repeat.aliases]))
  };
}
function isOpenTask(block) {
  return TODO_TOKEN_RE.test(valueAt3(block, ":block/string", ""));
}
function result2(eligible, reason, fields = {}) {
  return { eligible, reason, ...fields };
}
async function readFollowUpState({ windowLike, uid }) {
  const surface = resolveFollowUpSurface(windowLike);
  if (!surface) return result2(false, "better-tasks-unavailable");
  if (typeof uid !== "string" || !uid) return result2(false, "invalid-uid");
  try {
    const classification = await surface.classifyBlock(uid);
    if (classification?.kind !== "task") return result2(false, "not-a-better-tasks-task");
    const { block, due, aliased, repeats } = await readTaskAttributes(surface, uid);
    if (!block) return result2(false, "block-not-found");
    if (!isOpenTask(block)) return result2(false, "not-an-open-task");
    if (aliased) return result2(false, "due-under-alias");
    const existingDue = due ? { uid: due.uid, value: due.value, date: parseDueValue(due.value, windowLike?.roamAlphaAPI) } : null;
    return result2(true, "ask", { existingDue, repeats });
  } catch (error) {
    return result2(false, "read-failed", { error });
  }
}
async function writeFollowUpDate({ windowLike, uid, date }) {
  const surface = resolveFollowUpSurface(windowLike);
  if (!surface) return { status: "rejected", reason: "better-tasks-unavailable" };
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return { status: "rejected", reason: "invalid-date" };
  }
  let before;
  try {
    before = await readTaskAttributes(surface, uid);
  } catch (error) {
    return { status: "unknown", reason: "read-failed", error };
  }
  if (!before.block) return { status: "rejected", reason: "block-not-found" };
  if (!isOpenTask(before.block)) return { status: "rejected", reason: "not-an-open-task" };
  if (before.aliased) return { status: "rejected", reason: "due-under-alias" };
  before = before.due;
  const target = localNoon(date);
  if (before && sameDay(parseDueValue(before.value, windowLike?.roamAlphaAPI) || /* @__PURE__ */ new Date(NaN), target)) {
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
    after = (await readTaskAttributes(surface, uid)).due;
  } catch (_) {
  }
  const landed = after ? parseDueValue(after.value, windowLike?.roamAlphaAPI) : null;
  if (!after || !landed || !sameDay(landed, target)) {
    return { status: "unknown", reason: "due-not-confirmed", response };
  }
  if (before && before.uid !== after.uid) {
    return { status: "unknown", reason: "due-uid-changed", dueUid: after.uid, previousUid: before.uid };
  }
  return {
    status: "updated",
    dueUid: after.uid,
    value: after.value,
    sameUid: before ? true : null
  };
}
var FOCUSABLE2 = ".ts-follow-up-item, .ts-follow-up-date, .ts-follow-up-set";
function menuItem2(documentLike, { label, hint = "", className = "", action, onChoose }) {
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
function createFollowUpPrompt({
  document: documentLike,
  statusLabel,
  existingDue,
  repeats = false,
  today = /* @__PURE__ */ new Date(),
  onDecision
}) {
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
  if (repeats) {
    const note = documentLike.createElement("li");
    note.className = "ts-follow-up-note";
    note.textContent = "Repeating task: a date moves the series' due date.";
    list.append(note);
  }
  const existingDate = existingDue?.date || null;
  if (existingDue) {
    const shown = existingDate ? shortDateLabel(existingDate, today) : existingDue.value;
    list.append(
      menuItem2(documentLike, {
        label: `Keep due ${shown}`,
        className: "ts-follow-up-keep",
        action: "keep",
        onChoose: () => decide({ action: "keep" })
      })
    );
  }
  for (const pick of quickPicks(today)) {
    const replacing = existingDate && sameDay(existingDate, pick.date);
    if (replacing) continue;
    list.append(
      menuItem2(documentLike, {
        label: pick.label,
        hint: pick.hint,
        action: pick.id,
        onChoose: () => decide({ action: "set", date: pick.date })
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
    menuItem2(documentLike, {
      label: "Skip",
      className: "ts-follow-up-skip",
      action: "skip",
      onChoose: () => decide({ action: "skip" })
    })
  );
  function focusables() {
    return Array.from(list.querySelectorAll(FOCUSABLE2));
  }
  function moveFocus(target, delta) {
    const items = focusables();
    if (!items.length) return;
    const index = items.indexOf(target);
    const next = items[(index + delta + items.length) % items.length] || items[0];
    next.focus?.({ preventScroll: true });
  }
  function handleKey(event) {
    if (event.type !== "keydown") return false;
    const target = event.target;
    if (event.key === "Escape") {
      event.preventDefault();
      decide({ action: "cancel" });
      return true;
    }
    if (event.key === "Tab" && target !== input) {
      event.preventDefault();
      moveFocus(target, event.shiftKey ? -1 : 1);
      return true;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (target === input) return false;
      if (target === setButton) return true;
      event.preventDefault();
      moveFocus(target, event.key === "ArrowDown" ? 1 : -1);
      return true;
    }
    if (event.key === "Enter" || event.key === " " && target !== input) {
      if (event.repeat) {
        event.preventDefault();
        return true;
      }
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
    }
  };
}

// src/repeat-status-reset.js
var DEFAULT_CARRY_OVER_STATUS_NAMES = Object.freeze([
  "Series",
  "Movie",
  "Watching",
  "Watchlist",
  "Upcoming",
  "Rewatch",
  "Dropped"
]);
var STATUS_PREFIX2 = "task-status/";
var REVERSE_REFS_PATTERN = "[:block/_refs]";
var OCCURRENCE_PULL_PATTERN = "[:block/uid :block/string :create/time :block/props]";
function normalizeName(name) {
  return String(name || "").replace(/\s+/g, " ").trim();
}
function parseCarryOverSetting(value) {
  if (value === null || value === void 0) return [...DEFAULT_CARRY_OVER_STATUS_NAMES];
  const source = Array.isArray(value) ? value.join(",") : String(value);
  const seen = /* @__PURE__ */ new Set();
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
function formatCarryOverSetting(names) {
  return parseCarryOverSetting(names).join(", ");
}
function resetTagTitles(statusNames, carryOverNames) {
  const carry = new Set(parseCarryOverSetting(carryOverNames).map((n) => n.toLowerCase()));
  const titles = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of statusNames || []) {
    const name = normalizeName(raw);
    const key = name.toLowerCase();
    if (!name || carry.has(key) || seen.has(key)) continue;
    seen.add(key);
    titles.push(`${STATUS_PREFIX2}${name}`);
  }
  return titles;
}
function field(map, key) {
  if (!map || typeof map !== "object") return void 0;
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
function seriesParentFromProps(props) {
  const rt = field(parseProps(props), "rt");
  const parent = field(rt, "parent");
  return typeof parent === "string" && parent ? parent : null;
}
function refIds(pullResult) {
  const refs = field(pullResult, "block/_refs");
  if (!Array.isArray(refs)) return [];
  return refs.map((ref) => field(ref, "db/id")).filter((id) => id != null);
}
function createRepeatStatusReset({
  roamAlphaAPI,
  windowLike,
  getResetTagTitles,
  now = Date.now,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  // The ref must arrive with the block: a block older than this when its tag
  // ref appears was edited (a status set by hand on a fresh occurrence, or a
  // block synced from another device), not spawned here.
  bornWithinMs = 2e3,
  // How long to wait for Better Tasks to finish writing `rt` props.
  spawnSettleMs = 1e4,
  pollMs = 200,
  // Tag pages created after load (typed by hand, set through Better Tasks,
  // synced from another device) or recreated under a new uid get a watch on
  // the next re-sync.
  resyncMs = 6e4,
  setRepeatingTimer = (fn, ms) => setInterval(fn, ms),
  clearRepeatingTimer = (id) => clearInterval(id),
  log = () => {
  }
}) {
  const watches = /* @__PURE__ */ new Map();
  const handled = /* @__PURE__ */ new Set();
  const timers = /* @__PURE__ */ new Set();
  let disposed = false;
  let resetTitleSet = /* @__PURE__ */ new Set();
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
    for (; ; ) {
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
      const title = `${STATUS_PREFIX2}${label}`;
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
        source: "task-status-tags"
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
    watchedTitles: () => [...watches.values()].map((entry) => entry.title)
  });
}

// src/status-burst.js
var BURST_CANVAS_ATTRIBUTE = "data-ts-burst-canvas";
var BURST_CANVAS_CLASS = "ts-burst-canvas";
var BURST_SPECS = Object.freeze({
  active: Object.freeze({ kind: "started", colors: Object.freeze(["#38bdf8", "#22d3ee", "#bae6fd"]) }),
  waiting: Object.freeze({ kind: "blocked", colors: Object.freeze(["#fbbf24", "#f59e0b", "#fde68a"]) }),
  billable: Object.freeze({ kind: "dollar", colors: Object.freeze(["#4ade80", "#a3e635", "#fde047"]) }),
  important: Object.freeze({ kind: "exclaim", colors: Object.freeze(["#fb7185", "#f43f5e", "#fecdd3"]) }),
  discuss: Object.freeze({ kind: "question", colors: Object.freeze(["#c084fc", "#a78bfa", "#ede9fe"]) }),
  alert: Object.freeze({ kind: "alert", colors: Object.freeze(["#ef4444", "#f97316", "#fde047"]) }),
  starred: Object.freeze({ kind: "starred", colors: Object.freeze(["#fde047", "#facc15", "#f59e0b"]) }),
  cancelled: Object.freeze({ kind: "canceled", colors: Object.freeze(["#94a3b8", "#cbd5e1", "#64748b"]) }),
  kawaii: Object.freeze({ kind: "kawaii", colors: Object.freeze(["#f9a8d4", "#f472b6", "#c4b5fd"]) }),
  bug: Object.freeze({ kind: "bug", colors: Object.freeze(["#a3e635", "#65a30d", "#d9f99d"]) }),
  draft: Object.freeze({ kind: "draft", colors: Object.freeze(["#93c5fd", "#3b82f6", "#dbeafe"]) }),
  deadline: Object.freeze({ kind: "deadline", colors: Object.freeze(["#fb923c", "#f97316", "#fed7aa"]) }),
  flower: Object.freeze({ kind: "flower", colors: Object.freeze(["#f0abfc", "#e879f9", "#fde68a"]) }),
  sun: Object.freeze({ kind: "sun", colors: Object.freeze(["#fde047", "#fb923c", "#fef3c7"]) }),
  moon: Object.freeze({ kind: "moon", colors: Object.freeze(["#c7d2fe", "#a5b4fc", "#e0e7ff"]) })
});
var MAPPED_BURST_SHAPES = Object.freeze(Object.keys(BURST_SPECS));
function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function byteHex(n) {
  return clampByte(n).toString(16).padStart(2, "0");
}
function rgbToHex(r, g, b) {
  return `#${byteHex(r)}${byteHex(g)}${byteHex(b)}`;
}
function parseColorToHex(color, fallback = "#38bdf8") {
  const raw = String(color || "").trim();
  const hex6 = raw.match(/^#([0-9a-f]{6})$/i);
  if (hex6) return `#${hex6[1].toLowerCase()}`;
  const hex3 = raw.match(/^#([0-9a-f]{3})$/i);
  if (hex3) {
    const [r, g, b] = hex3[1];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const rgb = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  }
  return fallback;
}
function mixHex(hexA, hexB, ratio) {
  const a = parseColorToHex(hexA).slice(1);
  const b = parseColorToHex(hexB).slice(1);
  const t = Math.max(0, Math.min(1, ratio));
  const ar = parseInt(a.slice(0, 2), 16);
  const ag = parseInt(a.slice(2, 4), 16);
  const ab = parseInt(a.slice(4, 6), 16);
  const br = parseInt(b.slice(0, 2), 16);
  const bg = parseInt(b.slice(2, 4), 16);
  const bb = parseInt(b.slice(4, 6), 16);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}
function hexToRgba(hex, alpha) {
  const h = parseColorToHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}
function buildGenericBurstColors(color) {
  const base = parseColorToHex(color, "#38bdf8");
  return [base, mixHex(base, "#ffffff", 0.45), mixHex(base, "#0f172a", 0.22)];
}
function isBurstBlockedByMedia(windowLike = typeof window !== "undefined" ? window : null) {
  try {
    if (!windowLike?.matchMedia) return false;
    return Boolean(
      windowLike.matchMedia("(prefers-reduced-motion: reduce)")?.matches || windowLike.matchMedia("(forced-colors: active)")?.matches
    );
  } catch (_) {
    return false;
  }
}
function isBurstStyleActive(styleValue) {
  const normalized = String(styleValue || "").trim().toLowerCase();
  return normalized === "glass" || normalized === "solid" || normalized === "minimal";
}
function readCheckboxRect(checkbox) {
  if (!checkbox) return null;
  const target = checkbox.querySelector?.(".checkmark") || checkbox.querySelector?.(".check-container") || checkbox;
  const rect = target?.getBoundingClientRect?.();
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  return rect;
}
function createStatusBurstSystem({
  documentLike = typeof document !== "undefined" ? document : null,
  windowLike = typeof window !== "undefined" ? window : globalThis,
  lifecycle = null,
  getStyle = () => "Outline",
  isEnabled = () => true,
  nowFn = null,
  randomFn = Math.random
} = {}) {
  let canvas = null;
  let ctx = null;
  let rings = [];
  let motes = [];
  let rafId = 0;
  let lastMs = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let disposed = false;
  let resizeBound = false;
  const getNow = () => {
    if (typeof nowFn === "function") return nowFn();
    if (typeof windowLike?.performance?.now === "function") return windowLike.performance.now();
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  };
  const requestFrame = (callback) => (windowLike?.requestAnimationFrame || globalThis.requestAnimationFrame)?.(callback) || 0;
  const cancelFrame = (id) => {
    if (!id) return;
    (windowLike?.cancelAnimationFrame || globalThis.cancelAnimationFrame)?.(id);
  };
  function resize() {
    if (!canvas) return;
    dpr = Math.min(2, Number(windowLike?.devicePixelRatio) || 1);
    width = Number(windowLike?.innerWidth) || 1200;
    height = Number(windowLike?.innerHeight) || 800;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const handleResize = () => resize();
  function mount() {
    if (disposed || canvas || !documentLike?.body) return false;
    const el = documentLike.createElement("canvas");
    el.className = BURST_CANVAS_CLASS;
    el.setAttribute(BURST_CANVAS_ATTRIBUTE, "true");
    el.setAttribute("aria-hidden", "true");
    if (el.style) {
      el.style.position = "fixed";
      el.style.inset = "0";
      el.style.width = "100vw";
      el.style.height = "100vh";
      el.style.pointerEvents = "none";
      el.style.zIndex = "9998";
    }
    const nextCtx = el.getContext?.("2d") || null;
    if (!nextCtx) return false;
    documentLike.body.appendChild(el);
    canvas = el;
    ctx = nextCtx;
    resize();
    if (!resizeBound && typeof windowLike?.addEventListener === "function") {
      windowLike.addEventListener("resize", handleResize);
      resizeBound = true;
    }
    return true;
  }
  function active() {
    return rings.length > 0 || motes.length > 0;
  }
  function clear() {
    if (rafId) {
      cancelFrame(rafId);
      rafId = 0;
    }
    lastMs = 0;
    rings = [];
    motes = [];
    if (ctx && canvas) {
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } catch (_) {
      }
    }
  }
  function frame(now) {
    rafId = 0;
    if (disposed || !ctx || !canvas) return;
    const dt = lastMs ? Math.min(0.05, Math.max(1e-3, (now - lastMs) / 1e3)) : 0.016;
    lastMs = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const nextRings = [];
    for (const r of rings) {
      const f = (now - r.t0) / r.dur;
      if (f < 0) {
        nextRings.push(r);
        continue;
      }
      if (f >= 1) continue;
      nextRings.push(r);
      const ease = 1 - (1 - f) * (1 - f) * (1 - f);
      const rad = r.r0 + (r.r1 - r.r0) * ease;
      const alpha = (1 - f) * 0.85;
      ctx.save();
      if (r.dashed && typeof ctx.setLineDash === "function") ctx.setLineDash([3.5, 3]);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(0.7, r.width * (1 - f * 0.7));
      ctx.strokeStyle = hexToRgba(r.col, alpha);
      ctx.stroke();
      ctx.restore();
    }
    rings = nextRings;
    const nextMotes = [];
    for (const m of motes) {
      const f = (now - m.t0) / m.life;
      if (f >= 1) continue;
      nextMotes.push(m);
      const drag = Math.exp(-(m.drag || 3) * dt);
      m.vx *= drag;
      m.vy *= drag;
      m.vy += (m.grav || 0) * dt;
      if (m.sway !== void 0) m.vx += Math.sin(now * 0.012 + m.sway) * 28 * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.vRot) m.rot = (m.rot || 0) + m.vRot * dt;
      let alpha = 1 - f * f;
      if (m.twinkle !== void 0) alpha *= 0.55 + 0.45 * Math.sin(now * 0.025 + m.twinkle);
      const s = m.size * (m.kind === "bubble" ? 0.65 + 0.55 * f : 1 - 0.35 * f);
      if (m.wiggle !== void 0) {
        m.rot = Math.atan2(m.vy, m.vx) + Math.PI / 2 + Math.sin(now * 0.05 + m.wiggle) * 0.35;
      }
      ctx.save();
      ctx.translate(m.x, m.y);
      if (m.rot) ctx.rotate(m.rot);
      if (m.kind === "star") {
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.28, -s * 0.28);
        ctx.lineTo(s, 0);
        ctx.lineTo(s * 0.28, s * 0.28);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.28, s * 0.28);
        ctx.lineTo(-s, 0);
        ctx.lineTo(-s * 0.28, -s * 0.28);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(m.col, alpha);
        ctx.fill();
      } else if (m.kind === "chevron") {
        ctx.beginPath();
        ctx.moveTo(-s * 0.45, -s * 0.65);
        ctx.lineTo(s * 0.55, 0);
        ctx.lineTo(-s * 0.45, s * 0.65);
        ctx.lineWidth = Math.max(1.2, s * 0.34);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = hexToRgba(m.col, alpha);
        ctx.stroke();
      } else if (m.kind === "bubble") {
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = hexToRgba(m.col, alpha * 0.9);
        ctx.fillStyle = hexToRgba(m.col, alpha * 0.22);
        ctx.fill();
        ctx.stroke();
      } else if (m.kind === "coin") {
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(m.col, alpha * 0.85);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = hexToRgba("#fef08a", alpha);
        ctx.stroke();
      } else if (m.kind === "spike" || m.kind === "slash") {
        ctx.beginPath();
        ctx.moveTo(-s * 0.65, 0);
        ctx.lineTo(s * 0.65, 0);
        ctx.lineWidth = Math.max(1.2, m.size * 0.32 * (1 - f * 0.6));
        ctx.lineCap = "round";
        ctx.strokeStyle = hexToRgba(m.col, alpha);
        ctx.stroke();
      } else if (m.kind === "heart") {
        ctx.beginPath();
        ctx.moveTo(0, s * 0.8);
        ctx.bezierCurveTo(-s * 1.25, 0, -s * 0.6, -s * 1.05, 0, -s * 0.35);
        ctx.bezierCurveTo(s * 0.6, -s * 1.05, s * 1.25, 0, 0, s * 0.8);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(m.col, alpha);
        ctx.fill();
      } else if (m.kind === "beetle") {
        ctx.fillStyle = hexToRgba(m.col, alpha);
        ctx.beginPath();
        if (typeof ctx.ellipse === "function") {
          ctx.ellipse(0, s * 0.15, s * 0.55, s * 0.75, 0, 0, Math.PI * 2);
        } else {
          ctx.arc(0, s * 0.15, s * 0.6, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -s * 0.78, s * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(m.col, alpha * 0.85);
        ctx.lineWidth = Math.max(0.6, s * 0.14);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-s * 0.15, -s * 1);
        ctx.lineTo(-s * 0.5, -s * 1.45);
        ctx.moveTo(s * 0.15, -s * 1);
        ctx.lineTo(s * 0.5, -s * 1.45);
        ctx.stroke();
      } else if (m.kind === "drop") {
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.bezierCurveTo(s * 0.6, -s * 0.2, s * 0.7, s * 0.6, 0, s * 0.65);
        ctx.bezierCurveTo(-s * 0.7, s * 0.6, -s * 0.6, -s * 0.2, 0, -s);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(m.col, alpha);
        ctx.fill();
      } else if (m.kind === "petal") {
        ctx.beginPath();
        if (typeof ctx.ellipse === "function") {
          ctx.ellipse(0, 0, s * 0.42, s * 0.9, 0, 0, Math.PI * 2);
        } else {
          ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2);
        }
        ctx.fillStyle = hexToRgba(m.col, alpha * 0.9);
        ctx.fill();
      } else if (m.kind === "bar") {
        ctx.fillStyle = hexToRgba(m.col, alpha);
        ctx.fillRect(-s * 0.35, -s * 0.8, s * 0.7, s * 1.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(m.col, alpha);
        ctx.fill();
      }
      ctx.restore();
    }
    motes = nextMotes;
    if (active()) {
      rafId = requestFrame(frame);
    } else {
      lastMs = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width * dpr, height * dpr);
    }
  }
  function kick() {
    if (!rafId && active()) {
      lastMs = 0;
      rafId = requestFrame(frame);
    }
  }
  function emitAt(shape, x, y, { size = 18, color = null, bypassChecks = false } = {}) {
    if (disposed || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (!bypassChecks) {
      if (!isEnabled() || !isBurstStyleActive(getStyle()) || isBurstBlockedByMedia(windowLike)) {
        return false;
      }
    }
    if (!canvas && !mount()) return false;
    else if (!active() && Math.min(2, Number(windowLike?.devicePixelRatio) || 1) !== dpr) {
      resize();
    }
    const shapeKey = String(shape || "").trim().toLowerCase();
    const spec = BURST_SPECS[shapeKey] || null;
    const status = spec ? spec.kind : "generic";
    const cols = spec ? spec.colors : buildGenericBurstColors(color);
    const u = Math.max(0.75, Math.min(1.6, (Number(size) || 18) / 18));
    const now = getNow();
    const rand = randomFn;
    const bigRing = status === "alert" || status === "sun" || status === "deadline";
    rings.push({
      x,
      y,
      t0: now,
      dur: status === "alert" || status === "sun" ? 520 : status === "blocked" || status === "deadline" || status === "moon" ? 560 : 380,
      r0: 5 * u,
      r1: (bigRing ? 28 : status === "starred" || status === "kawaii" ? 26 : 22) * u,
      width: (bigRing ? 2.4 : 2) * u,
      col: cols[0],
      dashed: status === "blocked" || status === "deadline"
    });
    if (status === "alert" || status === "exclaim" || status === "sun" || status === "kawaii") {
      rings.push({
        x,
        y,
        t0: now + 70,
        dur: 420,
        r0: 4 * u,
        r1: (status === "alert" ? 34 : 20) * u,
        width: 1.4 * u,
        col: cols[1] || cols[0],
        dashed: false
      });
    }
    const pushMote = (m) => {
      if (motes.length < 220) motes.push({ x, y, t0: now, ...m });
    };
    if (status === "started") {
      for (let i = 0; i < 8; i++) {
        const spread = (rand() - 0.5) * 0.8;
        const spd = (95 + rand() * 145) * u;
        pushMote({
          kind: i < 3 ? "chevron" : "spark",
          vx: Math.cos(spread) * spd,
          vy: Math.sin(spread) * spd,
          grav: 0,
          drag: 4.5,
          size: (i < 3 ? 4.2 : 2.1) * u,
          life: 320 + rand() * 140,
          col: cols[i % cols.length]
        });
      }
    } else if (status === "blocked") {
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + 0.25;
        const spd = (32 + rand() * 38) * u;
        pushMote({
          kind: "bar",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd + 15 * u,
          grav: 65 * u,
          drag: 3.5,
          size: (2.2 + rand() * 1.2) * u,
          rot: 0,
          vRot: 0,
          life: 440 + rand() * 140,
          col: cols[i % cols.length]
        });
      }
    } else if (status === "dollar") {
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 1.8;
        const spd = (75 + rand() * 115) * u;
        pushMote({
          kind: i % 3 === 0 ? "coin" : "star",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 230 * u,
          drag: 2.2,
          size: (i % 3 === 0 ? 3.2 : 3.6) * u,
          rot: rand() * Math.PI,
          vRot: (rand() - 0.5) * 7,
          life: 460 + rand() * 180,
          col: cols[i % cols.length]
        });
      }
    } else if (status === "exclaim") {
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2 + (rand() - 0.5) * 0.2;
        const spd = (90 + rand() * 110) * u;
        pushMote({
          kind: "spike",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 0,
          drag: 5.2,
          size: (4.5 + rand() * 2.5) * u,
          rot: a,
          vRot: 0,
          life: 320 + rand() * 110,
          col: cols[i % cols.length]
        });
      }
    } else if (status === "question") {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 1.4;
        const spd = (45 + rand() * 70) * u;
        pushMote({
          kind: "bubble",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 20 * u,
          grav: -35 * u,
          drag: 2.5,
          size: (2.4 + rand() * 2.1) * u,
          sway: rand() * Math.PI * 2,
          life: 480 + rand() * 200,
          col: cols[i % cols.length]
        });
      }
    } else if (status === "alert") {
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2 + rand() * 0.2;
        const spd = (80 + rand() * 130) * u;
        pushMote({
          kind: i % 2 === 0 ? "spike" : "spark",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 40 * u,
          drag: 4,
          size: (3.2 + rand() * 2.2) * u,
          rot: a,
          vRot: 0,
          life: 380 + rand() * 150,
          col: cols[i % cols.length]
        });
      }
    } else if (status === "starred") {
      for (let i = 0; i < 11; i++) {
        const a = i / 11 * Math.PI * 2 + rand() * 0.3;
        const spd = (65 + rand() * 115) * u;
        pushMote({
          kind: "star",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 25 * u,
          grav: 110 * u,
          drag: 2.4,
          size: (3 + rand() * 2.6) * u,
          rot: rand() * Math.PI,
          vRot: (rand() - 0.5) * 8,
          life: 480 + rand() * 220,
          col: cols[i % cols.length]
        });
      }
    } else if (status === "canceled") {
      for (let i = 0; i < 8; i++) {
        const side = i % 2 === 0 ? -Math.PI * 0.25 : Math.PI * 0.75;
        const a = side + (rand() - 0.5) * 0.45;
        const spd = (55 + rand() * 75) * u;
        pushMote({
          kind: "slash",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 0,
          drag: 4.8,
          size: (4.2 + rand() * 2) * u,
          rot: -Math.PI * 0.25,
          vRot: 0,
          life: 310 + rand() * 110,
          col: cols[i % cols.length]
        });
      }
    } else if (status === "kawaii") {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 2.2;
        const spd = (60 + rand() * 90) * u;
        pushMote({
          kind: i % 2 === 0 ? "heart" : "star",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 15 * u,
          grav: 40 * u,
          drag: 2.6,
          size: (i % 2 === 0 ? 3.4 + rand() * 1.6 : 2.6 + rand() * 1.4) * u,
          rot: (rand() - 0.5) * 0.6,
          vRot: (rand() - 0.5) * 3,
          sway: rand() * Math.PI * 2,
          life: 560 + rand() * 220,
          col: cols[i % cols.length]
        });
      }
    } else if (status === "bug") {
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2 + rand() * 0.5;
        const spd = (70 + rand() * 70) * u;
        pushMote({
          kind: "beetle",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 0,
          drag: 3.2,
          size: (2.6 + rand() * 1.2) * u,
          rot: a + Math.PI / 2,
          vRot: 0,
          wiggle: rand() * Math.PI * 2,
          life: 460 + rand() * 160,
          col: cols[i % 2]
        });
      }
    } else if (status === "draft") {
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 1.6;
        const spd = (50 + rand() * 80) * u;
        pushMote({
          kind: i < 5 ? "drop" : "spark",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 260 * u,
          drag: 1.8,
          size: (i < 5 ? 2.6 + rand() * 1.2 : 1.6) * u,
          life: 480 + rand() * 160,
          col: cols[i % cols.length]
        });
      }
    } else if (status === "deadline") {
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        pushMote({
          kind: "spike",
          vx: Math.cos(a) * 55 * u,
          vy: Math.sin(a) * 55 * u,
          grav: 0,
          drag: 6,
          size: (i % 3 === 0 ? 4.6 : 3) * u,
          rot: a,
          vRot: 0,
          life: 380 + (i % 3 === 0 ? 120 : 0),
          col: cols[i % 3 === 0 ? 0 : 2]
        });
      }
      for (let i = 0; i < 6; i++) {
        pushMote({
          kind: "spark",
          vx: (rand() - 0.5) * 40 * u,
          vy: (10 + rand() * 30) * u,
          grav: 220 * u,
          drag: 1.5,
          size: (1.1 + rand() * 0.8) * u,
          life: 520 + rand() * 160,
          col: cols[1]
        });
      }
    } else if (status === "flower") {
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + rand() * 0.4;
        const spd = (45 + rand() * 70) * u;
        pushMote({
          kind: i < 7 ? "petal" : "spark",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 10 * u,
          grav: 70 * u,
          drag: 2.4,
          size: (i < 7 ? 3.4 + rand() * 1.4 : 1.8) * u,
          rot: rand() * Math.PI,
          vRot: (rand() - 0.5) * 6,
          sway: rand() * Math.PI * 2,
          life: 620 + rand() * 240,
          col: i < 7 ? cols[i % 2] : cols[2]
        });
      }
    } else if (status === "sun") {
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2 + rand() * 0.1;
        const spd = (110 + rand() * 60) * u;
        pushMote({
          kind: i % 2 === 0 ? "spike" : "spark",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 0,
          drag: 5.4,
          size: (i % 2 === 0 ? 5.2 : 2) * u,
          rot: a,
          vRot: 0,
          life: 380 + rand() * 120,
          col: cols[i % cols.length]
        });
      }
    } else if (status === "moon") {
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 2.6;
        const spd = (30 + rand() * 55) * u;
        pushMote({
          kind: i % 3 === 0 ? "star" : "spark",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 12 * u,
          grav: -18 * u,
          drag: 2.2,
          size: (i % 3 === 0 ? 3 + rand() * 1.4 : 1.2 + rand() * 0.8) * u,
          rot: rand() * Math.PI,
          vRot: (rand() - 0.5) * 2,
          twinkle: rand() * Math.PI * 2,
          life: 700 + rand() * 260,
          col: cols[i % cols.length]
        });
      }
    } else {
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + rand() * 0.25;
        const spd = (65 + rand() * 85) * u;
        pushMote({
          kind: i % 3 === 0 ? "star" : "spark",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 70 * u,
          drag: 3.8,
          size: (i % 3 === 0 ? 3 : 2 + rand() * 0.9) * u,
          rot: rand() * Math.PI,
          vRot: (rand() - 0.5) * 5,
          life: 360 + rand() * 150,
          col: cols[i % cols.length]
        });
      }
    }
    kick();
    return true;
  }
  function emitForCheckbox(checkbox, { shape = null, color = null } = {}) {
    if (disposed || !checkbox || !isEnabled() || !isBurstStyleActive(getStyle()) || isBurstBlockedByMedia(windowLike)) {
      return false;
    }
    const input = checkbox.querySelector?.('input[type="checkbox"]');
    if (input?.checked === true) return false;
    const rect = readCheckboxRect(checkbox);
    if (!rect) return false;
    const resolvedShape = shape || checkbox.getAttribute?.("data-ts-checkbox-shape") || "custom";
    return emitAt(resolvedShape, rect.left + rect.width / 2, rect.top + rect.height / 2, {
      size: Math.max(rect.width, rect.height),
      color
    });
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    clear();
    if (resizeBound && typeof windowLike?.removeEventListener === "function") {
      windowLike.removeEventListener("resize", handleResize);
      resizeBound = false;
    }
    canvas?.remove?.();
    canvas = null;
    ctx = null;
  }
  lifecycle?.add?.(dispose);
  return {
    get canvas() {
      return canvas;
    },
    get activeCount() {
      return rings.length + motes.length;
    },
    get hasFrameScheduled() {
      return Boolean(rafId);
    },
    emitForCheckbox,
    emitAt,
    resize,
    clear,
    dispose
  };
}

// src/theme.js
var THEME_ATTRIBUTE = "data-ts-theme";
var THEME_SETTING_VALUES = Object.freeze({
  FOLLOW_ROAM: "Follow Roam",
  LIGHT: "Light",
  DARK: "Dark"
});
function normalizeThemeSetting(value, fallback = THEME_SETTING_VALUES.FOLLOW_ROAM) {
  const candidate = value && typeof value === "object" ? value.target?.value ?? value.currentTarget?.value ?? value.value : value;
  const normalized = String(candidate || "").trim();
  return Object.values(THEME_SETTING_VALUES).includes(normalized) ? normalized : fallback;
}
function themeSettingToPreference(value) {
  const normalized = normalizeThemeSetting(value);
  if (normalized === THEME_SETTING_VALUES.LIGHT) return "light";
  if (normalized === THEME_SETTING_VALUES.DARK) return "dark";
  return null;
}
function hasClass2(el, name) {
  return Boolean(el?.classList?.contains?.(name));
}
function parseColor(value) {
  const raw = String(value ?? "");
  if (!/^\s*rgba?\(/i.test(raw)) return null;
  const numbers = raw.match(/-?\d*\.?\d+/g);
  if (!numbers || numbers.length < 3) return null;
  const [r, g, b] = numbers.slice(0, 3).map(Number);
  const alpha = numbers.length > 3 ? Number(numbers[3]) : 1;
  if (![r, g, b, alpha].every(Number.isFinite) || alpha <= 0) return null;
  return { r, g, b };
}
function luminance({ r, g, b }) {
  const channel2 = (v) => {
    const c = Math.min(255, Math.max(0, v)) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel2(r) + 0.7152 * channel2(g) + 0.0722 * channel2(b);
}
function readMeasuredBackground(element, windowLike) {
  if (!element) return null;
  try {
    const compute = windowLike?.getComputedStyle ?? globalThis.getComputedStyle;
    if (typeof compute !== "function") return null;
    const style = compute.call(windowLike, element);
    return parseColor(style?.backgroundColor);
  } catch (_) {
    return null;
  }
}
function resolveHostTheme({
  document: documentLike,
  window: windowLike,
  preference
} = {}) {
  const pref = typeof preference === "string" ? preference.trim().toLowerCase() : "";
  if (pref === "light" || pref === "dark") return pref;
  const html = documentLike?.documentElement;
  const body = documentLike?.body;
  if (hasClass2(html, "bp3-dark") || hasClass2(body, "bt-theme-dark") || hasClass2(html, "rm-dark-theme") || hasClass2(body, "rm-dark-theme") || hasClass2(body, "roam-body") && hasClass2(body, "dark")) {
    return "dark";
  }
  if (hasClass2(html, "bp3-light") || hasClass2(body, "bt-theme-light")) {
    return "light";
  }
  const bodyColor = readMeasuredBackground(body, windowLike);
  if (bodyColor) return luminance(bodyColor) < 0.4 ? "dark" : "light";
  const htmlColor = readMeasuredBackground(html, windowLike);
  if (htmlColor) return luminance(htmlColor) < 0.4 ? "dark" : "light";
  try {
    const query = windowLike?.matchMedia?.("(prefers-color-scheme: dark)");
    if (query?.matches) return "dark";
  } catch (_) {
  }
  return "light";
}

// src/status-view.js
var STATUS_VIEW_CLASS = "ts-status-view";
var STATUS_VIEW_FILTERS = Object.freeze(["media", "tasks", "all"]);
var FILTER_LABELS = { media: "Media", tasks: "Tasks", all: "All" };
var EMPTY_TEXT = {
  media: "No open tasks with a media status.",
  tasks: "No open tasks with a task status.",
  all: "No open tasks with a status."
};
var MEDIA_ORDER = ["watching", "watchlist", "upcoming", "series", "rewatch"];
var STATUS_TASKS_QUERY = "[:find ?uid ?str ?title ?time ?page :in $ [?title ...] :where [?t :node/title ?title] [?b :block/refs ?t] [?b :block/uid ?uid] [?b :block/string ?str] [(get-else $ ?b :edit/time 0) ?time] [?b :block/page ?p] [?p :node/title ?page]]";
var TASKS_QUERY = STATUS_TASKS_QUERY;
var EPISODE_QUERY = '[:find ?puid ?cuid ?cs ?order :in $ [?puid ...] :where [?p :block/uid ?puid] [?p :block/children ?c] [?c :block/uid ?cuid] [?c :block/string ?cs] [?c :block/order ?order] [(clojure.string/includes? ?cs "::")]]';
function lowerName(row) {
  return String(row?.name ?? "").trim().toLowerCase();
}
function orderStatusGroups(rows, filter = "media") {
  const list = Array.isArray(rows) ? rows : [];
  const media = list.filter((row) => row.media);
  const tasks = list.filter((row) => !row.media);
  const mediaOrder = () => {
    const out = [];
    const used = /* @__PURE__ */ new Set();
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
async function queryStatusTasks({
  roamAlphaAPI,
  statuses,
  helpers,
  includeDone = false,
  includeEpisodes = true
}) {
  const keyByTitle = /* @__PURE__ */ new Map();
  for (const status of statuses || []) {
    const tagTitle = status?.tagTitle || status?.tag;
    if (tagTitle && status?.key) keyByTitle.set(tagTitle, status.key);
  }
  if (!keyByTitle.size) return [];
  const found = await runQuery(roamAlphaAPI, TASKS_QUERY, [...keyByTitle.keys()]);
  const kept = /* @__PURE__ */ new Map();
  for (const entry of Array.isArray(found) ? found : []) {
    const [uid, string, title, time, page] = entry || [];
    if (typeof uid !== "string" || typeof string !== "string" || kept.has(uid)) continue;
    const key = keyByTitle.get(title);
    if (!key) continue;
    const parsed = helpers.parseManagedPrefix(string);
    if (!parsed?.managed) continue;
    const done = parsed.taskKind === "done";
    if (!includeDone && done) continue;
    if (parsed.currentStatus !== key) continue;
    kept.set(uid, {
      uid,
      statusKey: key,
      string,
      body: String(parsed.body ?? "").trim(),
      done,
      page: typeof page === "string" ? page : null,
      editTime: Number(time) || 0,
      episode: null
    });
  }
  const rows = [...kept.values()];
  if (!rows.length) return rows;
  if (includeEpisodes) {
    const childRows = await runQuery(roamAlphaAPI, EPISODE_QUERY, rows.map((row) => row.uid));
    const childrenByUid = /* @__PURE__ */ new Map();
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
  }
  rows.sort((a, b) => b.editTime - a.editTime || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  return rows;
}
var DOCK_WAIT_MS = 1e3;
var DOCK_STEP_MS = 25;
var SIDEBAR_ID = "#right-sidebar";
var SIDEBAR_CONTENT_ID = "#roam-right-sidebar-content";
var KEY_EVENTS = ["keydown", "keypress", "keyup"];
function resolveViewTheme({ document: documentLike, window: windowLike, preference } = {}) {
  return resolveHostTheme({ document: documentLike, window: windowLike, preference });
}
var INNER_LINK_SELECTOR = "a, .rm-page-ref, .rm-block-ref, [data-link-title]";
function createStatusView({
  document: documentLike,
  window: windowLike,
  roamAlphaAPI,
  portalRoot,
  readGroups,
  getTheme = null,
  waitMs = DOCK_WAIT_MS,
  MutationObserverCtor = windowLike?.MutationObserver ?? globalThis.MutationObserver,
  log = () => {
  }
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
      } catch (_) {
      }
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
  function applyTheme() {
    const theme = typeof getTheme === "function" ? getTheme() : resolveViewTheme({ document: documentLike, window: windowLike });
    root?.setAttribute("data-ts-view-theme", theme);
    dockEl?.setAttribute("data-ts-view-theme", theme);
  }
  function renderContent() {
    if (!root || !scroller) return;
    applyTheme();
    const scrollTop = scroller.scrollTop;
    unmountRendered();
    content?.remove();
    content = make("div", "ts-status-view-content");
    if (loadError) {
      content.append(stateMessage("Could not read tasks."));
    } else if (rows == null || groups == null) {
      content.append(stateMessage("Loading…"));
    } else {
      const byStatus = /* @__PURE__ */ new Map();
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
            helpers: nextGroups.helpers
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
    for (; ; ) {
      const content2 = query(SIDEBAR_CONTENT_ID);
      if (content2) return content2;
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
      applyTheme();
      container.scrollTop = 0;
      const host = query(SIDEBAR_ID);
      if (host && typeof MutationObserverCtor === "function") {
        observer = new MutationObserverCtor(() => {
          if (!root || !dockEl || dockEl.isConnected) return;
          const content2 = query(SIDEBAR_CONTENT_ID);
          if (content2) content2.prepend(dockEl);
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
    let content2 = null;
    try {
      const result4 = sidebar.open();
      if (result4 && typeof result4.then === "function") await result4;
      if (!wasOpen) openedSidebar = true;
      content2 = await waitForSidebarContent();
    } catch (error) {
      log("Watching now could not open the sidebar:", error);
    }
    if (disposed || token !== openToken) {
      closeSidebarIfOurs();
      return;
    }
    opening = false;
    mount(content2);
    if (!content2) closeSidebarIfOurs();
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

// src/status-write.js
var BLOCK_STRING_PULL_PATTERN = "[:block/uid :block/string]";
var BLOCK_CHILDREN_PULL_PATTERN = "[:block/uid {:block/children [:block/string]}]";
var MANAGED_TASK_PREFIX_RE = /^[ \t]*(?:\{\{\[\[TODO\]\]\}\}|\{\{TODO\}\}|\{\{\[\[DONE\]\]\}\}|\{\{DONE\}\})/;
function hasManagedTaskPrefix(text) {
  return typeof text === "string" && MANAGED_TASK_PREFIX_RE.test(text);
}
function valueAt4(value, keyword, fallback = null) {
  if (!value || typeof value !== "object") return fallback;
  const plain = keyword.replace(/^:/, "");
  return value[keyword] ?? value[plain] ?? value[plain.replace(/^block\//, "")] ?? fallback;
}
function createFreshBlockStringReader(roamAlphaAPI) {
  const pull = roamAlphaAPI?.data?.async?.pull;
  if (typeof pull !== "function") {
    throw new TypeError("roamAlphaAPI.data.async.pull is required");
  }
  return async (uid) => {
    const value = await pull.call(
      roamAlphaAPI.data.async,
      BLOCK_STRING_PULL_PATTERN,
      [":block/uid", uid]
    );
    const pulledUid = valueAt4(value, ":block/uid", null);
    const string = valueAt4(value, ":block/string", null);
    if (pulledUid !== uid || typeof string !== "string") return null;
    return string;
  };
}
function createBlockChildStringsReader(roamAlphaAPI) {
  const pull = roamAlphaAPI?.data?.async?.pull;
  if (typeof pull !== "function") {
    throw new TypeError("roamAlphaAPI.data.async.pull is required");
  }
  return async (uid) => {
    const value = await pull.call(
      roamAlphaAPI.data.async,
      BLOCK_CHILDREN_PULL_PATTERN,
      [":block/uid", uid]
    );
    const pulledUid = valueAt4(value, ":block/uid", null);
    if (pulledUid !== uid) return null;
    const children = valueAt4(value, ":block/children", []);
    if (!Array.isArray(children)) return [];
    return children.map((child) => valueAt4(child, ":block/string", null)).filter((string) => typeof string === "string");
  };
}
function result3(status, fields = {}) {
  return { status, didWrite: status === "updated", ...fields };
}
async function certify({ uid, expectedString, nextString, readFresh, writeError = null }) {
  let observed;
  try {
    observed = await readFresh(uid);
  } catch (error) {
    return result3("unknown", {
      reason: "post-write-read-failed",
      error: writeError || error
    });
  }
  if (observed === nextString) {
    return result3("updated", {
      reason: writeError ? "write-threw-after-commit" : "certified",
      string: observed
    });
  }
  if (observed === expectedString) {
    return result3("not-updated", {
      reason: writeError ? "write-failed-before-commit" : "write-not-observed",
      error: writeError || void 0,
      string: observed
    });
  }
  return result3("conflict", {
    reason: observed == null ? "block-missing-after-write" : "third-state-after-write",
    error: writeError || void 0,
    string: observed
  });
}
function createCertifiedBlockStringWriter({
  readFresh,
  updateBlock,
  getLiveEditorString = () => null
}) {
  if (typeof readFresh !== "function") throw new TypeError("readFresh must be a function");
  if (typeof updateBlock !== "function") throw new TypeError("updateBlock must be a function");
  if (typeof getLiveEditorString !== "function") {
    throw new TypeError("getLiveEditorString must be a function");
  }
  return Object.freeze({
    async apply({
      uid,
      expectedString,
      nextString,
      expectedLiveEditorString,
      editorString,
      userUid,
      requireExistingTask = false
    }) {
      if (typeof uid !== "string" || !uid.trim()) {
        return result3("rejected", { reason: "invalid-uid" });
      }
      if (typeof expectedString !== "string" || typeof nextString !== "string") {
        return result3("rejected", { reason: "invalid-string" });
      }
      let before;
      try {
        before = await readFresh(uid);
      } catch (error) {
        return result3("unknown", { reason: "pre-write-read-failed", error });
      }
      if (before == null) return result3("rejected", { reason: "block-not-found" });
      if (before !== expectedString) {
        return result3("conflict", { reason: "stale-expected-string", string: before });
      }
      if (requireExistingTask && !hasManagedTaskPrefix(before)) {
        return result3("rejected", { reason: "not-a-task", string: before });
      }
      const hasEditorHandoff = expectedLiveEditorString !== void 0 || editorString !== void 0;
      if (hasEditorHandoff && (typeof expectedLiveEditorString !== "string" || typeof editorString !== "string")) {
        return result3("rejected", { reason: "invalid-editor-handoff" });
      }
      if (hasEditorHandoff) {
        const live = getLiveEditorString(uid);
        if (live !== expectedLiveEditorString && live !== editorString) {
          return result3("conflict", {
            reason: "active-editor-diverged",
            string: typeof live === "string" ? live : null
          });
        }
      }
      if (nextString === expectedString) {
        return result3("unchanged", { reason: "already-current", string: before });
      }
      const normalizedUserUid = typeof userUid === "string" && userUid.trim() ? userUid.trim() : null;
      try {
        if (normalizedUserUid) {
          await updateBlock(uid, nextString, { userUid: normalizedUserUid });
        } else {
          await updateBlock(uid, nextString);
        }
      } catch (error) {
        return certify({ uid, expectedString, nextString, readFresh, writeError: error });
      }
      return certify({ uid, expectedString, nextString, readFresh });
    }
  });
}

// src/status-peek.js
var STATUS_PEEK_CLASS = "ts-status-peek";
var STATUS_PEEK_HELP_ID = "ts-status-checkbox-help";
function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function clamp2(value, minimum, maximum) {
  const safeMaximum = Math.max(minimum, maximum);
  return Math.max(minimum, Math.min(value, safeMaximum));
}
function computeGutterPopoverPlacement({
  anchorRect,
  floatingRect,
  viewportWidth,
  viewportHeight,
  margin = 8,
  gap = 7,
  arrowSize = 30
} = {}) {
  const anchorLeft = finiteNumber(anchorRect?.left);
  const anchorTop = finiteNumber(anchorRect?.top);
  const anchorWidth = Math.max(0, finiteNumber(anchorRect?.width));
  const anchorHeight = Math.max(0, finiteNumber(anchorRect?.height));
  const width = Math.max(0, finiteNumber(floatingRect?.width));
  const height = Math.max(0, finiteNumber(floatingRect?.height));
  const safeViewportWidth = Math.max(0, finiteNumber(viewportWidth));
  const safeViewportHeight = Math.max(0, finiteNumber(viewportHeight));
  const safeMargin = Math.max(0, finiteNumber(margin, 8));
  const safeGap = Math.max(0, finiteNumber(gap, 7));
  const safeArrowSize = Math.max(0, finiteNumber(arrowSize, 30));
  const anchorCenterX = anchorLeft + anchorWidth / 2;
  const anchorCenterY = anchorTop + anchorHeight / 2;
  const preferredLeft = anchorLeft - safeGap - width;
  if (preferredLeft >= safeMargin) {
    const anchorOffset = Math.min(height / 2, safeArrowSize);
    const top2 = clamp2(
      anchorCenterY - anchorOffset,
      safeMargin,
      safeViewportHeight - height - safeMargin
    );
    return Object.freeze({
      placement: "left",
      left: preferredLeft,
      top: top2,
      arrowSide: "right",
      arrowOffset: clamp2(
        anchorCenterY - top2 - safeArrowSize / 2,
        4,
        height - safeArrowSize - 4
      ),
      arrowRotation: 180
    });
  }
  const left = clamp2(
    anchorCenterX - width / 2,
    safeMargin,
    safeViewportWidth - width - safeMargin
  );
  const below = anchorTop + anchorHeight + safeGap;
  const above = anchorTop - height - safeGap;
  const opensBelow = below + height <= safeViewportHeight - safeMargin || above < safeMargin;
  const top = opensBelow ? clamp2(below, safeMargin, safeViewportHeight - height - safeMargin) : clamp2(above, safeMargin, safeViewportHeight - height - safeMargin);
  return Object.freeze({
    placement: opensBelow ? "below" : "above",
    left,
    top,
    arrowSide: opensBelow ? "top" : "bottom",
    arrowOffset: clamp2(
      anchorCenterX - left - safeArrowSize / 2,
      4,
      width - safeArrowSize - 4
    ),
    arrowRotation: opensBelow ? 90 : 270
  });
}
function resolveBlockGutterAnchor(element) {
  if (!element?.closest) return element || null;
  const blockMain = element.closest(".rm-block-main");
  if (!blockMain) return element;
  const directControls = Array.from(blockMain.children || []).find(
    (child) => child?.matches?.(".rm-block__controls")
  );
  const controls = directControls || blockMain.querySelector?.(".rm-block__controls");
  const roots = [controls, blockMain].filter(Boolean);
  const selectors = [".rm-bullet", ".simple-bullet-outer", ".rm-bullet__inner"];
  for (const root of roots) {
    for (const selector of selectors) {
      const candidate = root.querySelector?.(selector);
      if (candidate?.closest?.(".rm-block-main") === blockMain) return candidate;
    }
  }
  return element;
}
function contains(container, target) {
  if (!container || !target) return false;
  if (typeof container.contains === "function") return container.contains(target);
  let current = target;
  while (current) {
    if (current === container) return true;
    current = current.parentElement || current.parentNode || null;
  }
  return false;
}
function attributeTokens(element, name) {
  return String(element?.getAttribute?.(name) || "").split(/\s+/).map((token) => token.trim()).filter(Boolean);
}
function appendAttributeToken(element, name, token) {
  const ownedToken = String(token || "").trim();
  if (!element?.setAttribute || !ownedToken) return false;
  const next = [.../* @__PURE__ */ new Set([...attributeTokens(element, name), ownedToken])];
  element.setAttribute(name, next.join(" "));
  return true;
}
function removeAttributeToken(element, name, token) {
  const ownedToken = String(token || "").trim();
  if (!element?.removeAttribute || !ownedToken) return false;
  const next = attributeTokens(element, name).filter((item) => item !== ownedToken);
  if (next.length) element.setAttribute(name, next.join(" "));
  else element.removeAttribute(name);
  return true;
}
function resolveOwnedStatusCheckbox(target) {
  const checkbox = target?.closest?.(OWNED_CHECKBOX_SELECTOR) || null;
  if (!checkbox) return null;
  if (checkbox.isConnected === false) return null;
  const statusKey = checkbox.getAttribute?.(CHECKBOX_STATUS_ATTRIBUTE);
  const input = checkbox.querySelector?.('input[type="checkbox"]') || null;
  const checkmark = checkbox.querySelector?.(".checkmark") || null;
  if (!statusKey || !input || !checkmark) return null;
  return Object.freeze({ checkbox, input, checkmark, statusKey });
}
function isStatusChooserKey(event) {
  if (!event || event.ctrlKey || event.metaKey) return false;
  if (event.key === "Enter" && !event.altKey && !event.shiftKey) {
    return true;
  }
  return event.key === "ArrowDown" && Boolean(event.altKey) && !event.shiftKey;
}
function stopIntentEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}
function setButtonText(button, label) {
  const text = button?.querySelector?.(".ts-status-peek-label");
  if (text) text.textContent = label;
}
function createStatusPeekController({
  document: documentLike,
  window: windowLike,
  portalRoot,
  resolveContext,
  onOpen,
  onRemove,
  onAnchorInvalid = () => {
  },
  onError = () => {
  },
  showDelay = 210,
  hideDelay = 120
} = {}) {
  if (!documentLike?.createElement || !portalRoot?.appendChild) {
    throw new TypeError("Status peek requires a document and portal root");
  }
  const eventRoot = documentLike;
  const setTimer = windowLike?.setTimeout?.bind(windowLike) || setTimeout;
  const clearTimer = windowLike?.clearTimeout?.bind(windowLike) || clearTimeout;
  const requestFrame = windowLike?.requestAnimationFrame?.bind(windowLike) || ((callback) => setTimer(callback, 0));
  let enabled = false;
  let started = false;
  let activeContext = null;
  let peekButton = null;
  let describedInput = null;
  let showTimer = null;
  let hideTimer = null;
  let helperEl = null;
  let chooserOpen = false;
  let activationRevision = 0;
  function report(error) {
    try {
      onError(error);
    } catch (_) {
    }
  }
  function reportInvalidAnchor() {
    try {
      onAnchorInvalid();
    } catch (error) {
      report(error);
    }
  }
  function clearShowTimer() {
    if (showTimer !== null) clearTimer(showTimer);
    showTimer = null;
  }
  function clearHideTimer() {
    if (hideTimer !== null) clearTimer(hideTimer);
    hideTimer = null;
  }
  function ensureHelper() {
    if (helperEl) return helperEl;
    helperEl = documentLike.createElement("span");
    helperEl.id = STATUS_PEEK_HELP_ID;
    helperEl.className = "ts-status-sr-only";
    helperEl.textContent = "Workflow status. Press Enter or Alt plus Down Arrow to choose a status. Press Space to complete or reopen the task.";
    portalRoot.appendChild(helperEl);
    return helperEl;
  }
  function detachDescription() {
    if (describedInput) {
      removeAttributeToken(describedInput, "aria-describedby", STATUS_PEEK_HELP_ID);
    }
    describedInput = null;
  }
  function attachDescription(input, label) {
    if (!input) return;
    if (describedInput !== input) detachDescription();
    ensureHelper().textContent = `${label} workflow status. Press Enter or Alt plus Down Arrow to choose a status. Press Space to complete or reopen the task.`;
    appendAttributeToken(input, "aria-describedby", STATUS_PEEK_HELP_ID);
    describedInput = input;
  }
  function removePeekButton() {
    if (peekButton?.remove) peekButton.remove();
    peekButton = null;
  }
  function hide() {
    activationRevision += 1;
    clearShowTimer();
    clearHideTimer();
    detachDescription();
    removePeekButton();
    activeContext = null;
    chooserOpen = false;
  }
  function resolveFreshContext(owned) {
    if (!owned || typeof resolveContext !== "function") return null;
    const freshOwned = resolveOwnedStatusCheckbox(owned.checkbox);
    if (!freshOwned) return null;
    const resolved = resolveContext(freshOwned);
    if (!resolved?.blockUid || !resolved?.statusKey) return null;
    return Object.freeze({
      ...resolved,
      ...freshOwned,
      label: String(resolved.label || resolved.statusKey),
      anchorEl: freshOwned.checkbox,
      returnFocusEl: freshOwned.input
    });
  }
  function positionPeek(button, context) {
    if (!button?.style || !context?.checkbox?.getBoundingClientRect) return;
    const placementAnchor = context.placementAnchorEl || resolveBlockGutterAnchor(context.checkbox);
    const viewportWidth = windowLike?.innerWidth || documentLike.documentElement?.clientWidth || 0;
    const viewportHeight = windowLike?.innerHeight || documentLike.documentElement?.clientHeight || 0;
    button.style.visibility = "hidden";
    button.style.left = "0px";
    button.style.top = "0px";
    const applyPosition = () => {
      if (!peekButton || peekButton !== button || !button.isConnected) return;
      if (activeContext?.checkbox !== context.checkbox) return;
      if (context.checkbox.isConnected === false) {
        hide();
        reportInvalidAnchor();
        return;
      }
      const anchorRect = placementAnchor?.getBoundingClientRect?.();
      if (!anchorRect) return;
      const rect = button.getBoundingClientRect?.() || { width: 0, height: 0 };
      const width = Number(button.offsetWidth) || Number(rect.width) || 0;
      const height = Number(button.offsetHeight) || Number(rect.height) || 0;
      const placement = computeGutterPopoverPlacement({
        anchorRect,
        floatingRect: { width, height },
        viewportWidth,
        viewportHeight
      });
      button.setAttribute?.("data-ts-placement", placement.placement);
      button.classList?.toggle?.("ts-status-peek-below", placement.placement === "below");
      button.style.left = `${Math.round(placement.left)}px`;
      button.style.top = `${Math.round(placement.top)}px`;
      button.style.visibility = "visible";
    };
    applyPosition();
    requestFrame(applyPosition);
  }
  async function activate(context, event, remove = false) {
    stopIntentEvent(event);
    if (!remove && chooserOpen) return false;
    const fresh = resolveFreshContext(context);
    if (!fresh) {
      hide();
      return false;
    }
    let intentContext = fresh;
    if (remove) hide();
    else {
      const activationId = ++activationRevision;
      clearShowTimer();
      clearHideTimer();
      detachDescription();
      activeContext = fresh;
      if (!peekButton) {
        peekButton = makePeekButton(fresh);
        portalRoot.appendChild(peekButton);
        positionPeek(peekButton, fresh);
      }
      chooserOpen = true;
      peekButton?.setAttribute("aria-expanded", "true");
      peekButton?.classList?.toggle?.("ts-status-peek-expanded", true);
      intentContext = Object.freeze({
        ...fresh,
        isIntentCurrent: () => chooserOpen && activationRevision === activationId && activeContext?.checkbox === fresh.checkbox && activeContext?.statusKey === fresh.statusKey && activeContext?.blockUid === fresh.blockUid
      });
    }
    try {
      const result4 = remove ? await onRemove?.(intentContext) : await onOpen?.(intentContext);
      if (!remove && result4 === false) hide();
      return true;
    } catch (error) {
      hide();
      report(error);
      return false;
    }
  }
  function setGlyphAttribute(button, glyph) {
    if (glyph) button.setAttribute("data-ts-status-glyph", glyph);
    else button.removeAttribute("data-ts-status-glyph");
  }
  function makePeekButton(context) {
    const button = documentLike.createElement("button");
    button.type = "button";
    button.className = STATUS_PEEK_CLASS;
    button.setAttribute("data-task-status-peek", "true");
    button.setAttribute("data-task-status-key", context.statusKey);
    setGlyphAttribute(button, context.glyph);
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute(
      "aria-label",
      `Change task status from ${context.label}. Shift-click to remove.`
    );
    const label = documentLike.createElement("span");
    label.className = "ts-status-peek-label";
    label.textContent = context.label;
    const chevron = documentLike.createElement("span");
    chevron.className = "ts-status-peek-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌄";
    button.append(label, chevron);
    button.addEventListener("mousedown", stopIntentEvent);
    button.addEventListener("click", (event) => {
      if (activeContext) void activate(activeContext, event, Boolean(event.shiftKey));
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        stopIntentEvent(event);
        const focusTarget = activeContext?.returnFocusEl;
        hide();
        focusTarget?.focus?.({ preventScroll: true });
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        if (activeContext) void activate(activeContext, event, Boolean(event.shiftKey));
      }
    });
    return button;
  }
  function show(owned, { describe = false } = {}) {
    clearShowTimer();
    if (!enabled) return false;
    if (chooserOpen) return true;
    const context = resolveFreshContext(owned);
    if (!context) {
      hide();
      return false;
    }
    clearHideTimer();
    activeContext = context;
    if (describe) attachDescription(context.input, context.label);
    else if (describedInput && describedInput !== context.input) detachDescription();
    if (!peekButton) {
      peekButton = makePeekButton(context);
      portalRoot.appendChild(peekButton);
    } else {
      peekButton.setAttribute("data-task-status-key", context.statusKey);
      setGlyphAttribute(peekButton, context.glyph);
      peekButton.setAttribute(
        "aria-label",
        `Change task status from ${context.label}. Shift-click to remove.`
      );
      setButtonText(peekButton, context.label);
    }
    positionPeek(peekButton, context);
    return true;
  }
  function scheduleShow(owned, describe = false) {
    clearShowTimer();
    clearHideTimer();
    const delay = Math.max(0, Number(showDelay) || 0);
    if (delay === 0) {
      show(owned, { describe });
      return;
    }
    showTimer = setTimer(() => {
      showTimer = null;
      show(owned, { describe });
    }, delay);
  }
  function scheduleHide() {
    if (chooserOpen) return;
    clearShowTimer();
    clearHideTimer();
    const delay = Math.max(0, Number(hideDelay) || 0);
    if (delay === 0) {
      hide();
      return;
    }
    hideTimer = setTimer(() => {
      hideTimer = null;
      hide();
    }, delay);
  }
  function relatedStaysInside(event, owned) {
    const related = event?.relatedTarget;
    return contains(owned?.checkbox, related) || contains(peekButton, related);
  }
  function handlePointerOver(event) {
    if (!enabled) return;
    if (event.pointerType === "touch") return;
    if (contains(peekButton, event.target)) {
      clearHideTimer();
      return;
    }
    const owned = resolveOwnedStatusCheckbox(event.target);
    if (!owned) return;
    if (contains(owned.checkbox, event.relatedTarget)) return;
    scheduleShow(owned, false);
  }
  function handlePointerOut(event) {
    if (!enabled) return;
    if (event.pointerType === "touch") return;
    if (contains(peekButton, event.target)) {
      if (contains(peekButton, event.relatedTarget)) return;
      if (contains(activeContext?.checkbox, event.relatedTarget)) return;
      scheduleHide();
      return;
    }
    const owned = resolveOwnedStatusCheckbox(event.target);
    if (!owned || relatedStaysInside(event, owned)) return;
    scheduleHide();
  }
  function handleFocusIn(event) {
    if (!enabled) return;
    if (contains(peekButton, event.target)) {
      clearHideTimer();
      return;
    }
    const owned = resolveOwnedStatusCheckbox(event.target);
    if (owned) show(owned, { describe: true });
  }
  function handleFocusOut(event) {
    if (!enabled) return;
    if (contains(peekButton, event.target)) {
      if (contains(peekButton, event.relatedTarget)) return;
      if (contains(activeContext?.checkbox, event.relatedTarget)) return;
      scheduleHide();
      return;
    }
    const owned = resolveOwnedStatusCheckbox(event.target);
    if (!owned || relatedStaysInside(event, owned)) return;
    scheduleHide();
  }
  function handleKeyDown(event) {
    if (!enabled) return;
    const owned = resolveOwnedStatusCheckbox(event.target);
    if (event.key === "Escape" && owned && activeContext) {
      stopIntentEvent(event);
      hide();
      return;
    }
    if (!owned || !isStatusChooserKey(event)) return;
    void activate(owned, event, false);
  }
  function handleOutsideMouseDown(event) {
    if (!enabled || !activeContext || chooserOpen) return;
    if (contains(activeContext.checkbox, event.target) || contains(peekButton, event.target)) {
      return;
    }
    hide();
  }
  function handleViewportChange() {
    if (activeContext) hide();
  }
  const delegatedListeners = [
    ["pointerover", handlePointerOver],
    ["pointerout", handlePointerOut],
    ["focusin", handleFocusIn],
    ["focusout", handleFocusOut],
    ["keydown", handleKeyDown],
    ["mousedown", handleOutsideMouseDown]
  ];
  const viewportListeners = [
    ["resize", handleViewportChange],
    ["scroll", handleViewportChange]
  ];
  function start() {
    if (started) return;
    started = true;
    ensureHelper();
    delegatedListeners.forEach(([type, handler]) => {
      eventRoot.addEventListener(type, handler, true);
    });
    viewportListeners.forEach(([type, handler]) => {
      windowLike?.addEventListener?.(type, handler, true);
    });
  }
  function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
    if (!enabled) hide();
  }
  function refresh() {
    if (!activeContext) return;
    if (!enabled) {
      hide();
      return;
    }
    if (chooserOpen) {
      const fresh = resolveFreshContext(activeContext);
      if (!fresh || fresh.statusKey !== activeContext.statusKey || fresh.blockUid !== activeContext.blockUid) {
        hide();
        reportInvalidAnchor();
        return false;
      }
      activeContext = fresh;
      return true;
    }
    const describe = describedInput === activeContext.input;
    return show(activeContext, { describe });
  }
  function chooserClosed() {
    if (!chooserOpen) return;
    hide();
  }
  function destroy() {
    if (started) {
      delegatedListeners.forEach(([type, handler]) => {
        eventRoot.removeEventListener(type, handler, true);
      });
      viewportListeners.forEach(([type, handler]) => {
        windowLike?.removeEventListener?.(type, handler, true);
      });
    }
    started = false;
    enabled = false;
    hide();
    if (helperEl?.remove) helperEl.remove();
    helperEl = null;
  }
  return Object.freeze({
    start,
    destroy,
    hide,
    refresh,
    chooserClosed,
    setEnabled,
    isEnabled: () => enabled,
    isVisible: () => Boolean(peekButton?.isConnected)
  });
}

// src/extension.js
var GLOBAL_KEY = "__svyk_roamTaskStatusTags";
var BUNDLED_VERSION = true ? "0.16.0" : "development";
function resolveTaskStatusRuntimeVersion(extensionVersion) {
  const reported = typeof extensionVersion === "string" ? extensionVersion.trim() : "";
  return reported && reported.toUpperCase() !== "DEV" ? reported : BUNDLED_VERSION;
}
var STATUS_DEFAULTS_VERSION = 3;
var MEDIA_STATUS_DEFAULTS = Object.freeze([
  Object.freeze({ key: "SERIES", name: "Series" }),
  Object.freeze({ key: "MOVIE", name: "Movie" }),
  Object.freeze({ key: "WATCHING", name: "Watching" }),
  Object.freeze({ key: "WATCHLIST", name: "Watchlist" }),
  Object.freeze({ key: "UPCOMING", name: "Upcoming" }),
  Object.freeze({ key: "REWATCH", name: "Rewatch" }),
  Object.freeze({ key: "DROPPED", name: "Dropped" })
]);
var EXTRA_STATUS_DEFAULTS = Object.freeze([
  Object.freeze({ key: "IMPORTANT", name: "Important" }),
  Object.freeze({ key: "STARRED", name: "Starred" }),
  Object.freeze({ key: "DISCUSS", name: "Discuss" }),
  Object.freeze({ key: "BILLABLE", name: "Billable" }),
  Object.freeze({ key: "BUG", name: "Bug" }),
  Object.freeze({ key: "DRAFT", name: "Draft" }),
  Object.freeze({ key: "DEADLINE", name: "Deadline" }),
  Object.freeze({ key: "KAWAII", name: "Kawaii" }),
  Object.freeze({ key: "FLOWER", name: "Flower" }),
  Object.freeze({ key: "SUN", name: "Sun" }),
  Object.freeze({ key: "MOON", name: "Moon" })
]);
function mergeExtraStatuses(list) {
  const source = Array.isArray(list) ? list : [];
  const keys = new Set(source.map((entry) => entry?.key));
  const names = new Set(
    source.map((entry) => String(entry?.name || "").trim().toLowerCase())
  );
  const added = EXTRA_STATUS_DEFAULTS.filter(
    (entry) => !keys.has(entry.key) && !names.has(entry.name.toLowerCase())
  ).map((entry) => ({ ...entry }));
  if (!added.length) return { list: source, added: [] };
  return {
    list: [...source.map((entry) => ({ ...entry })), ...added],
    added
  };
}
function migrateStatusListDefaults(list, defaultsVersion) {
  const version = Number.isFinite(Number(defaultsVersion)) ? Number(defaultsVersion) : 1;
  if (version >= STATUS_DEFAULTS_VERSION || !Array.isArray(list)) return list;
  let next = list;
  if (version < 2) {
    const exists = list.some(
      (entry) => entry?.key === "IN_REVIEW" || String(entry?.name || "").trim().toLowerCase() === "in review"
    );
    if (!exists) {
      next = list.map((entry2) => ({ ...entry2 }));
      const waitingIdx = next.findIndex((entry2) => entry2.key === "WAITING");
      const entry = { key: "IN_REVIEW", name: "In Review" };
      if (waitingIdx === -1) next.push(entry);
      else next.splice(waitingIdx + 1, 0, entry);
    }
  }
  const keys = new Set(next.map((entry) => entry?.key));
  const names = new Set(
    next.map((entry) => String(entry?.name || "").trim().toLowerCase())
  );
  const additions = MEDIA_STATUS_DEFAULTS.filter(
    (entry) => !keys.has(entry.key) && !names.has(entry.name.toLowerCase())
  ).map((entry) => ({ ...entry }));
  if (!additions.length) return next;
  return [...next.map((entry) => ({ ...entry })), ...additions];
}
function nextTaskCycleStatus(cycleOrder, currentStatus, isMedia = () => false) {
  const order = (cycleOrder || []).filter((key) => !isMedia(key));
  if (!currentStatus) return order[0] || null;
  const idx = order.indexOf(currentStatus);
  if (idx === -1) return order[0] || null;
  return idx + 1 >= order.length ? null : order[idx + 1];
}
var TEXT_HELPER_DEFAULTS = {
  cycleOrder: ["ACTIVE", "WAITING", "IN_REVIEW", "HOLDING", "INCUBATING", "ALERT", "CANCELLED", "SERIES", "MOVIE", "WATCHING", "WATCHLIST", "UPCOMING", "REWATCH", "DROPPED"],
  todoPatterns: ["{{[[TODO]]}}", "{{TODO}}"],
  donePatterns: ["{{[[DONE]]}}", "{{DONE}}"],
  todoCanonical: "{{[[TODO]]}}",
  statusTagPrefix: "task-status/",
  statusNames: {
    ACTIVE: "Active",
    WAITING: "Waiting",
    IN_REVIEW: "In Review",
    HOLDING: "Holding",
    INCUBATING: "Incubating",
    ALERT: "Alert",
    CANCELLED: "Cancelled",
    SERIES: "Series",
    MOVIE: "Movie",
    WATCHING: "Watching",
    WATCHLIST: "Watchlist",
    UPCOMING: "Upcoming",
    REWATCH: "Rewatch",
    DROPPED: "Dropped"
  }
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
      tagTitles: [tagTitle]
    };
  });
  return statuses;
}
function createTaskStatusTextHelpers(options = {}) {
  const cycleOrder = options.cycleOrder || TEXT_HELPER_DEFAULTS.cycleOrder;
  const statusKeys = uniqueTextHelperStrings([
    ...cycleOrder,
    ...Object.keys(options.statuses || {}),
    ...options.statusKeys || []
  ]);
  const todoPatterns = options.todoPatterns || TEXT_HELPER_DEFAULTS.todoPatterns;
  const donePatterns = options.donePatterns || TEXT_HELPER_DEFAULTS.donePatterns;
  const todoCanonical = options.todoCanonical || TEXT_HELPER_DEFAULTS.todoCanonical;
  const statuses = options.statuses || buildDefaultTextStatuses();
  function uniqueTextHelperStrings(list) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    (list || []).forEach((v) => {
      const s = String(v || "").trim();
      if (!s) return;
      if (seen.has(s)) return;
      seen.add(s);
      out.push(s);
    });
    return out;
  }
  function escapeRegex3(text) {
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
    const t = escapeRegex3(tagTitle);
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
    while (text[i] === " " || text[i] === "	") i += 1;
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
            kind: "tag"
          };
        }
        const plain = `#${tagTitle}`;
        if (text.startsWith(plain, index) && isBoundaryChar(text[index + plain.length])) {
          return {
            token: plain,
            statusKey,
            start: index,
            end: index + plain.length,
            kind: "tag"
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
    const task = todo ? { ...todo, kind: "todo" } : done ? { ...done, kind: "done" } : null;
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
        hadTaskToken: false
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
      hadTaskToken: true
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
    return parsed.managed || containsAny(s, todoPatterns) || containsAny(s, donePatterns);
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
      body
    });
  }
  function applyStatusToTexts(texts, statusKey) {
    return (Array.isArray(texts) ? texts : []).map(
      (text) => applyStatusToText(text, statusKey)
    );
  }
  function removeStatusFromText(text) {
    const original = String(text || "");
    const parsed = parseManagedPrefix(original);
    if (!parsed.managed || !parsed.hadStatus) return original;
    const taskToken = parsed.taskKind === "done" && parsed.taskToken ? parsed.taskToken : todoCanonical;
    return joinManagedPrefix({
      leading: parsed.leading,
      taskToken,
      statusTag: "",
      body: parsed.body
    });
  }
  function removeSlashCommandFragment(blockString, indexes) {
    let text = String(blockString || "");
    if (!Array.isArray(indexes) || indexes.length !== 2) return text;
    const [start, end] = indexes;
    if (typeof start !== "number" || typeof end !== "number" || start < 0 || end < start || end > text.length) {
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
    removeStatusFromText
  };
}
function uniqueUidStrings(list) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
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
async function resolveTaskStatusTargetUids({
  roamAlphaAPI,
  context = null,
  primaryUid = null,
  fallbackToFocused = true
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
  } catch (_) {
  }
  try {
    const dragSelected = await ui?.multiselect?.getSelected?.();
    const dragUids = uniqueUidStrings(
      (Array.isArray(dragSelected) ? dragSelected : []).map(normalizeTargetUid)
    );
    if (dragUids.length) return dragUids;
  } catch (_) {
  }
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
function isEditableField(element) {
  if (!element) return false;
  const tag = String(element.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (element.isContentEditable) return true;
  const attr = element.getAttribute?.("contenteditable");
  return attr === "" || attr === "true";
}
function resolveChooserDigitAction(event, { activeElement = null, statusActions = [], onRemove = null } = {}) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isEditableField(event.target) || isEditableField(activeElement)) return null;
  const key = event.key;
  if (key === "0") {
    return typeof onRemove === "function" ? onRemove : null;
  }
  if (/^[1-9]$/.test(key)) {
    const index = Number(key) - 1;
    const action = statusActions[index];
    return typeof action === "function" ? action : null;
  }
  return null;
}
function createTaskStatusExtension({
  extensionAPI,
  runtimeVersion = BUNDLED_VERSION,
  lifecycle = null,
  extensionId = null
}) {
  const TOUCH_LISTENER_OPTIONS = { capture: true, passive: false };
  const STATUS_PILL_SELECTOR = [
    'span.rm-page-ref[data-tag^="task-status/"]',
    'a.rm-page-ref[data-tag^="task-status/"]',
    "span.rm-page-ref[data-task-status-key]",
    "a.rm-page-ref[data-task-status-key]"
  ].join(", ");
  const RENDER_SCOPE_SELECTOR = ".rm-block__input, .rm-block-ref";
  const EXTENSION_UI_SELECTOR = ".ts-status-portal, .ts-status-names-panel, .ts-episode-counter, .ts-style-preview, .ts-burst-canvas, .ts-rendered-icon";
  const STATUS_MUTATION_SELECTOR = `${STATUS_PILL_SELECTOR}, .rm-checkbox`;
  const CONFIG = {
    // Active status order. This is replaced by persisted settings during startup.
    cycleOrder: ["ACTIVE", "WAITING", "IN_REVIEW", "HOLDING", "INCUBATING", "ALERT", "CANCELLED", "SERIES", "MOVIE", "WATCHING", "WATCHLIST", "UPCOMING", "REWATCH", "DROPPED"],
    shiftClickRemoves: true,
    debug: false
  };
  const TODO_PATTERNS = ["{{[[TODO]]}}", "{{TODO}}"];
  const DONE_PATTERNS = ["{{[[DONE]]}}", "{{DONE}}"];
  const TODO_CANONICAL = "{{[[TODO]]}}";
  const STATUS_TAG_PREFIX = "task-status/";
  const SETTINGS_KEYS = {
    statusList: "status-list",
    defaultsVersion: "defaults-version",
    statusColorOverrides: "status-color-overrides",
    theme: "task-status-theme",
    checkboxStyle: "task-status-checkbox-style",
    styleNativeCheckboxes: "task-status-style-native-checkboxes",
    statusLabelDisplay: "task-status-label-display",
    alertBeacon: "task-status-alert-beacon",
    statusChangeAnimation: "task-status-change-animation",
    ambientMotion: "task-status-ambient-motion",
    repeatCarryOver: "task-status-repeat-carry-over",
    followUpPrompt: "task-status-follow-up-prompt",
    agentTools: "task-status-agent-tools"
  };
  const STATUS_LABEL_DISPLAY = Object.freeze({
    CHECKBOX_ONLY: "Checkbox only — reveal on intent",
    CHECKBOX_AND_PILL: "Checkbox + status pill"
  });
  const DEFAULT_STATUS_NAMES = {
    ACTIVE: "Active",
    WAITING: "Waiting",
    IN_REVIEW: "In Review",
    HOLDING: "Holding",
    INCUBATING: "Incubating",
    ALERT: "Alert",
    CANCELLED: "Cancelled",
    SERIES: "Series",
    MOVIE: "Movie",
    WATCHING: "Watching",
    WATCHLIST: "Watchlist",
    UPCOMING: "Upcoming",
    REWATCH: "Rewatch",
    DROPPED: "Dropped",
    IMPORTANT: "Important",
    STARRED: "Starred",
    DISCUSS: "Discuss",
    BILLABLE: "Billable",
    BUG: "Bug",
    DRAFT: "Draft",
    DEADLINE: "Deadline",
    KAWAII: "Kawaii",
    FLOWER: "Flower",
    SUN: "Sun",
    MOON: "Moon"
  };
  const DEFAULT_STATUS_LIST = [
    { key: "ACTIVE", name: "Active" },
    { key: "WAITING", name: "Waiting" },
    { key: "IN_REVIEW", name: "In Review" },
    { key: "HOLDING", name: "Holding" },
    { key: "INCUBATING", name: "Incubating" },
    { key: "ALERT", name: "Alert" },
    { key: "CANCELLED", name: "Cancelled" },
    ...MEDIA_STATUS_DEFAULTS.map((entry) => ({ ...entry }))
  ];
  const DEFAULT_STATUS_BASE_COLORS = {
    ACTIVE: "#14b8a6",
    WAITING: "#eab308",
    IN_REVIEW: "#0ea5e9",
    HOLDING: "#94a3b8",
    INCUBATING: "#6366f1",
    ALERT: "#f43f5e",
    CANCELLED: "#1e293b",
    SERIES: "#c026d3",
    MOVIE: "#f97316",
    WATCHING: "#22c55e",
    WATCHLIST: "#ec4899",
    UPCOMING: "#0d87f2",
    REWATCH: "#84cc16",
    DROPPED: "#7c2d12",
    IMPORTANT: "#dc2626",
    STARRED: "#d97706",
    DISCUSS: "#8b5cf6",
    BILLABLE: "#10b981",
    BUG: "#65a30d",
    DRAFT: "#3b82f6",
    DEADLINE: "#ea580c",
    KAWAII: "#f472b6",
    FLOWER: "#e879f9",
    SUN: "#f59e0b",
    MOON: "#818cf8"
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
    { name: "Dark", value: "#1e293b" }
  ];
  let statusColorOverrides = loadObjectSetting(SETTINGS_KEYS.statusColorOverrides, {});
  let themeSetting = loadThemeSetting();
  let checkboxStyleSetting = loadCheckboxStyleSetting();
  let checkboxStylingEnabled = loadBooleanSetting(
    SETTINGS_KEYS.styleNativeCheckboxes,
    true
  );
  let alertBeaconEnabled = loadBooleanSetting(SETTINGS_KEYS.alertBeacon, true);
  let statusChangeAnimationEnabled = loadBooleanSetting(
    SETTINGS_KEYS.statusChangeAnimation,
    true
  );
  let ambientMotionEnabled = loadBooleanSetting(
    SETTINGS_KEYS.ambientMotion,
    true
  );
  const statusPopTracker = createStatusPopTracker({
    windowLike: window,
    lifecycle
  });
  statusPopTracker.setEnabled(statusChangeAnimationEnabled);
  const statusBurstSystem = createStatusBurstSystem({
    documentLike: document,
    windowLike: window,
    lifecycle,
    getStyle: () => checkboxStyleSetting,
    isEnabled: () => statusChangeAnimationEnabled && checkboxStylingEnabled
  });
  let statusLabelDisplay = loadStatusLabelDisplaySetting();
  let repeatCarryOver = loadRepeatCarryOverSetting();
  let followUpPromptEnabled = loadBooleanSetting(SETTINGS_KEYS.followUpPrompt, true);
  let agentToolsEnabled = loadBooleanSetting(SETTINGS_KEYS.agentTools, true);
  let aiToolsManager = null;
  let colorProbeEl = null;
  let statusColorStyleEl = null;
  let portalRoot = null;
  let publicApi = null;
  let publicWriteDepth = 0;
  const stylePreviewListeners = /* @__PURE__ */ new Set();
  function notifyStylePreviewListeners() {
    stylePreviewListeners.forEach((listener) => {
      try {
        listener();
      } catch (_) {
      }
    });
  }
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
    } catch (_) {
    }
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
      const raw = propertyName.startsWith("--") ? styles?.getPropertyValue?.(propertyName) : styles?.[propertyName];
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
    lightSurface = candidates.find((candidate) => relativeLuminance(candidate) >= 0.45) || lightSurface;
    darkSurface = candidates.find((candidate) => relativeLuminance(candidate) < 0.45) || darkSurface;
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
      minimumTextContrast: 4.8
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
      minimumContrast: 3.2
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
      } catch (_) {
      }
    }
    colorProbeEl = null;
    if (statusColorStyleEl?.remove) {
      try {
        statusColorStyleEl.remove();
      } catch (_) {
      }
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
.ts-status-choice-dot[data-task-status-key="${keySelector}"],
.ts-status-choice-glyph[data-task-status-key="${keySelector}"] {
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
  --ts-checkbox-on-accent-light: ${checkboxValues.lightOnAccentCss};
  --ts-checkbox-on-accent-dark: ${checkboxValues.darkOnAccentCss};
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
    const candidate = value && typeof value === "object" ? value.target?.value ?? value.currentTarget?.value ?? value.value : value;
    const normalized = String(candidate || "").trim();
    return Object.values(STATUS_LABEL_DISPLAY).includes(normalized) ? normalized : fallback;
  }
  function loadThemeSetting() {
    const fallback = THEME_SETTING_VALUES.FOLLOW_ROAM;
    if (!extensionAPI?.settings?.get) return fallback;
    const raw = extensionAPI.settings.get(SETTINGS_KEYS.theme);
    if (raw === null || typeof raw === "undefined") {
      saveSetting(SETTINGS_KEYS.theme, fallback);
      return fallback;
    }
    return normalizeThemeSetting(parseMaybeJson(raw), fallback);
  }
  function loadCheckboxStyleSetting() {
    const fallback = CHECKBOX_STYLE_VALUES.OUTLINE;
    if (!extensionAPI?.settings?.get) return fallback;
    const raw = extensionAPI.settings.get(SETTINGS_KEYS.checkboxStyle);
    if (raw === null || typeof raw === "undefined") {
      saveSetting(SETTINGS_KEYS.checkboxStyle, fallback);
      return fallback;
    }
    return normalizeCheckboxStyle(parseMaybeJson(raw), fallback);
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
  function loadRepeatCarryOverSetting() {
    const fallback = parseCarryOverSetting(null);
    if (!extensionAPI?.settings?.get) return fallback;
    const raw = extensionAPI.settings.get(SETTINGS_KEYS.repeatCarryOver);
    if (raw === null || typeof raw === "undefined") {
      saveSetting(
        SETTINGS_KEYS.repeatCarryOver,
        formatCarryOverSetting(DEFAULT_CARRY_OVER_STATUS_NAMES)
      );
      return fallback;
    }
    return parseCarryOverSetting(typeof raw === "string" ? raw : String(raw ?? ""));
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
    const seen = /* @__PURE__ */ new Set();
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
    return String(key || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
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
    const seen = /* @__PURE__ */ new Set();
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
    const storedVersion = parseMaybeJson(extensionAPI?.settings?.get?.(SETTINGS_KEYS.defaultsVersion));
    if (Array.isArray(stored) && stored.length) {
      const normalized = normalizeStatusList(stored);
      if (Number(storedVersion) >= STATUS_DEFAULTS_VERSION) return normalized;
      const migrated = migrateStatusListDefaults(normalized, storedVersion);
      if (migrated !== normalized) saveSetting(SETTINGS_KEYS.statusList, migrated);
      saveSetting(SETTINGS_KEYS.defaultsVersion, STATUS_DEFAULTS_VERSION);
      return migrated;
    }
    const defaults = normalizeStatusList(DEFAULT_STATUS_LIST);
    saveSetting(SETTINGS_KEYS.statusList, defaults);
    saveSetting(SETTINGS_KEYS.defaultsVersion, STATUS_DEFAULTS_VERSION);
    return defaults;
  }
  function generateStatusKey(name) {
    const base = normalizeStatusKey(name).replace(/^CUSTOM_/, "").slice(0, 30) || "STATUS";
    const existing = /* @__PURE__ */ new Set([
      ...statusList.map((entry) => entry.key),
      ...Object.keys(DEFAULT_STATUS_NAMES)
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
        tagTitles: [tagTitle]
      };
    });
    return statuses;
  }
  function buildTagTitleIndex(statuses) {
    const idx = /* @__PURE__ */ new Map();
    Object.entries(statuses || {}).forEach(([statusKey, status]) => {
      (status.tagTitles || []).forEach((t) => idx.set(t, statusKey));
    });
    return idx;
  }
  let statusList = loadStatusList();
  syncCycleOrderFromStatusList();
  let STATUSES = buildStatuses({
    list: statusList
  });
  let statusTagToKey = buildTagTitleIndex(STATUSES);
  function publishStatuses() {
    notifyStylePreviewListeners();
    if (!publicApi || publicWriteDepth > 0) return;
    emitStatusCatalog(publicApi, { apiVersion: 1 });
  }
  function publishChange(blockUid, statusKey) {
    if (!publicApi || publicWriteDepth > 0) return;
    emitStatusChange(publicApi, {
      apiVersion: 1,
      uid: blockUid,
      name: statusKey == null ? null : STATUSES[statusKey]?.name ?? null,
      status: "updated"
    });
  }
  function readStoredStatusList() {
    const stored = parseMaybeJson(extensionAPI?.settings?.get?.(SETTINGS_KEYS.statusList));
    if (Array.isArray(stored) && stored.length) return normalizeStatusList(stored);
    if (statusList.length) return statusList.map((entry) => ({ key: entry.key, name: entry.name }));
    return normalizeStatusList(DEFAULT_STATUS_LIST);
  }
  function readStatusEntries() {
    const list = readStoredStatusList();
    const built = buildStatuses({ list });
    return list.map((entry) => {
      const status = built[entry.key];
      const name = status?.name || entry.name;
      const group = getStatusGroup(entry.key, name);
      return {
        key: entry.key,
        name,
        tag: status?.tagTitle || `${STATUS_TAG_PREFIX}${entry.name}`,
        glyph: getStatusCheckboxShape(entry.key, name),
        group,
        inCycle: group === "task"
      };
    });
  }
  function readStatuses() {
    const entries = readStatusEntries();
    const overrides = loadObjectSetting(SETTINGS_KEYS.statusColorOverrides, {});
    const surfaces = resolveStatusSurfaces();
    return entries.map((entry) => publicStatusRow({
      key: entry.key,
      name: entry.name,
      tag: entry.tag,
      glyph: entry.glyph,
      group: entry.group,
      inCycle: entry.inCycle,
      colors: deriveStatusPillColorValues(entry.key, overrides?.[entry.key], surfaces)
    }));
  }
  function rebuildStatusIndexes() {
    statusList = loadStatusList();
    syncCycleOrderFromStatusList();
    STATUSES = buildStatuses({
      list: statusList
    });
    statusTagToKey = buildTagTitleIndex(STATUSES);
    applyStatusColorOverrides(statusColorOverrides);
    refreshStatusVisuals(document);
    publishStatuses();
  }
  function rebuildStatusIndexesFromMemory() {
    syncCycleOrderFromStatusList();
    STATUSES = buildStatuses({
      list: statusList
    });
    statusTagToKey = buildTagTitleIndex(STATUSES);
    applyStatusColorOverrides(statusColorOverrides);
    refreshStatusVisuals(document);
    publishStatuses();
    repeatStatusReset?.sync();
  }
  function escapeDatalogString(text) {
    return String(text || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
      page: { uid: oldUid, title: newTitle }
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
    statusList = statusList.map(
      (entry) => entry.key === statusKey ? { ...entry, name: desired } : entry
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
  async function addExtraStatuses() {
    const { list: nextList, added } = mergeExtraStatuses(statusList);
    if (!added.length) return { added: [] };
    statusList = nextList;
    await saveSettingAsync(SETTINGS_KEYS.statusList, statusList);
    await unregisterAllCommands();
    rebuildStatusIndexesFromMemory();
    await registerAllCommands();
    return { added };
  }
  async function reorderStatus(statusKey, targetKey, placement = "before") {
    const idx = statusList.findIndex((entry2) => entry2.key === statusKey);
    if (idx === -1) throw new Error(`Unknown status key: ${statusKey}`);
    const targetIdx = statusList.findIndex((entry2) => entry2.key === targetKey);
    if (targetIdx === -1) throw new Error(`Unknown target status key: ${targetKey}`);
    if (statusKey === targetKey) return { changed: false };
    const next = [...statusList];
    const [entry] = next.splice(idx, 1);
    const remainingTargetIdx = next.findIndex((candidate) => candidate.key === targetKey);
    const insertIdx = placement === "after" ? remainingTargetIdx + 1 : remainingTargetIdx;
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
    palette: []
  };
  const pendingOperations = /* @__PURE__ */ new Set();
  let pillObserver = null;
  let themeObserver = null;
  let headObserver = null;
  let themeMediaQuery = null;
  let themeMediaListener = null;
  let themeRefreshFrame = null;
  let themeBootTimeout = null;
  let statusChooserEl = null;
  let statusChooserTeardown = null;
  let statusChooserReturnFocusEl = null;
  let statusChooserAnchorEl = null;
  let followUpPrompt = null;
  let statusPeekController = null;
  let statusView = null;
  let statusViewListeners = [];
  function log() {
  }
  function getTextHelpers() {
    return createTaskStatusTextHelpers({
      statuses: STATUSES,
      cycleOrder: CONFIG.cycleOrder,
      todoPatterns: TODO_PATTERNS,
      donePatterns: DONE_PATTERNS,
      todoCanonical: TODO_CANONICAL
    });
  }
  function statusGroup(statusKey) {
    return getStatusGroup(statusKey, STATUSES[statusKey]?.name);
  }
  function statusIsMedia(statusKey) {
    return isMediaStatus(statusKey, STATUSES[statusKey]?.name);
  }
  function statusIsNonTask(statusKey) {
    return statusGroup(statusKey) !== "task";
  }
  function getStatusGlyph(statusKey) {
    if (!statusKey) return null;
    const group = statusGroup(statusKey);
    if (group !== "media" && group !== "extra") return null;
    return getStatusCheckboxShape(statusKey, STATUSES[statusKey]?.name);
  }
  function getStatusNameMap() {
    const names = {};
    Object.keys(STATUSES || {}).forEach((key) => {
      names[key] = STATUSES[key]?.name;
    });
    return names;
  }
  function setStatusGlyphAttribute(el, statusKey) {
    const glyph = getStatusGlyph(statusKey);
    if (glyph) el.setAttribute("data-ts-status-glyph", glyph);
    else el.removeAttribute("data-ts-status-glyph");
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
      setStatusGlyphAttribute(el, statusKey);
      el.setAttribute("data-task-status-label", getStatusDisplayLabelFromTagTitle(tagTitle));
    } else {
      el.removeAttribute("data-task-status-key");
      el.removeAttribute("data-ts-status-glyph");
      el.removeAttribute("data-task-status-label");
    }
  }
  function elementsIncludingRoot2(root, selector) {
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
    elementsIncludingRoot2(
      root,
      "span.rm-page-ref[data-task-status-key], a.rm-page-ref[data-task-status-key]"
    ).forEach((pill) => {
      clearStatusPillPresentation(pill);
      pill.removeAttribute("data-task-status-key");
      pill.removeAttribute("data-ts-status-glyph");
      pill.removeAttribute("data-task-status-label");
    });
  }
  function refreshStatusVisuals(root = document) {
    const scope = resolveRefreshScope(root);
    if (!scope?.querySelectorAll && !scope?.matches) return;
    clearOwnedStatusPillPresentations(scope);
    clearOwnedStatusCheckboxes(scope);
    const pills = elementsIncludingRoot2(scope, STATUS_PILL_SELECTOR);
    pills.forEach(annotateStatusPillElement);
    if (!checkboxStylingEnabled) {
      episodeCounter.sweep(scope);
      statusPeekController?.refresh?.();
      return;
    }
    const blockStringsByUid = /* @__PURE__ */ new Map();
    const textHelpers = getTextHelpers();
    const keptEpisodeCounters = /* @__PURE__ */ new Set();
    const consumedPopUids = /* @__PURE__ */ new Set();
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
      const presentation = syncStatusPresentationForPill({
        statusPill: pill,
        enabled: checkboxStylingEnabled,
        alertBeaconEnabled,
        hideManagedPill: statusLabelDisplay === STATUS_LABEL_DISPLAY.CHECKBOX_ONLY,
        tagTitle,
        statusTagToKey,
        statusNames: getStatusNameMap(),
        blockUid,
        blockString: blockStringsByUid.get(blockUid),
        textHelpers
      });
      if (presentation?.annotated && presentation.checkbox) {
        if (statusChangeAnimationEnabled && statusPopTracker.hasPendingWrite(blockUid, presentation.statusKey)) {
          if (playStatusChangeEffect(
            presentation.checkbox,
            presentation.statusKey,
            presentation.shape
          )) {
            consumedPopUids.add(blockUid);
          }
        } else if (!checkboxStyleToAttributeValue(checkboxStyleSetting)) {
          statusPopTracker.restorePopAttributeIfActive(
            presentation.checkbox,
            presentation.statusKey
          );
        }
      }
      if (presentation?.managed && EPISODE_GLYPHS.includes(getStatusGlyph(statusKey))) {
        episodeCounter.sync({ pill, uid: blockUid, kept: keptEpisodeCounters });
      }
    });
    consumedPopUids.forEach((uid) => statusPopTracker.consumeWrite(uid));
    episodeCounter.sweep(scope, keptEpisodeCounters);
    statusPeekController?.refresh?.();
  }
  function isStatusPeekEnabled() {
    return checkboxStylingEnabled && statusLabelDisplay === STATUS_LABEL_DISPLAY.CHECKBOX_ONLY;
  }
  function setCheckboxStylingEnabled(nextValue) {
    checkboxStylingEnabled = normalizeBooleanSetting(nextValue, checkboxStylingEnabled);
    if (checkboxStylingEnabled) {
      refreshStatusVisuals(document);
      statusPeekController?.setEnabled?.(isStatusPeekEnabled());
    } else {
      statusPopTracker.clearAll();
      statusBurstSystem.clear();
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
  function setStatusChangeAnimationEnabled(nextValue) {
    statusChangeAnimationEnabled = normalizeBooleanSetting(
      nextValue,
      statusChangeAnimationEnabled
    );
    statusPopTracker.setEnabled(statusChangeAnimationEnabled);
    if (!statusChangeAnimationEnabled) statusBurstSystem.clear();
  }
  function playStatusChangeEffect(checkbox, statusKey, shape = null) {
    if (!statusChangeAnimationEnabled || !checkboxStylingEnabled || !checkbox || !statusKey) {
      return false;
    }
    if (checkboxStyleToAttributeValue(checkboxStyleSetting)) {
      const input = checkbox.querySelector?.('input[type="checkbox"]');
      if (input?.checked === true) return false;
      const color = normalizeCssColorValue(statusColorOverrides?.[statusKey]?.base) || getDefaultStatusColor(statusKey);
      statusBurstSystem.emitForCheckbox(checkbox, {
        shape: shape || getStatusCheckboxShape(statusKey, STATUSES[statusKey]?.name),
        color
      });
      return true;
    }
    return statusPopTracker.triggerPop(checkbox, statusKey);
  }
  function setFollowUpPromptEnabled(nextValue) {
    followUpPromptEnabled = normalizeBooleanSetting(nextValue, followUpPromptEnabled);
  }
  function setAgentToolsEnabled(nextValue) {
    agentToolsEnabled = normalizeBooleanSetting(nextValue, agentToolsEnabled);
    aiToolsManager?.sync(agentToolsEnabled);
  }
  function setRepeatCarryOver(value) {
    const candidate = value && typeof value === "object" ? value.target?.value ?? value.currentTarget?.value ?? value.value : value;
    repeatCarryOver = parseCarryOverSetting(String(candidate ?? ""));
    repeatStatusReset.sync();
  }
  function refreshMutationScopes(mutations) {
    const refreshed = /* @__PURE__ */ new Set();
    const isInsideExtensionUi = (node) => Boolean(
      node?.nodeType === 1 && (node.matches?.(EXTENSION_UI_SELECTOR) || node.closest?.(EXTENSION_UI_SELECTOR))
    );
    const containsStatusVisual = (node) => Boolean(
      node?.nodeType === 1 && !isInsideExtensionUi(node) && (node.matches?.(STATUS_MUTATION_SELECTOR) || node.querySelector?.(STATUS_MUTATION_SELECTOR))
    );
    const refreshOnce = (node) => {
      if (!node) return;
      const scope = resolveRefreshScope(node);
      if (!scope || refreshed.has(scope)) return;
      refreshed.add(scope);
      refreshStatusVisuals(scope);
    };
    const episodeUids = /* @__PURE__ */ new Set();
    const noteEpisodeAttribute = (node, target) => {
      if (!node || isInsideExtensionUi(node) || !episodeCounter.isEpisodeAttributeNode(node)) return;
      const uid = episodeCounter.taskUidForAttributeNode(node, target);
      if (uid) episodeUids.add(uid);
    };
    for (const mutation of mutations || []) {
      if (isInsideExtensionUi(mutation.target)) continue;
      if (mutation.type === "attributes") {
        if (mutation.attributeName === "data-tag" && containsStatusVisual(mutation.target)) {
          refreshOnce(mutation.target);
        }
        continue;
      }
      for (const node of mutation.addedNodes || []) {
        if (containsStatusVisual(node)) refreshOnce(node);
        noteEpisodeAttribute(node, mutation.target);
      }
      for (const node of mutation.removedNodes || []) {
        noteEpisodeAttribute(node, mutation.target);
      }
      const removedStatusVisual = Array.from(mutation.removedNodes || []).some(
        containsStatusVisual
      );
      if (removedStatusVisual) {
        refreshOnce(mutation.target);
      }
    }
    episodeUids.forEach((uid) => episodeCounter.resyncUid(uid));
  }
  function startStatusPillObserver() {
    if (pillObserver) return;
    if (!document?.body) return;
    pillObserver = new MutationObserver((mutations) => refreshMutationScopes(mutations));
    pillObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tag"]
    });
    refreshStatusVisuals(document);
  }
  function stopStatusPillObserver() {
    if (pillObserver) {
      try {
        pillObserver.disconnect();
      } catch (_) {
      }
    }
    pillObserver = null;
    clearOwnedStatusPillPresentations(document);
    clearOwnedStatusCheckboxes(document);
    clearStatusPillAnnotations(document);
  }
  function resolveCurrentTheme() {
    return resolveHostTheme({
      document,
      window,
      preference: themeSettingToPreference(themeSetting)
    });
  }
  function syncDocumentTheme() {
    const next = resolveCurrentTheme();
    const root = document?.documentElement;
    if (root?.getAttribute?.(THEME_ATTRIBUTE) !== next) {
      root?.setAttribute?.(THEME_ATTRIBUTE, next);
      notifyStylePreviewListeners();
    }
    return next;
  }
  function syncDocumentCheckboxStyle() {
    const attrValue = checkboxStyleToAttributeValue(checkboxStyleSetting);
    const root = document?.documentElement;
    if (!root) return attrValue;
    if (attrValue) {
      if (root.getAttribute?.(CHECKBOX_STYLE_ATTRIBUTE) !== attrValue) {
        root.setAttribute?.(CHECKBOX_STYLE_ATTRIBUTE, attrValue);
      }
    } else {
      root.removeAttribute?.(CHECKBOX_STYLE_ATTRIBUTE);
    }
    return attrValue;
  }
  function setCheckboxStyleSetting(nextValue) {
    checkboxStyleSetting = normalizeCheckboxStyle(nextValue, CHECKBOX_STYLE_VALUES.OUTLINE);
    syncDocumentCheckboxStyle();
    notifyStylePreviewListeners();
  }
  function syncDocumentAmbientMotion() {
    const root = document?.documentElement;
    if (!root) return ambientMotionEnabled;
    if (ambientMotionEnabled) {
      if (root.getAttribute?.(AMBIENT_MOTION_ATTRIBUTE) !== "on") {
        root.setAttribute?.(AMBIENT_MOTION_ATTRIBUTE, "on");
      }
    } else {
      root.removeAttribute?.(AMBIENT_MOTION_ATTRIBUTE);
    }
    return ambientMotionEnabled;
  }
  function setAmbientMotionEnabled(nextValue) {
    ambientMotionEnabled = normalizeBooleanSetting(nextValue, ambientMotionEnabled);
    syncDocumentAmbientMotion();
    notifyStylePreviewListeners();
  }
  function setThemeSetting(nextValue) {
    themeSetting = normalizeThemeSetting(nextValue, THEME_SETTING_VALUES.FOLLOW_ROAM);
    syncDocumentTheme();
    notifyStylePreviewListeners();
    scheduleThemeColorRefresh();
  }
  function scheduleThemeColorRefresh() {
    if (themeRefreshFrame != null) return;
    const requestFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));
    themeRefreshFrame = requestFrame(() => {
      themeRefreshFrame = null;
      syncDocumentTheme();
      applyStatusColorOverrides(statusColorOverrides);
      if (statusView?.isOpen()) void statusView.refresh();
    });
  }
  function startThemeObserver() {
    if (themeObserver) return;
    themeObserver = new MutationObserver(() => scheduleThemeColorRefresh());
    [document.documentElement, document.body].filter(Boolean).forEach((target) => {
      themeObserver.observe(target, {
        attributes: true,
        attributeFilter: ["class", "style"]
      });
    });
    if (document?.head) {
      headObserver = new MutationObserver(() => scheduleThemeColorRefresh());
      headObserver.observe(document.head, { childList: true });
    }
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
    const setTimer = window.setTimeout?.bind(window) || setTimeout;
    themeBootTimeout = setTimer(() => {
      themeBootTimeout = null;
      scheduleThemeColorRefresh();
    }, 1500);
  }
  function stopThemeObserver() {
    if (themeObserver) {
      try {
        themeObserver.disconnect();
      } catch (_) {
      }
    }
    themeObserver = null;
    if (headObserver) {
      try {
        headObserver.disconnect();
      } catch (_) {
      }
    }
    headObserver = null;
    if (themeMediaQuery && themeMediaListener) {
      try {
        if (themeMediaQuery.removeEventListener) {
          themeMediaQuery.removeEventListener("change", themeMediaListener);
        } else if (themeMediaQuery.removeListener) {
          themeMediaQuery.removeListener(themeMediaListener);
        }
      } catch (_) {
      }
    }
    themeMediaQuery = null;
    themeMediaListener = null;
    if (themeBootTimeout != null) {
      const clearTimer = window.clearTimeout?.bind(window) || clearTimeout;
      clearTimer(themeBootTimeout);
    }
    themeBootTimeout = null;
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
    } catch (_) {
    }
    return null;
  }
  async function updateBlock(blockUid, newText, { userUid } = {}) {
    const block = { uid: blockUid, string: newText };
    if (typeof userUid === "string" && userUid.trim()) {
      block["user-uid"] = userUid.trim();
    }
    await window.roamAlphaAPI.data.block.update({ block });
  }
  const readBlockStringFresh = createFreshBlockStringReader(window.roamAlphaAPI);
  const readBlockChildStrings = createBlockChildStringsReader(window.roamAlphaAPI);
  const certifiedBlockWriter = createCertifiedBlockStringWriter({
    readFresh: readBlockStringFresh,
    updateBlock,
    getLiveEditorString: getLiveBlockInputValue
  });
  const repeatStatusReset = createRepeatStatusReset({
    roamAlphaAPI: window.roamAlphaAPI,
    windowLike: window,
    getResetTagTitles: () => resetTagTitles(
      statusList.map((entry) => STATUSES[entry.key]?.name || entry.name),
      repeatCarryOver
    ),
    log
  });
  const activityRecorder = createBetterTasksActivityRecorder({ roamAlphaAPI: window.roamAlphaAPI });
  const statusWriteRouter = createBetterTasksStatusRouter({
    windowLike: window,
    directWriter: certifiedBlockWriter,
    activityRecorder,
    readChildStrings: readBlockChildStrings
  });
  const episodeCounter = createEpisodeCounterController({
    document,
    roamAlphaAPI: window.roamAlphaAPI,
    activityRecorder,
    getBlockUid: (element) => getBlockUidFromElement(element),
    onOpenMenu: (context) => openEpisodeMenu(context),
    onChange: () => {
      if (statusView?.isOpen()) void statusView.refresh();
    }
  });
  function getCurrentStatus(text) {
    return getTextHelpers().getCurrentStatus(text);
  }
  function getNextStatus(currentStatus) {
    return nextTaskCycleStatus(CONFIG.cycleOrder, currentStatus, statusIsNonTask);
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
      primaryUid
    });
  }
  async function setBlockStatus(blockUid, statusKey, {
    editorString,
    expectedLiveEditorString,
    userUid,
    requireExistingTask = false,
    requireBetterTasksReady = false
  } = {}) {
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
    const hasEditorHandoff = editorString !== void 0 || expectedLiveEditorString !== void 0;
    if (hasEditorHandoff && (typeof editorString !== "string" || typeof expectedLiveEditorString !== "string")) {
      return { status: "rejected", didWrite: false, reason: "invalid-editor-handoff" };
    }
    const sourceString = hasEditorHandoff ? editorString : expectedString;
    if (requireExistingTask && !getTextHelpers().parseManagedPrefix(sourceString).managed) {
      return { status: "rejected", didWrite: false, reason: "not-a-task", string: expectedString };
    }
    const newText = statusKey === null ? removeStatusFromText(sourceString) : applyStatusToText(sourceString, statusKey);
    if (newText === expectedString) {
      return { status: "unchanged", didWrite: false, reason: "already-current", string: expectedString };
    }
    pendingOperations.add(blockUid);
    try {
      const routerArgs = {
        uid: blockUid,
        expectedString,
        nextString: newText,
        statusTagTitle: statusKey === null ? null : STATUSES[statusKey].tagTitle,
        expectedLiveEditorString,
        editorString
      };
      if (typeof userUid === "string" && userUid.trim()) {
        routerArgs.userUid = userUid.trim();
      }
      if (requireExistingTask) routerArgs.requireExistingTask = true;
      if (requireBetterTasksReady) routerArgs.requireBetterTasksReady = true;
      const outcome = await statusWriteRouter.apply(routerArgs);
      if (!["updated", "unchanged"].includes(outcome?.status)) {
        console.warn("[TaskStatus] Status edit refused", {
          uid: blockUid,
          reason: outcome?.reason || "unknown"
        });
      }
      if (outcome?.status === "updated") {
        if (statusKey !== null && statusChangeAnimationEnabled && checkboxStylingEnabled) {
          statusPopTracker.markWritten(blockUid, statusKey);
          const alreadyRendered = Array.from(
            document.querySelectorAll?.(
              `.rm-checkbox[${CHECKBOX_STATUS_ATTRIBUTE}="${cssStatusKeySelector(statusKey)}"][${CHECKBOX_UID_ATTRIBUTE}="${cssString(blockUid)}"]`
            ) || []
          );
          if (alreadyRendered.length) {
            let played = false;
            alreadyRendered.forEach((checkbox) => {
              if (playStatusChangeEffect(checkbox, statusKey)) played = true;
            });
            if (played) statusPopTracker.consumeWrite(blockUid);
          }
        }
        publishChange(blockUid, statusKey);
        if (statusKey !== null) repeatStatusReset.sync();
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
      if (isDoneTask(blockString)) {
        return { status: "unchanged", didWrite: false, reason: "done-task" };
      }
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
    const blockInput = element.closest?.("[id^='block-input-']") || element.closest?.(".roam-block-container")?.querySelector("[id^='block-input-']");
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
      } catch (_) {
      }
    }
    return getBlockUidFromDomElement(element);
  }
  function getStatusKeyFromElement(target) {
    if (!target) return null;
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
    return target.closest("span.rm-page-ref[data-tag]") || target.closest("a.rm-page-ref[data-tag]") || target.closest("span.rm-page-ref[data-task-status-key]") || target.closest("a.rm-page-ref[data-task-status-key]");
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
    const isManagedStatus = hasManagedStatusTag(blockString, statusKey);
    if (!isManagedStatus) return null;
    const hasTodo = containsAny(blockString, TODO_PATTERNS);
    if (!hasTodo && !isTaskLike(blockString)) return null;
    return {
      statusKey,
      blockUid,
      anchorEl,
      placementAnchorEl: resolveBlockGutterAnchor(anchorEl),
      returnFocusEl: anchorEl
    };
  }
  function resolveStatusPeekContext({ checkbox, input, statusKey }) {
    if (!checkbox || !input || !statusKey || !STATUSES[statusKey]?.active) return null;
    const blockUid = getBlockUidFromDomElement(checkbox);
    if (!blockUid) return null;
    const certifiedUid = checkbox.getAttribute?.(CHECKBOX_UID_ATTRIBUTE);
    if (!certifiedUid || certifiedUid !== blockUid) return null;
    return {
      blockUid,
      statusKey,
      glyph: getStatusGlyph(statusKey),
      label: STATUSES[statusKey].label || statusKey,
      anchorEl: checkbox,
      returnFocusEl: input
    };
  }
  function closeStatusChooser({ restoreFocus = false } = {}) {
    const hadChooser = Boolean(statusChooserEl || statusChooserTeardown);
    const returnFocusEl = statusChooserReturnFocusEl;
    const openPrompt = followUpPrompt;
    followUpPrompt = null;
    if (openPrompt && !openPrompt.decided) {
      try {
        openPrompt.cancel();
      } catch (_) {
      }
    }
    if (statusChooserTeardown) {
      try {
        statusChooserTeardown();
      } catch (_) {
      }
    }
    statusChooserTeardown = null;
    if (statusChooserEl?.remove) {
      try {
        statusChooserEl.remove();
      } catch (_) {
      }
    }
    statusChooserEl = null;
    statusChooserReturnFocusEl = null;
    statusChooserAnchorEl = null;
    if (hadChooser) statusPeekController?.chooserClosed?.();
    if (restoreFocus && returnFocusEl?.isConnected) {
      try {
        returnFocusEl.focus?.({ preventScroll: true });
      } catch (_) {
      }
    }
  }
  function positionStatusChooser(el, anchorEl) {
    if (!el || !anchorEl?.getBoundingClientRect) return;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const arrow = el.querySelector(".bp3-popover-arrow");
    const arrowSvg = arrow?.querySelector("svg");
    el.style.visibility = "hidden";
    el.style.left = "0px";
    el.style.top = "0px";
    window.requestAnimationFrame(() => {
      if (!el.isConnected) return;
      const rect = anchorEl.getBoundingClientRect();
      const chooserRect = el.getBoundingClientRect();
      const placement = computeGutterPopoverPlacement({
        anchorRect: rect,
        floatingRect: chooserRect,
        viewportWidth,
        viewportHeight,
        gap: 8
      });
      el.style.left = `${Math.round(placement.left)}px`;
      el.style.top = `${Math.round(placement.top)}px`;
      el.setAttribute("data-ts-placement", placement.placement);
      el.style.transformOrigin = placement.placement === "left" ? `right ${Math.round(placement.arrowOffset + 15)}px` : `${Math.round(placement.arrowOffset + 15)}px ${placement.arrowSide}`;
      el.classList.toggle("ts-status-chooser-above", placement.placement === "above");
      el.classList.toggle("ts-status-chooser-left", placement.placement === "left");
      if (arrow) {
        arrow.style.left = placement.arrowSide === "right" ? "" : `${Math.round(placement.arrowOffset)}px`;
        arrow.style.right = placement.arrowSide === "right" ? "-11px" : "";
        arrow.style.top = placement.arrowSide === "top" ? "-11px" : placement.arrowSide === "right" ? `${Math.round(placement.arrowOffset)}px` : "";
        arrow.style.bottom = placement.arrowSide === "bottom" ? "-11px" : "";
      }
      if (arrowSvg) arrowSvg.style.transform = `rotate(${placement.arrowRotation}deg)`;
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
  function makeStatusMenuItem({
    label,
    className = "",
    ariaCurrent = false,
    glyphStatusKey = null,
    showEmptyIcon = false,
    shortcutHint = "",
    onChoose
  }) {
    const li = document.createElement("li");
    const item = document.createElement("a");
    item.className = `ts-status-choice bp3-menu-item bp3-popover-dismiss ${className}`.trim();
    item.setAttribute("role", "menuitem");
    item.setAttribute("tabindex", "0");
    if (ariaCurrent) {
      item.setAttribute("aria-current", "true");
      item.classList.add("bp3-active", "bp3-intent-primary");
    }
    if (glyphStatusKey) {
      const glyph = document.createElement("span");
      glyph.className = "ts-status-choice-glyph ts-status-choice-glyph--real";
      glyph.setAttribute("aria-hidden", "true");
      glyph.setAttribute("data-task-status-key", glyphStatusKey);
      setStatusGlyphAttribute(glyph, glyphStatusKey);
      const box = document.createElement("span");
      box.className = "rm-checkbox rm-todo";
      box.setAttribute(CHECKBOX_STATUS_ATTRIBUTE, glyphStatusKey);
      box.setAttribute(
        CHECKBOX_SHAPE_ATTRIBUTE,
        getStatusCheckboxShape(glyphStatusKey, STATUSES[glyphStatusKey]?.name)
      );
      const container = document.createElement("span");
      container.className = "check-container";
      const fakeInput = document.createElement("input");
      fakeInput.setAttribute("type", "checkbox");
      fakeInput.setAttribute("tabindex", "-1");
      fakeInput.setAttribute("aria-hidden", "true");
      const checkmark = document.createElement("span");
      checkmark.className = "checkmark";
      container.append(fakeInput, checkmark);
      box.append(container);
      glyph.append(box);
      item.append(glyph);
    } else if (showEmptyIcon) {
      const emptyWrap = document.createElement("span");
      emptyWrap.className = "ts-status-choice-glyph ts-status-choice-empty-wrap";
      emptyWrap.setAttribute("aria-hidden", "true");
      const emptyBox = document.createElement("span");
      emptyBox.className = "ts-status-choice-empty-icon";
      emptyWrap.append(emptyBox);
      item.append(emptyWrap);
    }
    const text = document.createElement("div");
    text.className = "ts-status-choice-label bp3-fill bp3-text-overflow-ellipsis";
    text.textContent = label;
    item.append(text);
    if (shortcutHint) {
      const hint = document.createElement("span");
      hint.className = "ts-status-choice-shortcut bp3-menu-item-label";
      hint.setAttribute("aria-hidden", "true");
      hint.textContent = shortcutHint;
      item.append(hint);
    }
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
  function makeWatchingNowChoice() {
    return makeStatusMenuItem({
      label: "Watching now…",
      className: "ts-status-choice-view",
      onChoose: () => {
        closeStatusChooser();
        void statusView?.open();
      }
    });
  }
  function isSettingsLinkAvailable() {
    return canOpenExtensionSettings({
      roamAlphaAPI: window.roamAlphaAPI,
      extensionId
    });
  }
  function openOwnExtensionSettings() {
    return openExtensionSettings({
      roamAlphaAPI: window.roamAlphaAPI,
      extensionId
    });
  }
  function makeSettingsChoice() {
    return makeStatusMenuItem({
      label: "Settings…",
      className: "ts-status-choice-settings",
      onChoose: () => {
        closeStatusChooser();
        void openOwnExtensionSettings();
      }
    });
  }
  function makeStatusChoiceButton({
    statusKey,
    currentStatusKey,
    targetUids,
    shortcutHint = ""
  }) {
    const status = STATUSES[statusKey];
    const onChoose = () => {
      if (wantsFollowUpPrompt(statusKey, targetUids)) {
        void chooseStatusWithFollowUp(targetUids[0], statusKey).catch((err) => {
          log("Status chooser follow-up error:", err);
          closeStatusChooser();
        });
        return;
      }
      void setStatusForBlockUids(targetUids, statusKey).catch((err) => log("Status chooser set error:", err)).finally(closeStatusChooser);
    };
    const item = makeStatusMenuItem({
      label: status?.label || statusKey,
      ariaCurrent: statusKey === currentStatusKey,
      glyphStatusKey: statusKey,
      shortcutHint,
      onChoose
    });
    const choice = item.querySelector(".ts-status-choice");
    if (choice) choice.setAttribute("data-task-status-choice", statusKey);
    return { item, onChoose };
  }
  function findBlockGutterAnchor(blockUid) {
    if (!/^[A-Za-z0-9_-]+$/.test(String(blockUid || ""))) return null;
    const blockEl = document.querySelector(
      `[id^="block-input-"][id$="-${blockUid}"], .roam-block[data-uid="${blockUid}"]`
    );
    return blockEl ? resolveBlockGutterAnchor(blockEl) : null;
  }
  function wantsFollowUpPrompt(statusKey, targetUids) {
    return followUpPromptEnabled && isFollowUpStatusKey(statusKey) && Array.isArray(targetUids) && targetUids.length === 1;
  }
  async function chooseStatusWithFollowUp(blockUid, statusKey) {
    const chooser = statusChooserEl;
    const isCurrent = () => chooser && statusChooserEl === chooser && chooser.isConnected;
    const outcome = await setBlockStatus(blockUid, statusKey);
    if (!isCurrent()) return;
    const statusInPlace = outcome?.status === "updated" || outcome?.status === "unchanged" && outcome?.reason === "already-current";
    if (!statusInPlace) {
      closeStatusChooser();
      return;
    }
    const state = await readFollowUpState({ windowLike: window, uid: blockUid });
    if (!isCurrent()) return;
    if (!state.eligible) {
      closeStatusChooser();
      return;
    }
    let writingDate = false;
    const prompt = createFollowUpPrompt({
      document,
      statusLabel: STATUSES[statusKey]?.label || "",
      existingDue: state.existingDue,
      repeats: state.repeats,
      today: /* @__PURE__ */ new Date(),
      onDecision: (decision) => {
        const live = followUpPrompt === prompt && statusChooserEl === chooser;
        if (followUpPrompt === prompt) followUpPrompt = null;
        if (!live) return;
        if (decision.action !== "set") {
          closeStatusChooser({ restoreFocus: true });
          return;
        }
        chooser.setAttribute("aria-busy", "true");
        writingDate = true;
        void writeFollowUpDate({ windowLike: window, uid: blockUid, date: decision.date }).then((written) => {
          if (!["updated", "unchanged"].includes(written?.status)) {
            console.warn("[TaskStatus] Follow-up date not written", {
              uid: blockUid,
              reason: written?.reason || "unknown"
            });
          }
        }).catch((err) => log("Follow-up date error:", err)).finally(() => {
          if (statusChooserEl === chooser) closeStatusChooser({ restoreFocus: true });
        });
      }
    });
    const content = chooser.querySelector(".bp3-popover-content");
    if (!content) {
      closeStatusChooser();
      return;
    }
    content.replaceChildren(prompt.element);
    chooser.classList.add("ts-follow-up-chooser");
    followUpPrompt = prompt;
    const keyGuard = (event) => {
      if (followUpPrompt !== prompt && !(writingDate && statusChooserEl === chooser)) return;
      const target = event.target;
      const unfocused = !target || target === document || target === document.body || target === document.documentElement;
      if (!unfocused && !chooser.contains(target)) return;
      prompt.handleKey(event);
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    };
    const keyEvents = ["keydown", "keypress", "keyup"];
    keyEvents.forEach((type) => window.addEventListener(type, keyGuard, true));
    const previousTeardown = statusChooserTeardown;
    statusChooserTeardown = () => {
      keyEvents.forEach((type) => window.removeEventListener(type, keyGuard, true));
      previousTeardown?.();
    };
    const anchor = statusChooserAnchorEl?.isConnected ? statusChooserAnchorEl : findBlockGutterAnchor(blockUid);
    if (anchor) {
      statusChooserAnchorEl = anchor;
      positionStatusChooser(chooser, anchor);
    }
    window.requestAnimationFrame(() => {
      if (followUpPrompt === prompt) prompt.focusFirst();
    });
  }
  function openEpisodeMenu({ counter, current }) {
    closeStatusChooser();
    const chooser = document.createElement("div");
    chooser.className = "ts-status-chooser ts-episode-chooser bp3-popover";
    const content = document.createElement("div");
    content.className = "bp3-popover-content";
    const menu = createEpisodeMenu({
      document,
      current,
      onDecision: (decision) => {
        if (statusChooserEl !== chooser) return;
        closeStatusChooser({ restoreFocus: true });
        if (decision.action === "cancel") return;
        void episodeCounter.applyDecision({ counter, decision }).catch(
          (err) => log("Episode counter error:", err)
        );
      }
    });
    content.append(menu.element);
    chooser.append(makeBlueprintPopoverArrow(), content);
    (portalRoot || document.body).appendChild(chooser);
    statusChooserEl = chooser;
    statusChooserReturnFocusEl = counter;
    statusChooserAnchorEl = counter;
    positionStatusChooser(chooser, counter);
    const closeOnOutsideMouseDown = (event) => {
      if (statusChooserEl?.contains(event.target)) return;
      closeStatusChooser();
    };
    const keyGuard = (event) => {
      if (statusChooserEl !== chooser) return;
      const target = event.target;
      const unfocused = !target || target === document || target === document.body || target === document.documentElement;
      if (!unfocused && !chooser.contains(target)) return;
      menu.handleKey(event);
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    };
    const closeOnViewportChange = () => closeStatusChooser();
    const keyEvents = ["keydown", "keypress", "keyup"];
    document.addEventListener("mousedown", closeOnOutsideMouseDown, true);
    keyEvents.forEach((type) => window.addEventListener(type, keyGuard, true));
    window.addEventListener("resize", closeOnViewportChange, true);
    window.addEventListener("scroll", closeOnViewportChange, true);
    statusChooserTeardown = () => {
      document.removeEventListener("mousedown", closeOnOutsideMouseDown, true);
      keyEvents.forEach((type) => window.removeEventListener(type, keyGuard, true));
      window.removeEventListener("resize", closeOnViewportChange, true);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
    window.requestAnimationFrame(() => {
      if (statusChooserEl === chooser) menu.focusFirst();
    });
  }
  async function openStatusChooser({
    blockUid,
    statusKey,
    anchorEl,
    placementAnchorEl = null,
    returnFocusEl = null,
    isIntentCurrent = null
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
    const activeKeys = CONFIG.cycleOrder.filter((key) => STATUSES[key]?.active);
    const displayedStatusActions = [];
    const appendChoices = (keys) => keys.forEach((key) => {
      const index = displayedStatusActions.length;
      const shortcutHint = index < 9 ? String(index + 1) : "";
      const { item, onChoose } = makeStatusChoiceButton({
        statusKey: key,
        currentStatusKey: statusKey,
        targetUids,
        shortcutHint
      });
      displayedStatusActions.push(onChoose);
      choices.append(item);
    });
    const taskKeys = activeKeys.filter((key) => statusGroup(key) === "task");
    const mediaKeys = activeKeys.filter((key) => statusGroup(key) === "media");
    const extraKeys = activeKeys.filter((key) => statusGroup(key) === "extra");
    let hasPriorGroup = false;
    for (const groupKeys of [taskKeys, mediaKeys, extraKeys]) {
      if (!groupKeys.length) continue;
      if (hasPriorGroup) {
        const divider = document.createElement("li");
        divider.className = "bp3-menu-divider ts-status-choice-divider";
        divider.setAttribute("role", "separator");
        choices.append(divider);
      }
      const heading = document.createElement("li");
      heading.className = "ts-status-choice-heading";
      heading.setAttribute("role", "presentation");
      heading.textContent = groupKeys === taskKeys ? "Task status" : groupKeys === mediaKeys ? "Media" : "Extra";
      choices.append(heading);
      appendChoices(groupKeys);
      hasPriorGroup = true;
    }
    const removeAction = () => {
      void setStatusForBlockUids(targetUids, null).catch((err) => log("Status chooser remove error:", err)).finally(closeStatusChooser);
    };
    choices.append(
      makeStatusMenuItem({
        label: "Remove status",
        className: "ts-status-choice-remove",
        showEmptyIcon: true,
        shortcutHint: "0",
        onChoose: removeAction
      })
    );
    const viewDivider = document.createElement("li");
    viewDivider.className = "bp3-menu-divider ts-status-choice-divider";
    viewDivider.setAttribute("role", "separator");
    choices.append(viewDivider, makeWatchingNowChoice());
    if (isSettingsLinkAvailable()) {
      choices.append(makeSettingsChoice());
    }
    const footer = document.createElement("li");
    footer.className = "ts-status-choice-footer";
    footer.setAttribute("role", "presentation");
    const maxDigit = Math.min(9, displayedStatusActions.length);
    const digitHint = maxDigit > 1 ? `1–${maxDigit} pick · ` : maxDigit === 1 ? "1 pick · " : "";
    footer.textContent = `${digitHint}0 clear · Esc close`;
    choices.append(footer);
    content.append(choices);
    chooser.append(makeBlueprintPopoverArrow(), content);
    (portalRoot || document.body).appendChild(chooser);
    statusChooserEl = chooser;
    statusChooserReturnFocusEl = returnFocusEl || anchorEl || null;
    statusChooserAnchorEl = placementAnchorEl || resolveBlockGutterAnchor(anchorEl) || anchorEl;
    positionStatusChooser(chooser, statusChooserAnchorEl);
    chooser.querySelector(".ts-status-choice[aria-current='true']")?.focus?.({
      preventScroll: true
    });
    const closeOnOutsideMouseDown = (event) => {
      if (statusChooserEl?.contains(event.target)) return;
      closeStatusChooser();
    };
    const handleChooserKeyEvent = (event) => {
      if (statusChooserEl !== chooser || followUpPrompt) return;
      if (event.type === "keydown") {
        if (event.key === "Escape") {
          stopRoamNavigation(event);
          closeStatusChooser({ restoreFocus: true });
          return;
        }
        const digitAction2 = resolveChooserDigitAction(event, {
          activeElement: document.activeElement,
          statusActions: displayedStatusActions,
          onRemove: removeAction
        });
        if (digitAction2) {
          stopRoamNavigation(event);
          digitAction2();
        }
        return;
      }
      const digitAction = resolveChooserDigitAction(event, {
        activeElement: document.activeElement,
        statusActions: displayedStatusActions,
        onRemove: removeAction
      });
      if (digitAction) stopRoamNavigation(event);
    };
    const closeOnViewportChange = () => closeStatusChooser();
    const chooserKeyEvents = ["keydown", "keypress", "keyup"];
    document.addEventListener("mousedown", closeOnOutsideMouseDown, true);
    chooserKeyEvents.forEach((type) => window.addEventListener(type, handleChooserKeyEvent, true));
    window.addEventListener("resize", closeOnViewportChange, true);
    window.addEventListener("scroll", closeOnViewportChange, true);
    statusChooserTeardown = () => {
      document.removeEventListener("mousedown", closeOnOutsideMouseDown, true);
      chooserKeyEvents.forEach(
        (type) => window.removeEventListener(type, handleChooserKeyEvent, true)
      );
      window.removeEventListener("resize", closeOnViewportChange, true);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
    return true;
  }
  function handleStatusMouseDown(event) {
    if (typeof event.button === "number" && event.button !== 0) return;
    const ctx = getStatusEventContext(event);
    if (!ctx) return;
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
          const liveEditorString = getLiveBlockInputValue(blockUid);
          let blockString = liveEditorString ?? getBlockString(blockUid);
          if (blockString === null) return;
          blockString = getTextHelpers().removeSlashCommandFragment(blockString, indexes);
          await setBlockStatus(blockUid, statusKey, {
            editorString: liveEditorString === null ? void 0 : blockString,
            expectedLiveEditorString: liveEditorString === null ? void 0 : liveEditorString
          });
        })().catch((err) => log("Slash command error:", err));
        return null;
      }
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
      }
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
      }
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
        }
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
        }
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
          }
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
        }
      });
      if (isThenable(res)) await res;
    } catch (err) {
      log("Failed to add palette command:", removeLabel, err);
    }
    registeredCommands.palette.push({ label: removeLabel, api });
    const viewLabel = "Task Status: Watching now";
    try {
      const res = api.addCommand({
        label: viewLabel,
        "disable-hotkey": false,
        callback: () => statusView?.toggle()
      });
      if (isThenable(res)) await res;
    } catch (err) {
      log("Failed to add palette command:", viewLabel, err);
    }
    registeredCommands.palette.push({ label: viewLabel, api });
    if (isSettingsLinkAvailable()) {
      const settingsLabel = "Task Status: Open settings";
      try {
        const res = api.addCommand({
          label: settingsLabel,
          "disable-hotkey": false,
          callback: () => {
            void openOwnExtensionSettings();
          }
        });
        if (isThenable(res)) await res;
      } catch (err) {
        log("Failed to add palette command:", settingsLabel, err);
      }
      registeredCommands.palette.push({ label: settingsLabel, api });
    }
    if (msApi?.addCommand) {
      try {
        msApi.addCommand({
          label: removeLabel,
          callback: async (context) => {
            await setStatusForTargets(null, null, context);
          }
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
      } catch (_) {
      }
    }
    registeredCommands.contextMenu.forEach((label) => {
      try {
        window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label });
      } catch (_) {
      }
    });
    registeredCommands.msContextMenu.forEach((entry) => {
      try {
        entry.api.removeCommand({ label: entry.label });
      } catch (_) {
      }
    });
    for (const entry of registeredCommands.palette) {
      try {
        const res = entry.api.removeCommand({ label: entry.label });
        if (isThenable(res)) await res;
      } catch (_) {
      }
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
        return React?.createElement ? React.createElement(
          "div",
          { className: "bp3-text-small" },
          "React not available."
        ) : null;
      }
      const rootRef = React.useRef(null);
      React.useEffect(() => {
        try {
          const root = rootRef.current;
          if (!root?.closest) return;
          const formGroup = root.closest(".bp3-form-group") || root.closest(".bp4-form-group") || root.closest(".bp5-form-group") || root.parentElement;
          if (!formGroup?.querySelector) return;
          const label = formGroup.querySelector("label.bp3-label") || formGroup.querySelector(".bp3-label") || formGroup.querySelector("label.bp4-label") || formGroup.querySelector(".bp4-label") || formGroup.querySelector("label.bp5-label") || formGroup.querySelector(".bp5-label");
          const labelWidth = label ? label.getBoundingClientRect().width : 0;
          if (label) label.style.display = "none";
          const content = formGroup.querySelector(".bp3-form-content") || formGroup.querySelector(".bp4-form-content") || formGroup.querySelector(".bp5-form-content");
          if (content) {
            content.style.marginLeft = "0";
            content.style.width = "100%";
          }
          if (labelWidth > 0) {
            root.style.position = "relative";
            root.style.left = `-${Math.round(labelWidth)}px`;
            root.style.width = `calc(100% + ${Math.round(labelWidth)}px)`;
          }
        } catch (_) {
        }
      }, []);
      const readStatusRows = () => statusList.map((entry) => ({
        key: entry.key,
        name: STATUSES?.[entry.key]?.name ?? entry.name
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
      const [savedByKey, setSavedByKey] = React.useState(
        () => rowsToNameMap(statusRows)
      );
      const [draftByKey, setDraftByKey] = React.useState(
        () => rowsToNameMap(statusRows)
      );
      const [workingKey, setWorkingKey] = React.useState(null);
      const [errorByKey, setErrorByKey] = React.useState({});
      const [infoByKey, setInfoByKey] = React.useState({});
      const [newStatusName, setNewStatusName] = React.useState("");
      const [newStatusError, setNewStatusError] = React.useState(null);
      const [newStatusInfo, setNewStatusInfo] = React.useState(null);
      const [extraStatusError, setExtraStatusError] = React.useState(null);
      const [extraStatusInfo, setExtraStatusInfo] = React.useState(null);
      const [openStatusMenuKey, setOpenStatusMenuKey] = React.useState(null);
      const [dragState, setDragState] = React.useState({
        key: null,
        targetKey: null,
        placement: null
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
            [k]: renameExisting ? "Renamed tag page." : "Updated name."
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
      const addExtraStatusesFromPanel = async () => {
        setExtraStatusError(null);
        setExtraStatusInfo(null);
        setWorkingKey("__EXTRA__");
        try {
          const result4 = await addExtraStatuses();
          refreshStatusRows();
          if (result4.added.length > 0) {
            setExtraStatusInfo(
              result4.added.length === 1 ? "Added 1 status" : `Added ${result4.added.length} statuses`
            );
          } else {
            setExtraStatusInfo("All eleven are already in your list");
          }
        } catch (e) {
          setExtraStatusError(e?.message || String(e));
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
        } catch (_) {
        }
      };
      const onStatusDragOver = (event, k) => {
        const draggedKey = dragState.key;
        if (!draggedKey || draggedKey === k || workingKey) return;
        event.preventDefault();
        try {
          event.dataTransfer.dropEffect = "move";
        } catch (_) {
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const placement = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
        if (dragState.targetKey !== k || dragState.placement !== placement) {
          setDragState((prev) => ({ ...prev, targetKey: k, placement }));
        }
      };
      const onStatusDrop = (event, targetKey) => {
        event.preventDefault();
        const draggedKey = dragState.key || (() => {
          try {
            return event.dataTransfer.getData("text/plain");
          } catch (_) {
            return null;
          }
        })();
        const placement = dragState.targetKey === targetKey && dragState.placement ? dragState.placement : "before";
        void reorderStatusRow(draggedKey, targetKey, placement);
      };
      const onStatusDragEnd = () => {
        setDragState({ key: null, targetKey: null, placement: null });
      };
      const normalizeColorEntry = (entry) => {
        return {
          base: normalizeCssColorValue(entry?.base),
          text: normalizeCssColorValue(entry?.text)
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
          [k]: { ...prev[k] || {}, ...patch || {} }
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
          const nextOverrides = { ...current || {} };
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
          publishStatuses();
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
          publishStatuses();
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
      const rgbToHex2 = (rgb) => {
        const r = clamp8(rgb?.r);
        const g = clamp8(rgb?.g);
        const b = clamp8(rgb?.b);
        const to2 = (x) => x.toString(16).padStart(2, "0");
        return `#${to2(r)}${to2(g)}${to2(b)}`;
      };
      const colorToHex = (value, fallback) => {
        const rgb = parseCssColorToRgb(value) || parseCssColorToRgb(fallback);
        return rgb ? rgbToHex2(rgb) : "#000000";
      };
      const makeRowMenuButton = ({ label, icon, disabled, intent, onClick }) => React.createElement(
        "li",
        null,
        React.createElement(
          "button",
          {
            type: "button",
            className: `bp3-menu-item ${icon ? `bp3-icon-${icon}` : ""} ${intent ? `bp3-intent-${intent}` : ""}`.trim(),
            disabled: Boolean(disabled),
            role: "menuitem",
            onClick
          },
          React.createElement("div", { className: "bp3-fill" }, label)
        )
      );
      const renderStatusRowMenu = (k, label) => React.createElement(
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
            setOpenStatusMenuKey((prev) => prev === k ? null : k);
          }
        }),
        openStatusMenuKey === k ? React.createElement(
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
                onClick: () => void deleteStatusRow(k)
              })
            )
          )
        ) : null
      );
      const setColorDraftValue = (k, channel2, value) => {
        clearColorMessages(k);
        setDraftColors(k, { [channel2]: value });
      };
      const renderColorPopover = ({
        k,
        channel: channel2,
        label,
        draftValue,
        hexValue,
        fallbackValue,
        disabled
      }) => {
        const popoverKey = `${k}:${channel2}`;
        const isText = channel2 === "text";
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
                setOpenColorPopover((prev) => prev === popoverKey ? null : popoverKey);
              }
            },
            React.createElement("span", {
              className: "ts-status-color-swatch-dot",
              style: { backgroundColor: hexValue }
            }),
            React.createElement(
              "span",
              { className: "ts-status-color-swatch-label" },
              label
            )
          ),
          isOpen ? React.createElement(
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
                  ...STATUS_COLOR_PRESETS.map(
                    (preset) => React.createElement("button", {
                      key: preset.value,
                      type: "button",
                      className: "ts-status-color-preset",
                      style: { backgroundColor: preset.value },
                      title: preset.name,
                      "aria-label": `Use ${preset.name}`,
                      onClick: () => setColorDraftValue(k, channel2, preset.value)
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
                    onChange: (e) => setColorDraftValue(k, channel2, e.target.value),
                    "aria-label": `${label} native color picker`
                  }),
                  React.createElement("input", {
                    className: "bp3-input bp3-small ts-status-color-input",
                    value: draftValue,
                    disabled,
                    placeholder: isText ? "Optional text color" : fallbackValue || "#14b8a6",
                    onChange: (e) => setColorDraftValue(k, channel2, e.target.value),
                    "aria-label": `${label} color value`
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
                      onClick: () => setColorDraftValue(k, channel2, "")
                    },
                    isText ? "Clear Text" : "Clear Base"
                  )
                )
              )
            )
          ) : null
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
        const validation = dirty ? validateColorEntry({ base: draftBase, text: draftText }) : null;
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
          "--ts-status-border-dark": previewValues.darkBorderCss
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
          previewStyle
        };
      };
      const renderInlineColorControls = (k, state) => React.createElement(
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
            disabled: state.isWorking
          }),
          renderColorPopover({
            k,
            channel: "text",
            label: "Text",
            draftValue: state.draftText,
            hexValue: state.textHex,
            fallbackValue: state.baseSwatchSource || "#000000",
            disabled: state.isWorking
          })
        ),
        state.dirty ? React.createElement(
          "div",
          { className: "bp3-button-group ts-status-inline-color-actions" },
          React.createElement(
            "button",
            {
              type: "button",
              className: "bp3-button bp3-small bp3-intent-primary bp3-icon-tick ts-status-color-commit-button",
              disabled: state.isWorking || Boolean(state.validation),
              title: "Apply color changes",
              "aria-label": "Apply color changes",
              onClick: () => applyColors(k, {
                base: state.draftBase,
                text: state.draftText
              })
            }
          ),
          React.createElement(
            "button",
            {
              type: "button",
              className: "bp3-button bp3-small bp3-minimal bp3-icon-cross ts-status-color-commit-button",
              disabled: state.isWorking,
              title: "Revert color changes",
              "aria-label": "Revert color changes",
              onClick: () => {
                clearColorMessages(k);
                setDraftColorsByKey((prev) => ({
                  ...prev,
                  [k]: { base: state.savedBase, text: state.savedText }
                }));
              }
            }
          )
        ) : state.hasSavedOverride ? React.createElement(
          "button",
          {
            type: "button",
            className: "bp3-button bp3-small bp3-minimal ts-status-inline-color-actions",
            disabled: state.isWorking,
            onClick: () => applyColors(k, { base: "", text: "" })
          },
          "Clear"
        ) : null,
        state.isWorking && workingColorKey === k ? React.createElement(
          "span",
          { className: "bp3-text-small", style: { opacity: 0.7 } },
          "Working..."
        ) : null
      );
      const addStatusRow = React.createElement(
        "div",
        { className: "ts-status-add-row", key: "add-status" },
        React.createElement(
          "div",
          { className: "ts-status-row-main" },
          React.createElement("span", {
            className: "ts-status-add-spacer",
            "aria-hidden": "true"
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
            "aria-label": "New status name"
          }),
          React.createElement(
            "button",
            {
              type: "button",
              className: "bp3-button bp3-small bp3-intent-primary",
              disabled: Boolean(workingKey) || !normalizeStatusName(newStatusName),
              onClick: () => addStatusFromDraft()
            },
            "Add Status"
          ),
          newStatusError ? React.createElement(
            "span",
            { className: "bp3-text-small ts-status-row-error" },
            newStatusError
          ) : null,
          !newStatusError && newStatusInfo ? React.createElement(
            "span",
            { className: "bp3-text-small ts-status-row-info" },
            newStatusInfo
          ) : null
        )
      );
      const addMoreStatusesRow = React.createElement(
        "div",
        { className: "ts-status-add-row ts-status-extra-row", key: "add-more-statuses" },
        React.createElement(
          "div",
          { className: "ts-status-row-main" },
          React.createElement("span", {
            className: "ts-status-add-spacer",
            "aria-hidden": "true"
          }),
          React.createElement(
            "button",
            {
              type: "button",
              className: "bp3-button bp3-small",
              disabled: Boolean(workingKey),
              onClick: () => void addExtraStatusesFromPanel()
            },
            "Add more statuses"
          ),
          extraStatusError ? React.createElement(
            "span",
            { className: "bp3-text-small ts-status-row-error" },
            extraStatusError
          ) : null,
          !extraStatusError && extraStatusInfo ? React.createElement(
            "span",
            { className: "bp3-text-small ts-status-row-info" },
            extraStatusInfo
          ) : null
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
                  onClick: () => resetAllColors()
                },
                "Reset colors"
              ),
              colorErrorByKey["__ALL__"] ? React.createElement(
                "span",
                { className: "bp3-text-small ts-status-colors-toolbar-error" },
                colorErrorByKey["__ALL__"]
              ) : null,
              !colorErrorByKey["__ALL__"] && colorInfoByKey["__ALL__"] ? React.createElement(
                "span",
                { className: "bp3-text-small ts-status-colors-toolbar-info" },
                colorInfoByKey["__ALL__"]
              ) : null
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
              const prompt = showPrompt ? React.createElement(
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
                      onClick: () => apply(k, true)
                    },
                    "Yes"
                  ),
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      className: "bp3-button bp3-small",
                      onClick: () => apply(k, false)
                    },
                    "No"
                  )
                )
              ) : null;
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
                dragState.targetKey === k && dragState.placement ? `ts-status-row-drop-${dragState.placement}` : ""
              ].filter(Boolean).join(" ");
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
                        placement: null
                      }));
                    }
                  }
                },
                React.createElement(
                  "div",
                  { className: "ts-status-row-main" },
                  React.createElement("button", {
                    type: "button",
                    className: "bp3-button bp3-small bp3-minimal bp3-icon-drag-handle-vertical ts-status-drag-handle",
                    disabled: Boolean(workingKey),
                    draggable: !workingKey,
                    title: `Drag ${rowLabel} to reorder`,
                    "aria-label": `Drag ${rowLabel} to reorder`,
                    onDragStart: (event) => onStatusDragStart(event, k),
                    onDragEnd: onStatusDragEnd
                  }),
                  React.createElement("input", {
                    className: "bp3-input bp3-small ts-status-name-input",
                    value: draft,
                    disabled: Boolean(workingKey),
                    onChange: (e) => {
                      clearMessages(k);
                      setDraft(k, e.target.value);
                    },
                    "aria-label": `Status name for ${k}`
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
                        "data-ts-status-glyph": getStatusGlyph(k) || void 0,
                        style: colorState.previewStyle
                      },
                      draft || rowLabel
                    )
                  ),
                  renderInlineColorControls(k, colorState),
                  renderStatusRowMenu(k, rowLabel),
                  prompt,
                  workingKey === k ? React.createElement(
                    "span",
                    { className: "bp3-text-small", style: { opacity: 0.7 } },
                    "Working..."
                  ) : null
                ),
                rowError ? React.createElement(
                  "div",
                  { className: "bp3-text-small ts-status-row-error" },
                  rowError
                ) : null,
                !rowError && rowInfo ? React.createElement(
                  "div",
                  { className: "bp3-text-small ts-status-row-info" },
                  rowInfo
                ) : null
              );
              return [row];
            }),
            addStatusRow,
            addMoreStatusesRow
          )
        )
      );
    };
    const STYLE_PREVIEW_PREFERRED_KEYS = [
      "ACTIVE",
      "WAITING",
      "IN_REVIEW",
      "HOLDING",
      "ALERT",
      "WATCHING"
    ];
    const getStylePreviewSamples = () => {
      const activeKeys = CONFIG.cycleOrder.filter((key) => STATUSES[key]?.active);
      const picked = [];
      for (const key of STYLE_PREVIEW_PREFERRED_KEYS) {
        if (STATUSES[key]?.active && !picked.includes(key)) picked.push(key);
      }
      for (const key of activeKeys) {
        if (picked.length >= 6) break;
        if (!picked.includes(key)) picked.push(key);
      }
      return picked.slice(0, 6).map((key) => ({
        key,
        label: STATUSES[key]?.label || STATUSES[key]?.name || key,
        shape: getStatusCheckboxShape(key, STATUSES[key]?.name)
      }));
    };
    const CheckboxStylePreview = () => {
      if (!React?.createElement) return null;
      const readSnapshot = () => ({
        style: checkboxStyleSetting,
        theme: resolveCurrentTheme(),
        ambientMotion: ambientMotionEnabled,
        samples: getStylePreviewSamples()
      });
      const [snapshot, setSnapshot] = React.useState ? React.useState(readSnapshot) : [readSnapshot(), () => {
      }];
      if (React.useEffect) {
        React.useEffect(() => {
          const update = () => setSnapshot(readSnapshot());
          stylePreviewListeners.add(update);
          update();
          return () => {
            stylePreviewListeners.delete(update);
          };
        }, []);
      }
      return React.createElement(
        "div",
        {
          className: "ts-style-preview",
          "data-ts-preview-style": snapshot.style,
          "data-ts-preview-theme": snapshot.theme,
          "data-ts-preview-ambient": snapshot.ambientMotion ? "on" : "off",
          "aria-label": `Checkbox style preview (${snapshot.style}, ${snapshot.theme})`
        },
        snapshot.samples.map(
          (sample) => React.createElement(
            "span",
            { className: "ts-style-preview-item", key: sample.key },
            React.createElement(
              "span",
              {
                className: "rm-checkbox rm-todo",
                [CHECKBOX_STATUS_ATTRIBUTE]: sample.key,
                [CHECKBOX_SHAPE_ATTRIBUTE]: sample.shape
              },
              React.createElement(
                "label",
                { className: "check-container" },
                React.createElement("input", {
                  type: "checkbox",
                  checked: false,
                  readOnly: true,
                  tabIndex: -1,
                  "aria-hidden": "true"
                }),
                React.createElement("span", { className: "checkmark" })
              )
            ),
            React.createElement(
              "span",
              { className: "ts-style-preview-label" },
              sample.label
            )
          )
        )
      );
    };
    const AboutRow = () => {
      if (!React?.createElement) return null;
      return React.createElement(
        "div",
        { className: "ts-status-about" },
        React.createElement("span", null, `Task Status Tags v${runtimeVersion}`),
        React.createElement(
          "a",
          {
            href: "https://github.com/Svyk/Roam-Task-Status-Tags#readme",
            target: "_blank",
            rel: "noopener noreferrer"
          },
          "README on GitHub"
        )
      );
    };
    const panelConfig = {
      tabTitle: "Task Status Tags",
      settings: [
        {
          id: SETTINGS_KEYS.theme,
          name: "Theme",
          description: "Match your Roam theme automatically, or pick Light or Dark colors. Applies right away.",
          action: {
            type: "select",
            items: Object.values(THEME_SETTING_VALUES),
            onChange: (value) => setThemeSetting(value)
          }
        },
        {
          id: SETTINGS_KEYS.checkboxStyle,
          name: "Checkbox style",
          description: "Choose how unchecked task checkboxes look: Outline, Glass, Solid, or Minimal. Checked tasks stay with your Roam theme.",
          action: {
            type: "select",
            items: Object.values(CHECKBOX_STYLE_VALUES),
            onChange: (value) => setCheckboxStyleSetting(value)
          }
        },
        {
          id: "task-status-style-preview",
          name: "Style preview",
          description: "Live preview of the chosen checkbox style and theme.",
          action: {
            type: "reactComponent",
            component: CheckboxStylePreview
          }
        },
        {
          id: SETTINGS_KEYS.styleNativeCheckboxes,
          name: "Style native checkboxes by task status",
          description: "Adds a color-and-shape marker to the native TODO/DONE checkbox. This is cosmetic and never changes completion or Better Tasks data.",
          action: {
            type: "switch",
            onChange: (value) => setCheckboxStylingEnabled(value)
          }
        },
        {
          id: SETTINGS_KEYS.statusLabelDisplay,
          name: "Status label display",
          description: "Checkbox-only hides the rendered status pill once the checkbox is styled, and reveals it on hover or focus. Checkbox + status pill keeps the pill visible.",
          action: {
            type: "select",
            items: Object.values(STATUS_LABEL_DISPLAY),
            onChange: (value) => setStatusLabelDisplay(value)
          }
        },
        {
          id: SETTINGS_KEYS.alertBeacon,
          name: "Animate Alert status",
          description: "Adds a brief two-beat halo to unchecked Alert tasks, then stays quiet. This is cosmetic, writes no task data, and stays still for reduced-motion, forced-colors, and print.",
          action: {
            type: "switch",
            onChange: (value) => setAlertBeaconEnabled(value)
          }
        },
        {
          id: SETTINGS_KEYS.statusChangeAnimation,
          name: "Animate status changes",
          description: "Plays a particle burst (Glass, Solid, Minimal) or short pop (Outline) when you set or change a task status. Purely cosmetic, writes no task data, and stays still for reduced-motion, forced-colors, and print.",
          action: {
            type: "switch",
            onChange: (value) => setStatusChangeAnimationEnabled(value)
          }
        },
        {
          id: SETTINGS_KEYS.ambientMotion,
          name: "Animate status icons",
          description: "Adds subtle looping motion to unchecked status icons in Glass, Solid, and Minimal styles. Purely cosmetic, writes no task data, and stays still for reduced-motion, forced-colors, and print.",
          action: {
            type: "switch",
            onChange: (value) => setAmbientMotionEnabled(value)
          }
        },
        {
          id: SETTINGS_KEYS.followUpPrompt,
          name: "Ask for a follow-up date on Waiting / In Review",
          description: "Asks when to check back after you pick Waiting or In Review in the chooser, and sets the task's due date in place. Needs Better Tasks.",
          action: {
            type: "switch",
            onChange: (value) => setFollowUpPromptEnabled(value)
          }
        },
        {
          id: SETTINGS_KEYS.agentTools,
          name: "Let AI agents read and set statuses",
          description: "Offers read and status-change tools to AI agents connected to this graph; writes go through the same checks as the chooser.",
          action: {
            type: "switch",
            onChange: (value) => setAgentToolsEnabled(value)
          }
        },
        {
          id: SETTINGS_KEYS.repeatCarryOver,
          name: "Statuses kept on the next repeat",
          description: "Comma-separated status names kept on the next occurrence of a repeating task; every other status is cleared. Needs Better Tasks.",
          action: {
            type: "input",
            placeholder: "Series, Movie, ...",
            onChange: (value) => setRepeatCarryOver(value)
          }
        },
        {
          id: "task-status-status-names",
          name: "",
          description: "",
          action: { type: "reactComponent", component: StatusNamesPanel }
        },
        {
          id: "task-status-about",
          name: "About",
          description: "",
          action: { type: "reactComponent", component: AboutRow }
        }
      ]
    };
    await extensionAPI.settings.panel.create(panelConfig);
  }
  async function init(isActive = () => true) {
    syncDocumentTheme();
    syncDocumentCheckboxStyle();
    syncDocumentAmbientMotion();
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
      onError: (error) => log("Status peek error:", error)
    });
    statusPeekController.start();
    statusPeekController.setEnabled(isStatusPeekEnabled());
    statusView = createStatusView({
      document,
      window,
      roamAlphaAPI: window.roamAlphaAPI,
      portalRoot,
      getTheme: () => resolveCurrentTheme(),
      readGroups: () => ({
        statuses: CONFIG.cycleOrder.filter((key) => STATUSES[key]?.active).map((key) => ({
          key,
          name: STATUSES[key].name,
          tagTitle: STATUSES[key].tagTitle,
          glyph: getStatusGlyph(key),
          media: statusIsMedia(key)
        })),
        helpers: getTextHelpers()
      }),
      log
    });
    const refreshStatusView = () => {
      if (statusView?.isOpen()) void statusView.refresh();
    };
    statusViewListeners = ["change", "statuses"].map((type) => [type, refreshStatusView]);
    statusViewListeners.forEach(([type, handler]) => publicApi.addEventListener(type, handler));
    clearStatusColorOverrides();
    applyStatusColorOverrides(statusColorOverrides);
    if (!isActive()) return false;
    startThemeObserver();
    await registerAllCommands();
    if (!isActive()) {
      await cleanup();
      return false;
    }
    aiToolsManager = createAiToolsManager({
      extensionAPI,
      api: publicApi,
      setStatusForAgent: async (uid, name, { userUid } = {}) => {
        let catalog;
        try {
          catalog = readStatusEntries();
        } catch {
          return { status: "unknown", didWrite: false, reason: "status-list-unreadable" };
        }
        const resolved = resolveStatusKey(name, catalog);
        if (!resolved.ok) {
          return { status: "rejected", didWrite: false, reason: resolved.reason };
        }
        let outcome;
        try {
          outcome = await setBlockStatus(uid, resolved.key, {
            userUid,
            requireExistingTask: true,
            requireBetterTasksReady: true
          });
        } catch {
          return { status: "unknown", didWrite: false, reason: "set-status-failed" };
        }
        return mapPublicResult(outcome);
      }
    });
    aiToolsManager.sync(agentToolsEnabled);
    repeatStatusReset.sync();
    startStatusPillObserver();
    window.addEventListener("mousedown", handleStatusMouseDown, true);
    window.addEventListener("touchstart", handleStatusTouchStart, TOUCH_LISTENER_OPTIONS);
    window.addEventListener("click", handleStatusClick, true);
    return true;
  }
  async function cleanup() {
    clearOwnedStatusPillPresentations(document);
    closeStatusChooser();
    statusPeekController?.destroy?.();
    statusPeekController = null;
    statusViewListeners.forEach(([type, handler]) => publicApi.removeEventListener(type, handler));
    statusViewListeners = [];
    statusView?.dispose();
    statusView = null;
    stopStatusPillObserver();
    statusPopTracker.dispose();
    statusBurstSystem.dispose();
    episodeCounter.destroyAll(document);
    stopThemeObserver();
    document?.documentElement?.removeAttribute?.(THEME_ATTRIBUTE);
    document?.documentElement?.removeAttribute?.(CHECKBOX_STYLE_ATTRIBUTE);
    document?.documentElement?.removeAttribute?.(AMBIENT_MOTION_ATTRIBUTE);
    repeatStatusReset.dispose();
    clearStatusColorOverrides();
    clearRenderedIcons(publicApi);
    aiToolsManager?.dispose();
    aiToolsManager = null;
    if (portalRoot?.remove) portalRoot.remove();
    portalRoot = null;
    window.removeEventListener("mousedown", handleStatusMouseDown, true);
    window.removeEventListener("touchstart", handleStatusTouchStart, TOUCH_LISTENER_OPTIONS);
    window.removeEventListener("click", handleStatusClick, true);
    stylePreviewListeners.clear();
    pendingOperations.clear();
    await unregisterAllCommands();
  }
  publicApi = createPublicApi({
    readCatalog: readStatusEntries,
    readStatuses,
    createTextHelpers: (options) => createTaskStatusTextHelpers({
      ...options,
      todoPatterns: TODO_PATTERNS,
      donePatterns: DONE_PATTERNS,
      todoCanonical: TODO_CANONICAL
    }),
    setBlockStatus: async (uid, statusKey) => {
      publicWriteDepth += 1;
      try {
        return await setBlockStatus(uid, statusKey);
      } finally {
        publicWriteDepth -= 1;
      }
    },
    cycleBlockStatus: async (uid) => {
      publicWriteDepth += 1;
      try {
        return await cycleBlockStatus(uid);
      } finally {
        publicWriteDepth -= 1;
      }
    },
    readBlockString: readBlockStringFresh,
    queryTasks: ({ statuses, helpers, includeDone }) => queryStatusTasks({
      roamAlphaAPI: window.roamAlphaAPI,
      statuses,
      helpers,
      includeDone,
      includeEpisodes: false
    }),
    documentLike: document
  });
  return { init, cleanup, publicApi };
}
var activeLifecycle = null;
async function onload({ extensionAPI, extension }) {
  if (!extensionAPI) throw new TypeError("Roam did not provide extensionAPI");
  if (activeLifecycle) await activeLifecycle.dispose();
  const previousRuntime = window[GLOBAL_KEY];
  if (previousRuntime && typeof previousRuntime.dispose === "function") {
    await previousRuntime.dispose();
  }
  const lifecycle = createLifecycle();
  const runtimeVersion = resolveTaskStatusRuntimeVersion(extension?.version);
  const extensionId = typeof extension?.id === "string" && extension.id.trim() ? extension.id.trim() : null;
  const instance = createTaskStatusExtension({
    extensionAPI,
    runtimeVersion,
    lifecycle,
    extensionId
  });
  const runtime = Object.freeze({
    version: runtimeVersion,
    dispose: () => lifecycle.dispose()
  });
  activeLifecycle = lifecycle;
  window[GLOBAL_KEY] = runtime;
  installPublicApi(instance.publicApi, { win: window });
  lifecycle.add(() => uninstallPublicApi(instance.publicApi, { win: window }));
  lifecycle.add(async () => {
    await instance.cleanup();
    if (window[GLOBAL_KEY] === runtime) delete window[GLOBAL_KEY];
    if (activeLifecycle === lifecycle) activeLifecycle = null;
  });
  try {
    await instance.init(
      () => window[GLOBAL_KEY] === runtime && !lifecycle.disposed
    );
  } catch (error) {
    await lifecycle.dispose().catch((cleanupError) => console.error(cleanupError));
    throw error;
  }
  return () => lifecycle.dispose();
}
async function onunload() {
  const lifecycle = activeLifecycle;
  activeLifecycle = null;
  if (lifecycle) await lifecycle.dispose();
}
var extension_default = { onload, onunload };
export {
  EXTRA_STATUS_DEFAULTS,
  MEDIA_STATUS_DEFAULTS,
  STATUS_DEFAULTS_VERSION,
  createTaskStatusTextHelpers,
  extension_default as default,
  isEditableField,
  mergeExtraStatuses,
  migrateStatusListDefaults,
  nextTaskCycleStatus,
  onload,
  onunload,
  resolveChooserDigitAction,
  resolveTaskStatusRuntimeVersion,
  resolveTaskStatusTargetUids
};
