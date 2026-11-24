export const CHECKBOX_STATUS_ATTRIBUTE = "data-ts-checkbox-status";
export const CHECKBOX_SHAPE_ATTRIBUTE = "data-ts-checkbox-shape";
export const CHECKBOX_UID_ATTRIBUTE = "data-ts-checkbox-block-uid";
export const CHECKBOX_STYLE_ATTRIBUTE = "data-ts-checkbox-style";
export const AMBIENT_MOTION_ATTRIBUTE = "data-ts-ambient-motion";
export const ALERT_BEACON_ATTRIBUTE = "data-ts-alert-beacon";
export const STATUS_POP_ATTRIBUTE = "data-ts-status-pop";
export const STATUS_POP_RECENT_WINDOW_MS = 2000;
export const STATUS_POP_DURATION_MS = 520;
export const OWNED_CHECKBOX_SELECTOR = `.rm-checkbox[${CHECKBOX_STATUS_ATTRIBUTE}]`;
export const MANAGED_STATUS_PILL_ATTRIBUTE = "data-ts-managed-status-pill";
export const HIDDEN_STATUS_PILL_ATTRIBUTE = "data-ts-status-pill-hidden";
export const OWNED_STATUS_PILL_SELECTOR = `[${MANAGED_STATUS_PILL_ATTRIBUTE}]`;

export const CHECKBOX_STYLE_VALUES = Object.freeze({
  OUTLINE: "Outline",
  GLASS: "Glass",
  SOLID: "Solid",
  MINIMAL: "Minimal",
});

export function normalizeCheckboxStyle(value, fallback = CHECKBOX_STYLE_VALUES.OUTLINE) {
  const candidate =
    value && typeof value === "object"
      ? value.target?.value ?? value.currentTarget?.value ?? value.value
      : value;
  const normalized = String(candidate || "").trim();
  return Object.values(CHECKBOX_STYLE_VALUES).includes(normalized)
    ? normalized
    : fallback;
}

export function checkboxStyleToAttributeValue(value) {
  const normalized = normalizeCheckboxStyle(value);
  if (normalized === CHECKBOX_STYLE_VALUES.GLASS) return "glass";
  if (normalized === CHECKBOX_STYLE_VALUES.SOLID) return "solid";
  if (normalized === CHECKBOX_STYLE_VALUES.MINIMAL) return "minimal";
  return null;
}

const DEFAULT_LIGHT_SURFACE = Object.freeze({ r: 245, g: 248, b: 250 });
const DEFAULT_DARK_SURFACE = Object.freeze({ r: 32, g: 43, b: 51 });
const BLACK = Object.freeze({ r: 0, g: 0, b: 0 });
const NEAR_BLACK = Object.freeze({ r: 16, g: 22, b: 26 });
const WHITE = Object.freeze({ r: 255, g: 255, b: 255 });
const NEAR_BLACK_CSS = "#10161a";
const WHITE_CSS = "#ffffff";

const BUILTIN_SHAPES = Object.freeze({
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
  MOON: "moon",
});

export const MEDIA_STATUS_SHAPES = Object.freeze({
  series: "series",
  movie: "movie",
  watching: "watching",
  watchlist: "watchlist",
  upcoming: "upcoming",
  rewatch: "rewatch",
  dropped: "dropped",
});

export const EXTRA_STATUS_SHAPES = Object.freeze({
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
  moon: "moon",
});

