import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../src/extension.css", import.meta.url), "utf8");
const source = await readFile(new URL("../src/extension.js", import.meta.url), "utf8");
const checkboxSource = await readFile(
  new URL("../src/status-checkbox.js", import.meta.url),
  "utf8"
);

test("checkbox CSS is scoped exclusively by the extension-owned marker", () => {
  assert.match(css, /\.rm-checkbox\[data-ts-checkbox-status\]/);
  assert.doesNotMatch(css, /(^|\n)\s*\.checkmark\s*\{/);
  assert.doesNotMatch(css, /:has\(/);
});

test("all built-in shapes and the custom fallback have explicit treatments", () => {
  for (const shape of [
    "active",
    "waiting",
    "holding",
    "incubating",
    "alert",
    "cancelled",
    "custom",
  ]) {
    assert.match(css, new RegExp(`data-ts-checkbox-shape="${shape}"`));
  }
});

test("checked fill remains host-owned and only the secondary ornament changes", () => {
  assert.doesNotMatch(css, /input:checked\s*~\s*\.checkmark\s*\{/);
  assert.match(css, /input:checked\s*\n\s*~ \.checkmark::before/);
  assert.match(css, /host theme continues to own checked fill/i);
});

test("Svy Theme tokens and every established dark signal are supported", () => {
  for (const token of ["--svy-canvas", "--svy-accent", "--cl-blue"]) {
    assert.match(css, new RegExp(token));
  }
  for (const signal of [
    ":root.bp3-dark",
    "body.bt-theme-dark",
    ".rm-dark-theme",
    "body.roam-body.dark",
    ":root:not(.bp3-light)",
  ]) {
    assert.ok(css.includes(signal), `missing dark signal ${signal}`);
  }
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(
    source,
    /\.rm-checkbox\.rm-todo:not\(\[data-ts-checkbox-status\]\) \.checkmark/
  );
});

test("focus, target size, reduced motion, and forced colors are explicit", () => {
  assert.match(css, /input:focus-visible/);
  assert.match(css, /inset: -4px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /forced-color-adjust: auto/);
});

test("observer handles mutation scopes synchronously without a full-document debounce", () => {
  assert.match(source, /refreshMutationScopes\(mutations\)/);
  assert.match(source, /refreshStatusVisuals\(scope\)/);
  assert.match(source, /for \(const node of mutation\.addedNodes/);
  assert.doesNotMatch(source, /PILL_REFRESH_THROTTLE_MS|pillRefreshTimer/);
  assert.doesNotMatch(source, /setTimeout\(\(\) => \{\s*refreshStatusVisuals\(document\)/s);
});

test("the setting describes a cosmetic boundary and no checkbox event is installed", () => {
  assert.match(source, /Style native checkboxes by task status/);
  assert.match(source, /This is cosmetic and never changes completion or Better Tasks data/);
  assert.doesNotMatch(source, /\.rm-checkbox[^\n]*addEventListener/);
  assert.doesNotMatch(checkboxSource, /roamAlphaAPI|data\.block|betterTasks/);
});
