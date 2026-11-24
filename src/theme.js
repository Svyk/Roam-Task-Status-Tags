export const THEME_ATTRIBUTE = "data-ts-theme";

export const THEME_SETTING_VALUES = Object.freeze({
  FOLLOW_ROAM: "Follow Roam",
  LIGHT: "Light",
  DARK: "Dark",
});

export function normalizeThemeSetting(value, fallback = THEME_SETTING_VALUES.FOLLOW_ROAM) {
  const candidate =
    value && typeof value === "object"
      ? value.target?.value ?? value.currentTarget?.value ?? value.value
      : value;
  const normalized = String(candidate || "").trim();
  return Object.values(THEME_SETTING_VALUES).includes(normalized)
    ? normalized
    : fallback;
}

export function themeSettingToPreference(value) {
  const normalized = normalizeThemeSetting(value);
  if (normalized === THEME_SETTING_VALUES.LIGHT) return "light";
  if (normalized === THEME_SETTING_VALUES.DARK) return "dark";
  return null;
}

function hasClass(el, name) {
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
  const channel = (v) => {
    const c = Math.min(255, Math.max(0, v)) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
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

export function resolveHostTheme({
  document: documentLike,
  window: windowLike,
  preference,
} = {}) {
  const pref = typeof preference === "string" ? preference.trim().toLowerCase() : "";
  if (pref === "light" || pref === "dark") return pref;

  const html = documentLike?.documentElement;
  const body = documentLike?.body;

  if (
    hasClass(html, "bp3-dark") ||
    hasClass(body, "bt-theme-dark") ||
    hasClass(html, "rm-dark-theme") ||
    hasClass(body, "rm-dark-theme") ||
    (hasClass(body, "roam-body") && hasClass(body, "dark"))
  ) {
    return "dark";
  }

  if (hasClass(html, "bp3-light") || hasClass(body, "bt-theme-light")) {
    return "light";
  }

  const bodyColor = readMeasuredBackground(body, windowLike);
  if (bodyColor) return luminance(bodyColor) < 0.4 ? "dark" : "light";

  const htmlColor = readMeasuredBackground(html, windowLike);
  if (htmlColor) return luminance(htmlColor) < 0.4 ? "dark" : "light";

  try {
    const query = windowLike?.matchMedia?.("(prefers-color-scheme: dark)");
    if (query?.matches) return "dark";
  } catch (_) {}

  return "light";
}