export function getMediaStatusShape(name) {
  const key = String(name ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(MEDIA_STATUS_SHAPES, key)
    ? MEDIA_STATUS_SHAPES[key]
    : null;
}

export function getExtraStatusShape(name) {
  const key = String(name ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(EXTRA_STATUS_SHAPES, key)
    ? EXTRA_STATUS_SHAPES[key]
    : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function channel(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 255) : 0;
}

export function normalizeRgb(value, fallback = BLACK) {
  if (!value || typeof value !== "object") return { ...fallback };
  return {
    r: channel(value.r),
    g: channel(value.g),
    b: channel(value.b),
  };
}

function linearizedChannel(value) {
  const normalized = channel(value) / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb) {
  const value = normalizeRgb(rgb);
  return (
    0.2126 * linearizedChannel(value.r) +
    0.7152 * linearizedChannel(value.g) +
    0.0722 * linearizedChannel(value.b)
  );
}

export function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function mixRgb(from, to, amount) {
  const start = normalizeRgb(from);
  const end = normalizeRgb(to);
  const ratio = clamp(Number(amount) || 0, 0, 1);
  return {
    r: start.r + (end.r - start.r) * ratio,
    g: start.g + (end.g - start.g) * ratio,
    b: start.b + (end.b - start.b) * ratio,
  };
}

export function compositeRgb(foreground, background, alpha) {
  const front = normalizeRgb(foreground);
  const back = normalizeRgb(background);
  const opacity = clamp(Number(alpha) || 0, 0, 1);
  return {
    r: front.r * opacity + back.r * (1 - opacity),
    g: front.g * opacity + back.g * (1 - opacity),
    b: front.b * opacity + back.b * (1 - opacity),
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
    color: mixRgb(base, target, high),
  };
}

export function deriveAccessibleAccent(baseRgb, surfaceRgb, minimumContrast = 3.2) {
  const base = normalizeRgb(baseRgb);
  const surface = normalizeRgb(surfaceRgb, DEFAULT_LIGHT_SURFACE);
  const required = Math.max(1, Number(minimumContrast) || 3.2);
  if (contrastRatio(base, surface) >= required) return base;

  const candidates = [
    nearestPassingMix(base, surface, BLACK, required),
    nearestPassingMix(base, surface, WHITE, required),
  ].filter(Boolean);

  candidates.sort((a, b) => a.amount - b.amount);
  return candidates[0]?.color || (relativeLuminance(surface) > 0.5 ? { ...BLACK } : { ...WHITE });
}

function roundedRgb(rgb) {
  const value = normalizeRgb(rgb);
  return {
    r: Math.round(value.r),
    g: Math.round(value.g),
    b: Math.round(value.b),
  };
}

export function rgbCss(rgb) {
  const value = roundedRgb(rgb);
  return `rgb(${value.r}, ${value.g}, ${value.b})`;
}

export function rgbaCss(rgb, alpha) {
  const value = roundedRgb(rgb);
  const opacity = clamp(Number(alpha) || 0, 0, 1);
  return `rgba(${value.r}, ${value.g}, ${value.b}, ${opacity})`;
}

export function pickOnAccentColor(accentRgb) {
  const accent = normalizeRgb(accentRgb);
  const whiteContrast = contrastRatio(WHITE, accent);
  const darkContrast = contrastRatio(NEAR_BLACK, accent);
  if (whiteContrast >= 3.4) return WHITE_CSS;
  return whiteContrast >= darkContrast ? WHITE_CSS : NEAR_BLACK_CSS;
}

export function buildStatusCheckboxColors({
  baseRgb,
  lightSurfaceRgb = DEFAULT_LIGHT_SURFACE,
  darkSurfaceRgb = DEFAULT_DARK_SURFACE,
  minimumContrast = 3.2,
} = {}) {
  const base = normalizeRgb(baseRgb, { r: 100, g: 116, b: 139 });
  const lightSurface = normalizeRgb(lightSurfaceRgb, DEFAULT_LIGHT_SURFACE);
  const darkSurface = normalizeRgb(darkSurfaceRgb, DEFAULT_DARK_SURFACE);
  // Derive with a small numerical margin so integer CSS serialization still
  // certifies at or above the public threshold after channel rounding.
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
    darkBeaconCss: rgbaCss(roundedDarkAccent, 0.68),
  });
}

export function buildStatusPillColors({
  baseRgb,
  preferredTextRgb,
  lightSurfaceRgb = DEFAULT_LIGHT_SURFACE,
  darkSurfaceRgb = DEFAULT_DARK_SURFACE,
  minimumTextContrast = 4.8,
  lightBackgroundAlpha = 0.1,
  darkBackgroundAlpha = 0.2,
} = {}) {
  const base = normalizeRgb(baseRgb, { r: 100, g: 116, b: 139 });
  const preferredText = normalizeRgb(preferredTextRgb, base);
  const lightSurface = normalizeRgb(lightSurfaceRgb, DEFAULT_LIGHT_SURFACE);
  const darkSurface = normalizeRgb(darkSurfaceRgb, DEFAULT_DARK_SURFACE);
  const lightBackground = compositeRgb(base, lightSurface, lightBackgroundAlpha);
  const darkBackground = compositeRgb(base, darkSurface, darkBackgroundAlpha);
  // The extra margin keeps rounded integer CSS values above the small-text
  // contrast target instead of landing a few thousandths below it.
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
    darkBorderCss: rgbaCss(darkBorder, 0.62),
  });
}

