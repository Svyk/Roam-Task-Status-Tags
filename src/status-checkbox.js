export const CHECKBOX_STATUS_ATTRIBUTE = "data-ts-checkbox-status";
export const CHECKBOX_SHAPE_ATTRIBUTE = "data-ts-checkbox-shape";
export const OWNED_CHECKBOX_SELECTOR = `.rm-checkbox[${CHECKBOX_STATUS_ATTRIBUTE}]`;

const DEFAULT_LIGHT_SURFACE = Object.freeze({ r: 245, g: 248, b: 250 });
const DEFAULT_DARK_SURFACE = Object.freeze({ r: 32, g: 43, b: 51 });
const BLACK = Object.freeze({ r: 0, g: 0, b: 0 });
const WHITE = Object.freeze({ r: 255, g: 255, b: 255 });

const BUILTIN_SHAPES = Object.freeze({
  ACTIVE: "active",
  WAITING: "waiting",
  HOLDING: "holding",
  INCUBATING: "incubating",
  ALERT: "alert",
  CANCELLED: "cancelled",
});

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

  return Object.freeze({
    base: roundedRgb(base),
    lightSurface: roundedRgb(lightSurface),
    darkSurface: roundedRgb(darkSurface),
    lightAccent: roundedRgb(lightAccent),
    darkAccent: roundedRgb(darkAccent),
    lightAccentCss: rgbCss(lightAccent),
    darkAccentCss: rgbCss(darkAccent),
    lightWashCss: rgbaCss(base, 0.09),
    darkWashCss: rgbaCss(base, 0.16),
  });
}

export function getStatusCheckboxShape(statusKey) {
  const key = String(statusKey || "").trim().toUpperCase();
  return BUILTIN_SHAPES[key] || "custom";
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
    shape: getStatusCheckboxShape(statusKey),
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
}

export function applyStatusCheckboxAnnotation(checkbox, decision) {
  if (!checkbox?.setAttribute || !decision?.statusKey) {
    clearStatusCheckboxAnnotation(checkbox);
    return false;
  }

  checkbox.setAttribute(CHECKBOX_STATUS_ATTRIBUTE, decision.statusKey);
  checkbox.setAttribute(
    CHECKBOX_SHAPE_ATTRIBUTE,
    decision.shape || getStatusCheckboxShape(decision.statusKey)
  );
  return true;
}

export function syncStatusCheckboxForPill({
  statusPill,
  enabled = true,
  tagTitle,
  statusTagToKey,
  blockString,
  textHelpers,
} = {}) {
  const checkbox = findSiblingTaskCheckbox(statusPill);
  if (!checkbox) return Object.freeze({ annotated: false, reason: "missing-exact-checkbox" });

  clearStatusCheckboxAnnotation(checkbox);
  const decision = decideStatusCheckboxAnnotation({
    enabled,
    tagTitle,
    statusTagToKey,
    blockString,
    textHelpers,
  });
  if (!decision) return Object.freeze({ annotated: false, reason: "not-managed" });

  applyStatusCheckboxAnnotation(checkbox, decision);
  return Object.freeze({
    annotated: true,
    checkbox,
    statusKey: decision.statusKey,
    shape: decision.shape,
  });
}

function includingRoot(root, selector) {
  const nodes = [];
  if (root?.matches?.(selector)) nodes.push(root);
  if (root?.querySelectorAll) nodes.push(...root.querySelectorAll(selector));
  return nodes;
}

export function clearOwnedStatusCheckboxes(root) {
  const checkboxes = includingRoot(root, OWNED_CHECKBOX_SELECTOR);
  checkboxes.forEach(clearStatusCheckboxAnnotation);
  return checkboxes.length;
}
