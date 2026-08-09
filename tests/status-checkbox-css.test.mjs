import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../src/extension.css", import.meta.url), "utf8");
const source = await readFile(new URL("../src/extension.js", import.meta.url), "utf8");
const checkboxSource = await readFile(
  new URL("../src/status-checkbox.js", import.meta.url),
  "utf8"
);
const peekSource = await readFile(new URL("../src/status-peek.js", import.meta.url), "utf8");

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

test("unchecked checkboxes use centered semantic glyphs instead of corner ornaments", () => {
  assert.match(css, /top: 50%/);
  assert.match(css, /left: 50%/);
  assert.match(css, /transform: translate\(-50%, -50%\)/);
  assert.match(
    css,
    /data-ts-checkbox-shape="active"[\s\S]*--ts-checkbox-glyph-clip: polygon/
  );
  assert.match(
    css,
    /data-ts-checkbox-shape="waiting"[\s\S]*var\(--ts-checkbox-accent\) 0 3px[\s\S]*transparent 3px 6px[\s\S]*var\(--ts-checkbox-accent\) 6px 9px/
  );
  assert.match(
    css,
    /data-ts-checkbox-shape="alert"[\s\S]*radial-gradient[\s\S]*linear-gradient/
  );
  assert.match(
    css,
    /data-ts-checkbox-shape="cancelled"[\s\S]*linear-gradient\([\s\S]*45deg[\s\S]*linear-gradient\([\s\S]*-45deg/
  );
});

test("pill markers repeat every semantic checkbox glyph instead of using color alone", () => {
  for (const status of [
    "ACTIVE",
    "WAITING",
    "HOLDING",
    "INCUBATING",
    "ALERT",
    "CANCELLED",
  ]) {
    assert.match(
      css,
      new RegExp(`data-task-status-key="${status}"\\]`),
      `missing pill marker treatment for ${status}`
    );
  }
  assert.match(css, /--ts-pill-marker-clip: polygon/);
  assert.match(css, /currentColor 0 2px[\s\S]*transparent 2px 5px[\s\S]*currentColor 5px 7px/);
  assert.match(
    css,
    /data-task-status-key="CANCELLED"\][\s\S]*45deg[\s\S]*-45deg/
  );
  assert.match(css, /width: var\(--ts-pill-marker-width/);
  assert.match(css, /border: var\(--ts-pill-marker-border/);
  assert.match(css, /clip-path: var\(--ts-pill-marker-clip/);
});

test("status pills expose paired light and dark variables with a visible Cancelled fallback", () => {
  for (const variable of [
    "--ts-status-bg-light",
    "--ts-status-fg-light",
    "--ts-status-border-light",
    "--ts-status-bg-dark",
    "--ts-status-fg-dark",
    "--ts-status-border-dark",
  ]) {
    assert.match(source, new RegExp(variable));
    assert.match(css, new RegExp(variable));
  }
  assert.match(css, /--ts-cancelled-fg-dark: rgb\(145, 150, 159\)/);
  assert.match(css, /\.bt-pill\[data-task-status-title\^="task-status\/"\]/);
  assert.match(css, /border: 1px solid var\(--ts-status-border, transparent\)/);
  assert.match(source, /buildStatusPillColors/);
  assert.match(source, /background-color: var\(--ts-status-bg\) !important/);
  assert.match(source, /border-color: var\(--ts-status-border\) !important/);
});

test("checked fill remains host-owned and the workflow glyph is removed", () => {
  assert.doesNotMatch(css, /input:checked\s*~\s*\.checkmark\s*\{/);
  assert.match(css, /input:checked\s*\n\s*~ \.checkmark::before\s*\{\s*content: none !important;/);
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

test("the chooser is a scoped Svy-themed surface rather than a Blueprint white island", () => {
  for (const token of [
    "--svy-overlay",
    "--svy-surface",
    "--svy-hover",
    "--svy-selected",
    "--svy-border",
    "--svy-border-subtle",
    "--svy-text",
    "--svy-text-muted",
    "--svy-accent",
    "--svy-ff-main",
  ]) {
    assert.match(css, new RegExp(token));
  }
  assert.match(
    css,
    /\.ts-status-chooser \.bp3-popover-content[\s\S]*background: var\(--ts-menu-surface\) !important/
  );
  assert.match(css, /\.ts-status-chooser \.bp3-popover-arrow-fill[\s\S]*fill: var\(--ts-menu-surface\) !important/);
  assert.match(css, /\.ts-status-chooser \.bp3-popover-arrow-border[\s\S]*fill: var\(--ts-menu-border\) !important/);
  assert.match(css, /\.ts-status-chooser \.bp3-popover-arrow[\s\S]*position: absolute/);
  assert.match(css, /\.ts-status-chooser \.ts-status-choice:hover[\s\S]*var\(--ts-menu-hover\)/);
  assert.match(css, /\.ts-status-chooser \.ts-status-choice\.bp3-active[\s\S]*var\(--ts-menu-selected\)/);
  assert.match(css, /\.ts-status-chooser \.ts-status-choice:focus-visible[\s\S]*var\(--ts-menu-accent\)/);
  assert.match(css, /\.ts-status-chooser \.ts-status-choice-remove[\s\S]*var\(--ts-menu-danger\)/);
  assert.doesNotMatch(css, /(^|\n)\s*\.bp3-popover-content\s*\{/);
});

test("popover positioning prefers the current block gutter and remains viewport-safe", () => {
  assert.match(peekSource, /computeGutterPopoverPlacement/);
  assert.match(peekSource, /resolveBlockGutterAnchor/);
  assert.match(peekSource, /preferredLeft >= safeMargin/);
  assert.match(peekSource, /placement: "left"/);
  assert.match(peekSource, /placement: opensBelow \? "below" : "above"/);
  assert.match(peekSource, /data-ts-placement/);
  assert.match(source, /placementAnchorEl: resolveBlockGutterAnchor\(anchorEl\)/);
  assert.match(source, /placementAnchorEl \|\| resolveBlockGutterAnchor\(anchorEl\) \|\| anchorEl/);
  assert.match(source, /arrowSide === "right"/);
  assert.match(css, /\.ts-status-chooser \.bp3-menu[\s\S]*min-width: 116px/);
  assert.doesNotMatch(peekSource, /roamAlphaAPI|data\.pull|data\.q/);
});

test("focus, target size, reduced motion, and forced colors are explicit", () => {
  assert.match(css, /input:focus-visible/);
  assert.match(css, /inset: -4px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /forced-color-adjust: auto/);
  assert.match(css, /--ts-checkbox-accent: currentColor/);
  assert.match(
    css,
    /forced-colors: active[\s\S]*\.ts-status-chooser \.bp3-popover-content[\s\S]*background: Canvas !important/
  );
  assert.match(
    css,
    /forced-colors: active[\s\S]*\.ts-status-chooser \.ts-status-choice\.bp3-active[\s\S]*background: Highlight !important/
  );
  assert.doesNotMatch(
    css,
    /\.checkmark::before\s*\{[\s\S]{0,180}background: currentColor !important/
  );
});

test("Alert attention is a scoped two-beat beacon with a long quiet interval", () => {
  assert.match(
    css,
    /\.rm-checkbox\.rm-todo\[data-ts-alert-beacon="true"\]\[data-ts-checkbox-status="ALERT"\][\s\S]*\.check-container::before[\s\S]*animation: ts-alert-ring-beacon 5\.2s/
  );
  assert.match(
    css,
    /\.rm-checkbox\.rm-todo\[data-ts-alert-beacon="true"\]\[data-ts-checkbox-status="ALERT"\][\s\S]*~ span\.rm-page-ref\[data-ts-managed-status-pill="true"\]\[data-ts-alert-beacon="true"\]\[data-task-status-key="ALERT"\]/
  );
  assert.doesNotMatch(
    css,
    /ts-alert-peek-beacon|\.ts-status-peek\[data-ts-alert-beacon/
  );
  assert.match(css, /@keyframes ts-alert-ring-beacon[\s\S]*5%,[\s\S]*17%/);
  assert.match(css, /24%,[\s\S]*100%/);
  assert.match(css, /will-change: opacity, transform/);
  assert.doesNotMatch(
    css,
    /\.rm-checkbox[^}]*animation:[^;]*(?:outline|box-shadow)/s
  );
  assert.match(css, /@media print/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
  assert.match(css, /forced-colors: active[\s\S]*data-ts-alert-beacon/);
  assert.doesNotMatch(
    css,
    /rm-page-ref\[data-task-status-key="ALERT"\]\s*\{[^}]*animation:/s
  );
  assert.match(source, /Animate Alert status/);
  assert.match(source, /This is cosmetic, writes no task data/);
  assert.doesNotMatch(source, /handleNativeCheckboxChange/);
  assert.doesNotMatch(source, /window\.addEventListener\("change",/);
  assert.doesNotMatch(checkboxSource, /syncAlertBeaconForNativeCheckboxState/);
  assert.doesNotMatch(peekSource, /data-ts-alert-beacon|syncNativeCheckboxState/);
  assert.match(checkboxSource, /ALERT_BEACON_ATTRIBUTE/);
});

test("observer refreshes only status-bearing host mutations and ignores its own portal", () => {
  assert.match(source, /refreshMutationScopes\(mutations\)/);
  assert.match(source, /refreshStatusVisuals\(scope\)/);
  assert.match(source, /EXTENSION_UI_SELECTOR = "\.ts-status-portal, \.ts-status-names-panel"/);
  assert.match(source, /STATUS_MUTATION_SELECTOR/);
  assert.match(source, /containsStatusVisual\(node\)/);
  assert.match(source, /if \(isInsideExtensionUi\(mutation\.target\)\) continue/);
  assert.match(source, /for \(const node of mutation\.addedNodes/);
  assert.match(source, /removedStatusVisual/);
  assert.doesNotMatch(source, /handledAddedElement|!handledAddedElement/);
  assert.doesNotMatch(source, /PILL_REFRESH_THROTTLE_MS|pillRefreshTimer/);
  assert.doesNotMatch(source, /setTimeout\(\(\) => \{\s*refreshStatusVisuals\(document\)/s);
});

test("hover/focus context resolution is graph-read-free", () => {
  const match = source.match(
    /function resolveStatusPeekContext[\s\S]*?\n  function closeStatusChooser/
  );
  assert.ok(match, "missing status peek resolver");
  assert.doesNotMatch(
    match[0],
    /getBlockString|getLiveBlockInputValue|parseManagedPrefix|roamAlphaAPI/
  );
  assert.match(match[0], /getBlockUidFromDomElement\(checkbox\)/);
  assert.doesNotMatch(match[0], /getBlockUidFromElement\(checkbox\)/);
  const domUidMatch = source.match(
    /function getBlockUidFromDomElement[\s\S]*?\n  function getBlockUidFromElement/
  );
  assert.ok(domUidMatch, "missing DOM-only UID resolver");
  assert.doesNotMatch(domUidMatch[0], /roamAlphaAPI|data\.pull|data\.q/);
  assert.match(match[0], /already[\s\S]*certified[\s\S]*DOM-only/i);
  assert.match(match[0], /CHECKBOX_UID_ATTRIBUTE/);
  assert.match(match[0], /certifiedUid !== blockUid/);
  assert.match(match[0], /certified write router/);
});

test("the setting describes a cosmetic boundary and no per-checkbox event is installed", () => {
  assert.match(source, /Style native checkboxes by task status/);
  assert.match(source, /This is cosmetic and never changes completion or Better Tasks data/);
  assert.doesNotMatch(source, /\.rm-checkbox[^\n]*addEventListener/);
  assert.doesNotMatch(peekSource, /checkbox\.addEventListener/);
  assert.match(peekSource, /\["pointerover", handlePointerOver\]/);
  assert.match(peekSource, /\["keydown", handleKeyDown\]/);
  assert.doesNotMatch(checkboxSource, /roamAlphaAPI|data\.block|betterTasks/);
});

test("checkbox-only hiding is exact, fail-visible in source, and never a broad tag rule", () => {
  assert.match(
    css,
    /\.rm-page-ref\[data-ts-managed-status-pill="true"\]\[data-ts-status-pill-hidden="true"\]\s*\{\s*display: none !important;/
  );
  assert.doesNotMatch(css, /\[data-tag\^="task-status\/"\][^{]*\{[^}]*display:\s*none/is);
  assert.match(source, /clearOwnedStatusPillPresentations\(scope\)/);
  assert.match(source, /syncStatusPresentationForPill/);
  assert.match(checkboxSource, /clearStatusPillPresentation\(statusPill\)/);
});

test("the reveal control carries status shapes and light, dark, focus, motion, and forced-color support", () => {
  assert.match(css, /\.ts-status-portal > \.ts-status-peek\[data-task-status-key\]/);
  assert.match(css, /\.ts-status-peek\[data-task-status-key="WAITING"\]/);
  assert.match(css, /\.ts-status-peek\[data-task-status-key="CANCELLED"\]/);
  assert.match(css, /\.ts-status-peek\[data-task-status-key\]:focus-visible/);
  assert.match(css, /animation: ts-status-peek-in/);
  assert.match(css, /\.ts-status-peek\[data-task-status-key\][^{]*\{[^}]*animation: none !important/is);
  assert.match(css, /background: Canvas !important/);
  assert.match(css, /color: ButtonText !important/);
  assert.match(peekSource, /Press Enter or Alt plus Down Arrow/);
  assert.match(peekSource, /event\.key === "Enter"/);
  assert.match(peekSource, /event\.key === "ArrowDown"/);
  assert.match(peekSource, /isIntentCurrent/);
  assert.match(source, /typeof isIntentCurrent === "function" && !isIntentCurrent\(\)/);
});