export function getStatusCheckboxShape(statusKey, statusName) {
  const key = String(statusKey || "").trim().toUpperCase();
  return (
    BUILTIN_SHAPES[key] ||
    getMediaStatusShape(statusName) ||
    getExtraStatusShape(statusName) ||
    "custom"
  );
}

export function getStatusGroup(statusKey, statusName) {
  const shape = getStatusCheckboxShape(statusKey, statusName);
  if (Object.values(MEDIA_STATUS_SHAPES).includes(shape)) return "media";
  if (Object.values(EXTRA_STATUS_SHAPES).includes(shape)) return "extra";
  return "task";
}

export function isMediaStatus(statusKey, statusName) {
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

export function decideStatusCheckboxAnnotation({
  enabled = true,
  tagTitle,
  statusTagToKey,
  statusNames,
  blockString,
  textHelpers,
} = {}) {
  if (!enabled || typeof blockString !== "string" || !textHelpers?.parseManagedPrefix) {
    return null;
  }

  const statusKey = lookupStatusKey(statusTagToKey, tagTitle);
  if (!statusKey) return null;

  const parsed = textHelpers.parseManagedPrefix(blockString);
  if (
    !parsed?.managed ||
    !parsed?.hadStatus ||
    parsed.currentStatus !== statusKey ||
    (parsed.taskKind !== "todo" && parsed.taskKind !== "done")
  ) {
    return null;
  }

  return Object.freeze({
    statusKey,
    shape: getStatusCheckboxShape(statusKey, lookupStatusName(statusNames, statusKey)),
  });
}

function hasClass(element, className) {
  return Boolean(element?.classList?.contains?.(className));
}

export function findSiblingTaskCheckbox(statusPill) {
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

export function clearStatusCheckboxAnnotation(checkbox) {
  if (!checkbox?.removeAttribute) return;
  checkbox.removeAttribute(CHECKBOX_STATUS_ATTRIBUTE);
  checkbox.removeAttribute(CHECKBOX_SHAPE_ATTRIBUTE);
  checkbox.removeAttribute(CHECKBOX_UID_ATTRIBUTE);
  checkbox.removeAttribute(ALERT_BEACON_ATTRIBUTE);
  checkbox.removeAttribute(STATUS_POP_ATTRIBUTE);
}

export function applyStatusCheckboxAnnotation(checkbox, decision, blockUid = null) {
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

export function syncStatusCheckboxForPill({
  statusPill,
  enabled = true,
  tagTitle,
  statusTagToKey,
  statusNames,
  blockString,
  blockUid,
  textHelpers,
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
    textHelpers,
  });
  if (!decision) return Object.freeze({ annotated: false, reason: "not-managed" });

  applyStatusCheckboxAnnotation(checkbox, decision, blockUid);
  return Object.freeze({
    annotated: true,
    checkbox,
    statusKey: decision.statusKey,
    shape: decision.shape,
  });
}

export function clearStatusPillPresentation(statusPill) {
  if (!statusPill?.removeAttribute) return;
  statusPill.removeAttribute(MANAGED_STATUS_PILL_ATTRIBUTE);
  statusPill.removeAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE);
  statusPill.removeAttribute(ALERT_BEACON_ATTRIBUTE);
}

export function applyManagedStatusPillPresentation(statusPill, { hidden = false } = {}) {
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

export function countExactStatusTagOccurrences(blockString, tagTitle) {
  if (typeof blockString !== "string" || !tagTitle) return 0;
  const title = escapeRegex(tagTitle);
  const matcher = new RegExp(
    `#\\[\\[${title}\\]\\]|#${title}(?=$|\\s|[\\.,;:!\\?\\)\\]\\}])`,
    "g"
  );
  return Array.from(blockString.matchAll(matcher)).length;
}

/**
 * Certify that this DOM node represents the first exact occurrence of the
 * managed prefix tag, rather than a duplicate reference later in prose.
 * Count disagreement is treated as a partial/ambiguous render and fails visible.
 */
export function isExactManagedStatusPill({
  statusPill,
  tagTitle,
  blockString,
} = {}) {
  const parent = statusPill?.parentElement;
  if (!parent || statusPill.getAttribute?.("data-tag") !== tagTitle) return false;

  const checkbox = findSiblingTaskCheckbox(statusPill);
  if (!checkbox) return false;
  const children = Array.from(parent.children || []);
  if (children.indexOf(checkbox) >= children.indexOf(statusPill)) return false;

  const renderedMatches = children.filter(
    (child) =>
      child?.classList?.contains?.("rm-page-ref") &&
      child.getAttribute?.("data-tag") === tagTitle
  );
  const textOccurrences = countExactStatusTagOccurrences(blockString, tagTitle);
  return (
    renderedMatches.length > 0 &&
    renderedMatches.length === textOccurrences &&
    renderedMatches[0] === statusPill
  );
}

/**
 * Synchronize the checkbox and its exact rendered status page-reference as one
 * presentation unit. The page-reference is always made visible before any
 * ownership decision, then hidden only after the native checkbox was
 * positively identified and annotated for the same managed prefix.
 */
export function syncStatusPresentationForPill({
  statusPill,
  hideManagedPill = false,
  alertBeaconEnabled = false,
  ...checkboxOptions
} = {}) {
  clearStatusPillPresentation(statusPill);
  if (!findSiblingTaskCheckbox(statusPill)) {
    return Object.freeze({ annotated: false, reason: "missing-exact-checkbox" });
  }
  if (
    !isExactManagedStatusPill({
      statusPill,
      tagTitle: checkboxOptions.tagTitle,
      blockString: checkboxOptions.blockString,
    })
  ) {
    return Object.freeze({
      annotated: false,
      managed: false,
      hidden: false,
      reason: "not-exact-managed-pill",
    });
  }

  const checkboxResult = syncStatusCheckboxForPill({
    statusPill,
    ...checkboxOptions,
  });
  if (!checkboxResult.annotated) return checkboxResult;

  applyManagedStatusPillPresentation(statusPill, { hidden: hideManagedPill });
  const input = checkboxResult.checkbox?.querySelector?.('input[type="checkbox"]');
  const shouldBeacon =
    Boolean(alertBeaconEnabled) &&
    checkboxResult.statusKey === "ALERT" &&
    input?.checked === false;
  if (shouldBeacon) {
    checkboxResult.checkbox.setAttribute(ALERT_BEACON_ATTRIBUTE, "true");
    statusPill.setAttribute(ALERT_BEACON_ATTRIBUTE, "true");
  }
  return Object.freeze({
    ...checkboxResult,
    managed: true,
    hidden: Boolean(hideManagedPill),
    alertBeacon: shouldBeacon,
  });
}

function includingRoot(root, selector) {
  const nodes = [];
  if (root?.matches?.(selector)) nodes.push(root);
  if (root?.querySelectorAll) nodes.push(...root.querySelectorAll(selector));
  return nodes;
}

export function clearOwnedStatusCheckboxes(root) {
  const checkboxes = includingRoot(root, OWNED_CHECKBOX_SELECTOR).filter(
    (checkbox) => !checkbox.closest?.(".ts-style-preview")
  );
  checkboxes.forEach(clearStatusCheckboxAnnotation);
  return checkboxes.length;
}

export function clearOwnedStatusPillPresentations(root) {
  const statusPills = includingRoot(root, OWNED_STATUS_PILL_SELECTOR);
  statusPills.forEach(clearStatusPillPresentation);
  return statusPills.length;
}

export function createStatusPopTracker({
  windowLike = typeof window !== "undefined" ? window : globalThis,
  lifecycle = null,
  recentWindowMs = STATUS_POP_RECENT_WINDOW_MS,
  popDurationMs = STATUS_POP_DURATION_MS,
} = {}) {
  const recentWrites = new Map();
  const activePops = new Map();
  let enabled = true;
  let disposed = false;

  const setTimer = (fn, delay) =>
    (windowLike?.setTimeout || globalThis.setTimeout)(fn, delay);
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
        } catch (_) {}
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
      if (
        event?.animationName &&
        !String(event.animationName).startsWith("ts-status-pop-")
      ) {
        return;
      }
      finish();
    };
    const timerId = setTimer(finish, popDurationMs);
    activePops.set(checkbox, { timerId, statusKey, onAnimationEnd });
    try {
      checkbox.addEventListener?.("animationend", onAnimationEnd);
    } catch (_) {}
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
    dispose,
  };
}
