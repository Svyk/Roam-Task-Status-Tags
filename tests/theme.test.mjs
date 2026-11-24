import assert from "node:assert/strict";
import test from "node:test";

import {
  THEME_ATTRIBUTE,
  THEME_SETTING_VALUES,
  normalizeThemeSetting,
  resolveHostTheme,
  themeSettingToPreference,
} from "../src/theme.js";

function env({
  htmlClasses = [],
  bodyClasses = [],
  bodyBackground = null,
  htmlBackground = null,
  osDark = null,
} = {}) {
  const html = { classList: { contains: (name) => htmlClasses.includes(name) } };
  const body = { classList: { contains: (name) => bodyClasses.includes(name) } };
  return {
    document: { documentElement: html, body },
    window: {
      getComputedStyle: (el) => {
        if (el === body) return { backgroundColor: bodyBackground };
        if (el === html) return { backgroundColor: htmlBackground };
        return { backgroundColor: "" };
      },
      ...(osDark == null
        ? {}
        : { matchMedia: () => ({ matches: Boolean(osDark) }) }),
    },
  };
}

test("explicit preference beats bp3-dark, bp3-light, background, and OS hint", () => {
  assert.equal(THEME_ATTRIBUTE, "data-ts-theme");
  assert.equal(
    resolveHostTheme({
      ...env({ htmlClasses: ["bp3-dark"], bodyBackground: "rgb(16, 22, 26)", osDark: true }),
      preference: "light",
    }),
    "light"
  );
  assert.equal(
    resolveHostTheme({
      ...env({ htmlClasses: ["bp3-light"], bodyBackground: "rgb(255, 255, 255)", osDark: false }),
      preference: "dark",
    }),
    "dark"
  );
  assert.equal(
    resolveHostTheme({
      ...env({ htmlClasses: ["bp3-dark"] }),
      preference: "unknown",
    }),
    "dark"
  );
});

test("host dark markers take precedence over light markers, body background, and OS hint", () => {
  assert.equal(
    resolveHostTheme(env({ htmlClasses: ["bp3-dark", "bp3-light"], bodyBackground: "rgb(255, 255, 255)", osDark: false })),
    "dark"
  );
  assert.equal(
    resolveHostTheme(env({ bodyClasses: ["bt-theme-dark"], bodyBackground: "rgb(255, 255, 255)" })),
    "dark"
  );
  assert.equal(
    resolveHostTheme(env({ htmlClasses: ["rm-dark-theme"], bodyBackground: "rgb(255, 255, 255)" })),
    "dark"
  );
  assert.equal(
    resolveHostTheme(env({ bodyClasses: ["rm-dark-theme"], bodyBackground: "rgb(255, 255, 255)" })),
    "dark"
  );
  assert.equal(
    resolveHostTheme(env({ bodyClasses: ["roam-body", "dark"], bodyBackground: "rgb(255, 255, 255)" })),
    "dark"
  );
  assert.equal(
    resolveHostTheme(env({ bodyClasses: ["roam-body"], bodyBackground: "rgb(255, 255, 255)" })),
    "light"
  );
});

test("host light markers beat dark body background and dark OS hint", () => {
  assert.equal(
    resolveHostTheme(env({ htmlClasses: ["bp3-light"], bodyBackground: "rgb(16, 22, 26)", osDark: true })),
    "light"
  );
  assert.equal(
    resolveHostTheme(env({ bodyClasses: ["bt-theme-light"], bodyBackground: "rgb(16, 22, 26)", osDark: true })),
    "light"
  );
});

test("OS dark with a white body and no classes resolves light", () => {
  assert.equal(
    resolveHostTheme(env({ bodyBackground: "rgb(255, 255, 255)", osDark: true })),
    "light"
  );
});

test("OS light with a dark body and no classes resolves dark", () => {
  assert.equal(
    resolveHostTheme(env({ bodyBackground: "rgb(24, 32, 38)", osDark: false })),
    "dark"
  );
});

test("transparent body falls through to html, then to the OS hint, then light", () => {
  assert.equal(
    resolveHostTheme(env({
      bodyBackground: "rgba(0, 0, 0, 0)",
      htmlBackground: "rgb(20, 24, 28)",
      osDark: false,
    })),
    "dark"
  );
  assert.equal(
    resolveHostTheme(env({
      bodyBackground: "transparent",
      htmlBackground: "rgb(250, 250, 250)",
      osDark: true,
    })),
    "light"
  );
  assert.equal(
    resolveHostTheme(env({
      bodyBackground: "rgba(0, 0, 0, 0)",
      htmlBackground: "rgba(0, 0, 0, 0)",
      osDark: true,
    })),
    "dark"
  );
  assert.equal(
    resolveHostTheme(env({
      bodyBackground: "transparent",
      htmlBackground: "transparent",
      osDark: false,
    })),
    "light"
  );
  assert.equal(
    resolveHostTheme(env({
      bodyBackground: "transparent",
      htmlBackground: "transparent",
    })),
    "light"
  );
});

test("theme setting normalization falls back to Follow Roam on unknown values", () => {
  assert.equal(normalizeThemeSetting(THEME_SETTING_VALUES.LIGHT), "Light");
  assert.equal(normalizeThemeSetting(THEME_SETTING_VALUES.DARK), "Dark");
  assert.equal(normalizeThemeSetting(THEME_SETTING_VALUES.FOLLOW_ROAM), "Follow Roam");
  assert.equal(normalizeThemeSetting({ target: { value: "Dark" } }), "Dark");
  assert.equal(normalizeThemeSetting("sepia"), "Follow Roam");
  assert.equal(normalizeThemeSetting(null), "Follow Roam");
  assert.equal(themeSettingToPreference("Light"), "light");
  assert.equal(themeSettingToPreference("Dark"), "dark");
  assert.equal(themeSettingToPreference("Follow Roam"), null);
  assert.equal(themeSettingToPreference("invalid"), null);
});
