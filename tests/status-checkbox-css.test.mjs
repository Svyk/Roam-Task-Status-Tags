import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildStatusCheckboxColors,
  compositeRgb,
  contrastRatio,
  mixRgb,
} from "../src/status-checkbox.js";

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
    "in-review",
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
    /data-ts-checkbox-shape="waiting"[\s\S]*var\(--ts-checkbox-ink\) 0 3px[\s\S]*transparent 3px 6px[\s\S]*var\(--ts-checkbox-ink\) 6px 9px/
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

test("In Review has its own palette tokens and half-filled circle glyph", () => {
  assert.match(css, /--ts-in-review-fg-light:/);
  assert.match(css, /--ts-in-review-fg-dark:/);
  assert.match(
    css,
    /data-ts-checkbox-shape="in-review"[\s\S]*var\(--ts-checkbox-ink\) 0 50%/
  );
});

test("pill markers repeat every semantic checkbox glyph instead of using color alone", () => {
  for (const status of [
    "ACTIVE",
    "WAITING",
    "IN_REVIEW",
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

test("Svy Theme tokens and the single data-ts-theme dark signal are supported", () => {
  for (const token of ["--svy-canvas", "--svy-accent", "--cl-blue"]) {
    assert.match(css, new RegExp(token));
  }
  assert.ok(
    css.includes(':root[data-ts-theme="dark"]'),
    'missing single dark signal :root[data-ts-theme="dark"]'
  );
  for (const forbidden of [
    "prefers-color-scheme",
    "bp3-dark",
    "bt-theme-dark",
    "rm-dark-theme",
    "roam-body.dark",
    ":root:not(.bp3-light)",
  ]) {
    assert.equal(
      css.includes(forbidden),
      false,
      `unexpected legacy theme selector in CSS: ${forbidden}`
    );
  }
  const strippedCss = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const darkThemeSelectors = [
    ...strippedCss.matchAll(
      /([^{}@]+)\{[^}]*(?:var\(--ts-checkbox-accent-dark\)|var\(--ts-status-bg-dark|--ts-preview-surface-bg:\s*#1f2428|color-scheme:\s*dark)[^}]*\}/g
    ),
  ].map((match) => match[1].trim());
  assert.ok(darkThemeSelectors.length > 0, "expected dark theme rules");
  for (const selector of darkThemeSelectors) {
    if (selector.startsWith('.ts-status-view[data-ts-view-theme="dark"]')) continue;
    assert.ok(
      selector.startsWith(':root[data-ts-theme="dark"]'),
      `dark rule must start with :root[data-ts-theme="dark"], got: ${selector}`
    );
  }
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
  assert.match(source, /EXTENSION_UI_SELECTOR = "\.ts-status-portal, \.ts-status-names-panel, \.ts-episode-counter, \.ts-style-preview, \.ts-burst-canvas, \.ts-rendered-icon"/);
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

const MEDIA_SHAPES = ["series", "movie", "watching", "watchlist", "upcoming", "rewatch", "dropped"];
const EXTRA_SHAPES = [
  "important",
  "starred",
  "discuss",
  "billable",
  "bug",
  "draft",
  "deadline",
  "kawaii",
  "flower",
  "sun",
  "moon",
];

function ruleBody(selectorFragment) {
  const at = css.indexOf(selectorFragment);
  assert.notEqual(at, -1, selectorFragment);
  return css.slice(at, css.indexOf("}", at));
}

test("each media and extra shape has a unique checkbox mask rule and pill marker rule", () => {
  const iconDefs = new Map(
    [...css.matchAll(/(--ts-(?:ico|svg)-[a-z0-9-]+):\s*(url\("data:image\/svg\+xml[^"]+"\))/g)].map(
      ([, name, uri]) => [name, uri]
    )
  );
  const resolveMask = (raw) => {
    const varMatch = raw?.match(/^var\((--ts-[a-z0-9-]+)\)$/);
    return varMatch ? iconDefs.get(varMatch[1]) || null : raw;
  };
  const masks = new Set();
  for (const shape of [...MEDIA_SHAPES, ...EXTRA_SHAPES]) {
    const checkbox = ruleBody(`.rm-checkbox[data-ts-checkbox-shape="${shape}"] {`);
    const mask = checkbox.match(
      /--ts-checkbox-glyph-mask: (url\("data:image\/svg\+xml[^"]+"\)|var\(--ts-[a-z0-9-]+\))/
    );
    assert.ok(mask, `${shape} checkbox mask`);
    const resolvedCheckboxMask = resolveMask(mask[1]);
    assert.ok(resolvedCheckboxMask?.startsWith('url("data:image/svg+xml'), `${shape} resolved checkbox mask`);
    assert.match(checkbox, /--ts-checkbox-glyph-width: 10px/);
    assert.match(checkbox, /--ts-checkbox-glyph-background: var\(--ts-checkbox-ink\)/);
    masks.add(resolvedCheckboxMask);
    const pill = ruleBody(`[data-ts-status-glyph="${shape}"] {`);
    const pillMask = pill.match(
      /--ts-pill-marker-mask: (url\("data:image\/svg\+xml[^"]+"\)|var\(--ts-[a-z0-9-]+\))/
    );
    assert.ok(pillMask && resolveMask(pillMask[1])?.startsWith('url("data:image/svg+xml'), `${shape} pill mask`);
    assert.match(pill, /--ts-pill-marker-background: currentColor/);
  }
  assert.equal(masks.size, MEDIA_SHAPES.length + EXTRA_SHAPES.length);
});

test("masks are wired into the shared glyph and marker rules with a none default", () => {
  assert.match(css, /mask: var\(--ts-checkbox-glyph-mask, none\) center \/ contain no-repeat/);
  assert.equal(
    (css.match(/mask: var\(--ts-pill-marker-mask, none\) center \/ contain no-repeat/g) || []).length >= 6,
    true
  );
  assert.match(css, /\)\[data-task-status-key\]:not\(\s*\[data-ts-status-glyph\],/);
  assert.match(css, /\.ts-status-choice-divider \{/);
});

test("the existing shape rules are unchanged", () => {
  assert.match(
    ruleBody('.rm-checkbox[data-ts-checkbox-shape="active"] {'),
    /--ts-checkbox-glyph-clip: polygon\(10% 4%, 94% 50%, 10% 96%\)/
  );
  assert.match(
    ruleBody('.rm-checkbox[data-ts-checkbox-shape="custom"] {'),
    /--ts-checkbox-glyph-transform: rotate\(45deg\)/
  );
  assert.doesNotMatch(ruleBody('.rm-checkbox[data-ts-checkbox-shape="alert"] {'), /glyph-mask/);
});

test("checkbox styles stay scoped to owned checkboxes and glyphs paint with --ts-checkbox-ink", () => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");

  // Every glyph rule (data-ts-checkbox-shape) uses --ts-checkbox-ink, never --ts-checkbox-accent directly.
  const glyphRules = [
    ...stripped.matchAll(/(?:^|\n)\.rm-checkbox\[data-ts-checkbox-shape="([^"]+)"\]\s*\{([^}]*)\}/g),
  ];
  assert.equal(glyphRules.length, 26, "expected all 25 built-in/media/extra shapes plus custom");
  for (const [, shape, body] of glyphRules) {
    assert.doesNotMatch(
      body,
      /--ts-checkbox-accent/,
      `glyph rule for ${shape} must use --ts-checkbox-ink instead of --ts-checkbox-accent`
    );
    assert.match(
      body,
      /--ts-checkbox-ink/,
      `glyph rule for ${shape} must paint with --ts-checkbox-ink`
    );
  }
  const beforeRule = ruleBody(".rm-checkbox[data-ts-checkbox-status] > .check-container > .checkmark::before {");
  assert.doesNotMatch(beforeRule, /--ts-checkbox-accent/);
  assert.match(beforeRule, /var\(--ts-checkbox-ink\)/);

  // Every data-ts-checkbox-style selector ends on an owned checkbox or its descendant.
  const styleRuleHeaders = [
    ...stripped.matchAll(/([^{}@]*data-ts-checkbox-style[^{}@]*)\{/g),
  ].map((match) => match[1].trim());
  assert.ok(styleRuleHeaders.length > 0, "expected checkbox style rules");
  for (const header of styleRuleHeaders) {
    for (const selector of header.split(",").map((part) => part.trim()).filter(Boolean)) {
      assert.match(
        selector,
        /\.rm-checkbox(?:\.rm-todo)?(?:\[[^\]]+\])*(?::not\([^)]+\))?\s*(?:>\s*[^,]+)?$/,
        `checkbox style selector must end on an owned checkbox or descendant: ${selector}`
      );
      assert.match(
        selector,
        /\[data-ts-checkbox-status(?:="[^"]+")?\]/,
        `checkbox style selector must require data-ts-checkbox-status: ${selector}`
      );
    }
  }

  assert.match(css, /:root\[data-ts-checkbox-style="glass"\]/);
  assert.match(css, /:root\[data-ts-checkbox-style="solid"\]/);
  assert.match(css, /:root\[data-ts-checkbox-style="minimal"\]/);
  assert.match(
    css,
    /:root\[data-ts-checkbox-style="minimal"\][\s\S]*?border-width: 0 !important;[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important;/
  );
  assert.match(
    css,
    /:root\[data-ts-checkbox-style="minimal"\][\s\S]*?\[data-ts-checkbox-shape="alert"\][\s\S]*?filter: none;/
  );
  assert.match(css, /:root\[data-ts-checkbox-style="sticker"\]/);
  assert.match(css, /@keyframes ts-status-pop-slap/);
  assert.match(css, /data-ts-checkbox-tilt="0"/);
  assert.match(css, /data-ts-checkbox-tilt="3"/);
  assert.match(css, /:root\[data-ts-checkbox-size="medium"\]/);
  assert.match(css, /:root\[data-ts-checkbox-size="large"\]/);
  assert.match(css, /:root\[data-ts-checkbox-size="xlarge"\]/);

  // Every data-ts-checkbox-size selector is gated by :root[...data-ts-checkbox-size...]
  // and ends on .rm-checkbox or its descendants.
  const sizeRuleHeaders = [
    ...stripped.matchAll(/([^{}@]*data-ts-checkbox-size[^{}@]*)\{/g),
  ].map((match) => match[1].trim());
  assert.ok(sizeRuleHeaders.length > 0, "expected checkbox size rules");
  for (const header of sizeRuleHeaders) {
    for (const selector of header.split(",").map((part) => part.trim()).filter(Boolean)) {
      assert.match(
        selector,
        /^:root(?:\[data-ts-theme="dark"\])?\[data-ts-checkbox-size(?:="(?:medium|large|xlarge)")?\]/,
        `checkbox size selector must be gated by :root[data-ts-checkbox-size...]: ${selector}`
      );
      assert.match(
        selector,
        /\.rm-checkbox(?:\.rm-todo)?(?:\[[^\]]+\])*(?::not\([^)]+\))?\s*(?:>\s*[^,]+)?$/,
        `checkbox size selector must end on .rm-checkbox or its descendant: ${selector}`
      );
    }
  }
  assert.match(css, /--ts-checkbox-ink: var\(--ts-checkbox-solid-on-accent, var\(--ts-checkbox-on-accent\)\)/);
  assert.match(css, /@media print[\s\S]*:root\[data-ts-checkbox-style\]/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*:root\[data-ts-checkbox-style\]/);
  assert.doesNotMatch(css, /\b(?:listitem-task|line-check-div|state-done|state-started|body\.bt-on|bt-dark|bt-light|bt-preset-|bt-anim|bt-picker|--bt-)\b/);
  assert.doesNotMatch(css, /:root\s*\{/);
});

test("hover lift, active press, forbidden selectors, and static Solid on-accent contrast are enforced", () => {
  assert.doesNotMatch(css, /backdrop-filter\s*:/i);
  assert.doesNotMatch(css, /:has\(/i);
  assert.doesNotMatch(css, /::selection/i);

  assert.match(
    css,
    /\.rm-checkbox\[data-ts-checkbox-status\]\s*>\s*\.check-container:hover\s*>\s*input:not\(:checked\)\s*~\s*\.checkmark[\s\S]*?transform:\s*scale\(/
  );
  assert.match(
    css,
    /\.rm-checkbox\[data-ts-checkbox-status\]\s*>\s*\.check-container:active\s*>\s*input:not\(:checked\)\s*~\s*\.checkmark[\s\S]*?transform:\s*scale\(/
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.check-container:active[\s\S]*?transform:\s*none !important;/
  );

  const parseCssColor = (value) => {
    const rgbMatch = value.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
    if (rgbMatch) {
      return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) };
    }
    const hexMatch = value.match(/^#([0-9a-f]{6})$/i);
    if (hexMatch) {
      const hex = hexMatch[1];
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
      };
    }
    throw new Error(`Unsupported color format in static CSS check: ${value}`);
  };

  for (const status of [
    "ACTIVE",
    "WAITING",
    "IN_REVIEW",
    "HOLDING",
    "INCUBATING",
    "ALERT",
    "CANCELLED",
  ]) {
    const body = ruleBody(`.rm-checkbox[data-ts-checkbox-status="${status}"] {`);
    for (const mode of ["light", "dark"]) {
      const accent = body.match(new RegExp(`--ts-checkbox-accent-${mode}:\\s*([^;]+);`))?.[1]?.trim();
      const onAccent = body.match(new RegExp(`--ts-checkbox-on-accent-${mode}:\\s*([^;]+);`))?.[1]?.trim();
      assert.ok(accent && onAccent, `missing static ${mode} accent/on-accent for ${status}`);
      const ratio = contrastRatio(parseCssColor(onAccent), parseCssColor(accent));
      assert.ok(
        ratio >= 3.0,
        `${status} ${mode} Solid glyph contrast ${ratio.toFixed(2)} is below 3:1`
      );
    }
  }
});

test("colour audit: all 25 statuses + custom x 5 styles x 2 themes meet WCAG targets with zero exemptions", () => {
  const LIGHT_SURFACE = { r: 245, g: 248, b: 250 };
  const DARK_SURFACE = { r: 32, g: 43, b: 51 };
  const WHITE = { r: 255, g: 255, b: 255 };
  const BLACK = { r: 0, g: 0, b: 0 };
  const NEAR_BLACK = { r: 16, g: 22, b: 26 };
  const SOLID_GRADIENT_SHADOW = { r: 15, g: 23, b: 42 };

  const ALL_STATUSES = [
    ["ACTIVE", "active", "#14b8a6"],
    ["WAITING", "waiting", "#eab308"],
    ["IN_REVIEW", "in-review", "#0ea5e9"],
    ["HOLDING", "holding", "#94a3b8"],
    ["INCUBATING", "incubating", "#6366f1"],
    ["ALERT", "alert", "#f43f5e"],
    ["CANCELLED", "cancelled", "#1e293b"],
    ["SERIES", "series", "#c026d3"],
    ["MOVIE", "movie", "#f97316"],
    ["WATCHING", "watching", "#22c55e"],
    ["WATCHLIST", "watchlist", "#ec4899"],
    ["UPCOMING", "upcoming", "#0d87f2"],
    ["REWATCH", "rewatch", "#84cc16"],
    ["DROPPED", "dropped", "#7c2d12"],
    ["IMPORTANT", "important", "#dc2626"],
    ["STARRED", "starred", "#d97706"],
    ["DISCUSS", "discuss", "#8b5cf6"],
    ["BILLABLE", "billable", "#10b981"],
    ["BUG", "bug", "#65a30d"],
    ["DRAFT", "draft", "#3b82f6"],
    ["DEADLINE", "deadline", "#ea580c"],
    ["KAWAII", "kawaii", "#f472b6"],
    ["FLOWER", "flower", "#e879f9"],
    ["SUN", "sun", "#f59e0b"],
    ["MOON", "moon", "#818cf8"],
    ["CUSTOM", "custom", "#64748b"],
  ];

  const parseColor = (raw, surface) => {
    const s = String(raw || "").trim();
    const h = s.match(/^#([0-9a-f]{6})$/i);
    if (h) {
      return {
        r: Number.parseInt(h[1].slice(0, 2), 16),
        g: Number.parseInt(h[1].slice(2, 4), 16),
        b: Number.parseInt(h[1].slice(4, 6), 16),
      };
    }
    const rgba = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (rgba) {
      const rgb = { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]) };
      if (rgba[4] !== undefined) return compositeRgb(rgb, surface, Number(rgba[4]));
      return rgb;
    }
    throw new Error(`Unparseable color: ${raw}`);
  };

  const avgRgb = (a, b) => ({ r: (a.r + b.r) / 2, g: (a.g + b.g) / 2, b: (a.b + b.b) / 2 });

  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  for (const match of stripped.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const sels = match[1]
      .split(",")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    rules.push({ sels, body: match[2] });
  }
  const getDecl = (exactSel, prop) => {
    let value = null;
    for (const rule of rules) {
      if (rule.sels.includes(exactSel)) {
        const propMatch = rule.body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
        if (propMatch) value = propMatch[1].replace(/\s*!important\s*$/, "").trim();
      }
    }
    return value;
  };

  const parseGradientMid = (decl, surface) => {
    const tokens = [...String(decl || "").matchAll(/#[0-9a-f]{6}|rgba?\([^)]+\)/gi)].map((m) =>
      parseColor(m[0], surface)
    );
    assert.ok(tokens.length >= 1, `expected color tokens in ${decl}`);
    return tokens.length >= 2 ? avgRgb(tokens[0], tokens[1]) : tokens[0];
  };

  const parseSvgGradientMid = (varName, surface) => {
    const match = stripped.match(new RegExp(`${varName}:\\s*url\\("([^"]+)"\\)`));
    assert.ok(match, `missing SVG variable ${varName}`);
    const decoded = decodeURIComponent(match[1]);
    const stops = [...decoded.matchAll(/stop-color='(#[0-9a-f]{6})'/gi)].map((m) =>
      parseColor(m[1], surface)
    );
    assert.ok(stops.length >= 2, `expected stops in ${varName}`);
    return avgRgb(stops[0], stops[1]);
  };

  const lightVarBlock = stripped.match(
    /:root\[data-ts-checkbox-style\] \.rm-checkbox\[data-ts-checkbox-status\]\s*\{([^}]*)\}/
  )?.[1] || "";
  const darkVarBlock = stripped.match(
    /:root\[data-ts-theme="dark"\]\[data-ts-checkbox-style\] \.rm-checkbox\[data-ts-checkbox-status\]\s*\{([^}]*)\}/
  )?.[1] || "";
  const readInkVar = (block, varName, surface) => {
    const m = block.match(new RegExp(`${varName}:\\s*([^;]+);`));
    return m ? parseGradientMid(m[1], surface) : null;
  };

  const PORTED_MASK_SHAPES = new Set([
    "active", "waiting", "billable", "important", "discuss",
    "starred", "cancelled", "bug", "draft", "deadline", "sun", "moon",
  ]);
  const FULL_SVG_SHAPES = new Set(["alert", "kawaii", "flower"]);

  const alertMid = parseSvgGradientMid("--ts-svg-alert", LIGHT_SURFACE);
  const alertSolidMid = parseSvgGradientMid("--ts-svg-alert-solid", LIGHT_SURFACE);
  const alertStickerLightMid = parseSvgGradientMid("--ts-svg-alert-sticker-light", LIGHT_SURFACE);
  const alertStickerDarkMid = parseSvgGradientMid("--ts-svg-alert-sticker-dark", DARK_SURFACE);

  for (const [key, shape, baseHex] of ALL_STATUSES) {
    const palette = buildStatusCheckboxColors({ baseRgb: parseColor(baseHex, LIGHT_SURFACE) });

    for (const theme of ["light", "dark"]) {
      const surface = theme === "light" ? LIGHT_SURFACE : DARK_SURFACE;
      const accent = theme === "light" ? palette.lightAccent : palette.darkAccent;
      const solidAccent = theme === "light" ? palette.lightSolidAccent : palette.darkSolidAccent;
      const solidOnAccent = parseColor(
        theme === "light" ? palette.lightSolidOnAccentCss : palette.darkSolidOnAccentCss,
        surface
      );
      const stickerAccent = theme === "light" ? palette.lightStickerAccent : palette.darkStickerAccent;
      const stickerOnAccent = parseColor(
        theme === "light" ? palette.lightStickerOnAccentCss : palette.darkStickerOnAccentCss,
        surface
      );
      const wash = compositeRgb(
        parseColor(baseHex, surface),
        surface,
        theme === "light" ? 0.09 : 0.16
      );

      // 1. Outline: stroke vs surface >= 3:1; glyph vs wash >= 3:1
      assert.ok(
        contrastRatio(accent, surface) >= 3.0,
        `${key} Outline ${theme} stroke vs surface = ${contrastRatio(accent, surface).toFixed(2)}`
      );
      assert.ok(
        contrastRatio(accent, wash) >= 3.0,
        `${key} Outline ${theme} glyph vs wash = ${contrastRatio(accent, wash).toFixed(2)}`
      );

      // 2. Glass & Minimal: tile/border vs surface >= 3:1; glyph vs tile/surface >= 3:1
      if (FULL_SVG_SHAPES.has(shape)) {
        if (shape === "alert") {
          assert.ok(
            contrastRatio(alertMid, surface) >= 3.0,
            `ALERT Glass/Minimal ${theme} tile vs surface = ${contrastRatio(alertMid, surface).toFixed(2)}`
          );
          assert.ok(
            contrastRatio(WHITE, alertMid) >= 3.0,
            `ALERT Glass/Minimal ${theme} glyph vs tile = ${contrastRatio(WHITE, alertMid).toFixed(2)}`
          );
          assert.ok(
            contrastRatio(alertSolidMid, surface) >= 3.0,
            `ALERT Solid ${theme} tile vs surface = ${contrastRatio(alertSolidMid, surface).toFixed(2)}`
          );
          assert.ok(
            contrastRatio(WHITE, alertSolidMid) >= 4.5,
            `ALERT Solid ${theme} glyph vs tile = ${contrastRatio(WHITE, alertSolidMid).toFixed(2)}`
          );
        } else if (shape === "kawaii") {
          const edgeOrFill = theme === "light" ? parseColor("#ec4899", surface) : parseColor("#f9a8d4", surface);
          assert.ok(contrastRatio(edgeOrFill, surface) >= 3.0, `KAWAII ${theme} vs surface`);
          assert.ok(
            contrastRatio(parseColor("#4a1d3d", surface), parseColor("#f9a8d4", surface)) >= 3.0,
            `KAWAII ${theme} face vs fill`
          );
        } else if (shape === "flower") {
          const edgeOrFill = theme === "light" ? parseColor("#d946ef", surface) : parseColor("#f0abfc", surface);
          assert.ok(contrastRatio(edgeOrFill, surface) >= 3.0, `FLOWER ${theme} vs surface`);
          assert.ok(
            contrastRatio(parseColor("#d946ef", surface), parseColor("#fdf4ff", surface)) >= 3.0,
            `FLOWER ${theme} petal outline vs petal`
          );
        }
      } else if (PORTED_MASK_SHAPES.has(shape)) {
        const darkSel = `:root[data-ts-theme="dark"][data-ts-checkbox-style] .rm-checkbox[data-ts-checkbox-status][data-ts-checkbox-shape="${shape}"] > .check-container > input:not(:checked) ~ .checkmark`;
        const baseSel = `:root[data-ts-checkbox-style] .rm-checkbox[data-ts-checkbox-status][data-ts-checkbox-shape="${shape}"] > .check-container > input:not(:checked) ~ .checkmark`;
        const borderRaw = (theme === "dark" && getDecl(darkSel, "border-color")) || getDecl(baseSel, "border-color");
        const bgRaw = (theme === "dark" && getDecl(darkSel, "background")) || getDecl(baseSel, "background");
        assert.ok(borderRaw && bgRaw, `missing Glass border/bg for ${shape} ${theme}`);
        const glassBorder = parseColor(borderRaw, surface);
        const glassTile = parseGradientMid(bgRaw, surface);
        const ink = readInkVar(theme === "light" ? lightVarBlock : darkVarBlock, `--ts-${shape}-ink`, surface);
        assert.ok(ink, `missing --ts-${shape}-ink for ${theme}`);
        assert.ok(
          contrastRatio(glassBorder, surface) >= 3.0,
          `${key} Glass ${theme} border vs surface = ${contrastRatio(glassBorder, surface).toFixed(2)}`
        );
        assert.ok(
          contrastRatio(ink, glassTile) >= 3.0,
          `${key} Glass ${theme} glyph vs tile = ${contrastRatio(ink, glassTile).toFixed(2)}`
        );
        assert.ok(
          contrastRatio(ink, surface) >= 3.0,
          `${key} Minimal ${theme} glyph vs surface = ${contrastRatio(ink, surface).toFixed(2)}`
        );
      } else {
        const glassBorder = theme === "dark" ? mixRgb(accent, WHITE, 0.18) : accent;
        const glassTile = avgRgb(
          compositeRgb(accent, surface, theme === "dark" ? 0.28 : 0.26),
          compositeRgb(accent, surface, theme === "dark" ? 0.12 : 0.11)
        );
        const ink =
          theme === "dark"
            ? avgRgb(mixRgb(accent, WHITE, 0.56), accent)
            : avgRgb(accent, mixRgb(accent, { r: 15, g: 23, b: 42 }, 0.28));
        assert.ok(
          contrastRatio(glassBorder, surface) >= 3.0,
          `${key} Glass ${theme} border vs surface = ${contrastRatio(glassBorder, surface).toFixed(2)}`
        );
        assert.ok(
          contrastRatio(ink, glassTile) >= 3.0,
          `${key} Glass ${theme} glyph vs tile = ${contrastRatio(ink, glassTile).toFixed(2)}`
        );
        assert.ok(
          contrastRatio(ink, surface) >= 3.0,
          `${key} Minimal ${theme} glyph vs surface = ${contrastRatio(ink, surface).toFixed(2)}`
        );
      }

      // 3. Solid: tile vs surface >= 3:1, glyph vs tile >= 4.5:1
      if (!FULL_SVG_SHAPES.has(shape)) {
        if (PORTED_MASK_SHAPES.has(shape)) {
          const darkSel = `:root[data-ts-theme="dark"][data-ts-checkbox-style="solid"] .rm-checkbox[data-ts-checkbox-status][data-ts-checkbox-shape="${shape}"] > .check-container > input:not(:checked) ~ .checkmark`;
          const baseSel = `:root[data-ts-checkbox-style="solid"] .rm-checkbox[data-ts-checkbox-status][data-ts-checkbox-shape="${shape}"] > .check-container > input:not(:checked) ~ .checkmark`;
          const solidBgRaw = (theme === "dark" && getDecl(darkSel, "background")) || getDecl(baseSel, "background");
          assert.ok(solidBgRaw, `missing Solid background for ${shape} ${theme}`);
          const solidTile = parseGradientMid(solidBgRaw, surface);
          const inkDarkSel = `${darkSel}::before`;
          const inkBaseSel = `${baseSel}::before`;
          const solidInkRaw = (theme === "dark" && getDecl(inkDarkSel, "background")) || getDecl(inkBaseSel, "background");
          assert.ok(solidInkRaw, `missing Solid glyph ink for ${shape} ${theme}`);
          const solidInk = parseColor(solidInkRaw, surface);
          assert.ok(
            contrastRatio(solidTile, surface) >= 3.0,
            `${key} Solid ${theme} tile vs surface = ${contrastRatio(solidTile, surface).toFixed(2)}`
          );
          assert.ok(
            contrastRatio(solidInk, solidTile) >= 4.5,
            `${key} Solid ${theme} glyph vs tile = ${contrastRatio(solidInk, solidTile).toFixed(2)}`
          );
        } else {
          const solidGradMid = avgRgb(
            mixRgb(solidAccent, WHITE, 0.14),
            mixRgb(solidAccent, SOLID_GRADIENT_SHADOW, 0.14)
          );
          assert.ok(
            contrastRatio(solidAccent, surface) >= 3.0,
            `${key} Solid ${theme} accent vs surface = ${contrastRatio(solidAccent, surface).toFixed(2)}`
          );
          assert.ok(
            contrastRatio(solidGradMid, surface) >= 3.0,
            `${key} Solid ${theme} gradient vs surface = ${contrastRatio(solidGradMid, surface).toFixed(2)}`
          );
          assert.ok(
            contrastRatio(solidOnAccent, solidAccent) >= 4.5,
            `${key} Solid ${theme} glyph vs accent = ${contrastRatio(solidOnAccent, solidAccent).toFixed(2)}`
          );
          assert.ok(
            contrastRatio(solidOnAccent, solidGradMid) >= 4.5,
            `${key} Solid ${theme} glyph vs gradient = ${contrastRatio(solidOnAccent, solidGradMid).toFixed(2)}`
          );
        }
      }

      // 4. Sticker: ALL 25 statuses + custom meet full 3:1 vs surface and 4.5:1 glyph vs tile
      if (shape === "alert") {
        const stickerAlertMid = theme === "light" ? alertStickerLightMid : alertStickerDarkMid;
        assert.ok(
          contrastRatio(stickerAlertMid, surface) >= 3.0,
          `ALERT Sticker ${theme} tile vs surface = ${contrastRatio(stickerAlertMid, surface).toFixed(2)}`
        );
        assert.ok(
          contrastRatio(WHITE, stickerAlertMid) >= 4.5,
          `ALERT Sticker ${theme} glyph vs tile = ${contrastRatio(WHITE, stickerAlertMid).toFixed(2)}`
        );
      } else if (PORTED_MASK_SHAPES.has(shape) || shape === "kawaii" || shape === "flower") {
        const darkSel = `:root[data-ts-theme="dark"][data-ts-checkbox-style="sticker"] .rm-checkbox[data-ts-checkbox-status][data-ts-checkbox-shape="${shape}"] > .check-container > input:not(:checked) ~ .checkmark`;
        const baseSel = `:root[data-ts-checkbox-style="sticker"] .rm-checkbox[data-ts-checkbox-status][data-ts-checkbox-shape="${shape}"] > .check-container > input:not(:checked) ~ .checkmark`;
        const stickerBgRaw = (theme === "dark" && getDecl(darkSel, "background")) || getDecl(baseSel, "background");
        assert.ok(stickerBgRaw, `missing Sticker background for ${shape} ${theme}`);
        const stickerTile = parseGradientMid(stickerBgRaw, surface);
        const stickerInk = theme === "light" ? WHITE : NEAR_BLACK;
        assert.ok(
          contrastRatio(stickerTile, surface) >= 3.0,
          `${key} Sticker ${theme} tile vs surface = ${contrastRatio(stickerTile, surface).toFixed(2)}`
        );
        assert.ok(
          contrastRatio(stickerInk, stickerTile) >= 4.5,
          `${key} Sticker ${theme} glyph vs tile = ${contrastRatio(stickerInk, stickerTile).toFixed(2)}`
        );
      } else {
        const stickerGradMid = avgRgb(
          mixRgb(stickerAccent, WHITE, 0.08),
          mixRgb(stickerAccent, BLACK, 0.08)
        );
        assert.ok(
          contrastRatio(stickerGradMid, surface) >= 3.0,
          `${key} Sticker ${theme} tile vs surface = ${contrastRatio(stickerGradMid, surface).toFixed(2)}`
        );
        assert.ok(
          contrastRatio(stickerOnAccent, stickerGradMid) >= 4.5,
          `${key} Sticker ${theme} glyph vs tile = ${contrastRatio(stickerOnAccent, stickerGradMid).toFixed(2)}`
        );
      }
    }
  }
});

test("status-change pop CSS is unchecked-only, non-looping, owned-scoped, and guarded for reduced motion, forced colors, and print", () => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const popHeaders = [
    ...stripped.matchAll(/([^{}@]*data-ts-status-pop[^{}@]*)\{/g),
  ].map((match) => match[1].trim());
  assert.ok(popHeaders.length >= 2, "expected status pop CSS rules");
  for (const header of popHeaders) {
    for (const selector of header.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!selector.includes("data-ts-status-pop")) continue;
      assert.match(
        selector,
        /\.rm-checkbox\.rm-todo\[data-ts-checkbox-status\]\[data-ts-status-pop="true"\]/,
        `pop selector must require .rm-checkbox.rm-todo and owned status: ${selector}`
      );
      assert.doesNotMatch(selector, /rm-done|input:checked/);
      if (selector.includes(".checkmark")) {
        assert.match(selector, /input:not\(:checked\)\s*~\s*\.checkmark/);
      }
    }
  }
  assert.match(css, /@keyframes ts-status-pop-scale/);
  assert.match(css, /@keyframes ts-status-pop-ring/);
  assert.doesNotMatch(css, /ts-status-pop-(?:scale|ring)[^;]*infinite/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?data-ts-status-pop="true"[\s\S]*?animation: none !important/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*?data-ts-status-pop="true"[\s\S]*?animation: none !important/);
  assert.match(css, /@media print[\s\S]*?data-ts-status-pop="true"[\s\S]*?animation: none !important/);
});

test("chooser glyph column and settings style preview reuse status glyphs and real checkbox CSS", () => {
  assert.match(css, /\.ts-status-chooser \.ts-status-choice-glyph\[data-task-status-key\]/);
  assert.match(css, /\.ts-status-chooser \.ts-status-choice-glyph\[data-task-status-key\]::before/);
  assert.match(css, /\.ts-status-chooser \.ts-status-choice-glyph\[data-ts-status-glyph\]::before/);
  assert.match(css, /\.ts-status-chooser \.ts-status-choice-glyph \.rm-checkbox\[data-ts-checkbox-status\]/);
  assert.match(css, /\.ts-status-chooser \.ts-status-choice-heading\s*\{/);
  assert.match(css, /\.ts-status-chooser \.ts-status-choice-footer\s*\{/);
  assert.match(css, /\.ts-style-preview\s*\{/);
  assert.match(css, /\.ts-style-preview \.rm-checkbox\[data-ts-checkbox-status\]/);
  assert.doesNotMatch(css, /\.ts-style-preview[^}]*data-ts-checkbox-style/);
});

test("ambient icon motion is gated to non-Outline styles, animates transform/opacity/filter only, and is guarded for reduced motion, forced colors, and print", () => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const expectedKeyframes = [
    "ts-spin",
    "ts-play-nudge",
    "ts-breath",
    "ts-ring-pulse",
    "ts-sheen",
    "ts-heartbeat",
    "ts-curious",
    "ts-alert-pulse",
    "ts-alert-radar",
    "ts-star-twinkle",
    "ts-sparkle",
    "ts-bug-wiggle",
    "ts-draft-write",
    "ts-hourglass-flip",
    "ts-kawaii-bounce",
    "ts-heart-float",
    "ts-flower-sway",
    "ts-sun-glow",
    "ts-moon-rock",
    "ts-status-pop-slap",
  ];
  for (const name of expectedKeyframes) {
    const start = stripped.indexOf(`@keyframes ${name}`);
    assert.notEqual(start, -1, `missing ambient keyframe @keyframes ${name}`);
    let depth = 0;
    let end = start;
    for (let i = stripped.indexOf("{", start); i < stripped.length; i += 1) {
      if (stripped[i] === "{") depth += 1;
      else if (stripped[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    const block = stripped.slice(start, end);
    const propNames = [...block.matchAll(/([a-z-]+)\s*:/gi)].map((m) => m[1].toLowerCase());
    for (const prop of propNames) {
      assert.ok(
        ["transform", "opacity", "filter"].includes(prop),
        `@keyframes ${name} may only animate transform/opacity/filter, found ${prop}`
      );
    }
  }

  const ambientHeaders = [
    ...stripped.matchAll(/([^{}@]*data-ts-ambient-motion[^{}@]*)\{/g),
  ].map((match) => match[1].trim());
  assert.ok(ambientHeaders.length >= 15, "expected ambient motion rules");
  for (const header of ambientHeaders) {
    for (const selector of header.split(",").map((part) => part.trim()).filter(Boolean)) {
      if (!selector.includes("data-ts-ambient-motion")) continue;
      assert.match(
        selector,
        /:root(?:\[data-ts-theme="dark"\])?\[data-ts-checkbox-style(?:="(?:glass|solid|minimal|sticker)")?\]\[data-ts-ambient-motion="on"\]/,
        `ambient rule must require non-Outline data-ts-checkbox-style and data-ts-ambient-motion="on": ${selector}`
      );
      assert.match(
        selector,
        /\.rm-checkbox(?:\.rm-todo)?\[data-ts-checkbox-status\]/,
        `ambient rule must stay scoped to owned checkboxes: ${selector}`
      );
      assert.match(selector, /input:not\(:checked\)\s*~\s*\.checkmark(?:$|::(?:before|after))/);
    }
  }

  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?data-ts-ambient-motion="on"[\s\S]*?animation: none !important/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*?\.checkmark::before[\s\S]*?animation: none !important/);
  assert.match(css, /@media print[\s\S]*?\.checkmark::before[\s\S]*?animation: none !important/);
});

test("no upstream BetterTask bt- identifiers, Thymer classes, or forbidden :is() selectors exist in src/", async () => {
  const strippedCss = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(strippedCss, /:is\(/, "upstream :is() selectors must be rewritten");
  assert.doesNotMatch(
    strippedCss,
    /\b(?:listitem-task|listitem|line-check-div|state-done|state-started|state-blocked|state-canceled|state-alert)\b/,
    "Thymer classes must not appear in CSS"
  );

  // Only Roam Better Tasks' own pre-existing identifiers may use the bt- prefix in src/.
  const ALLOWED_ROAM_BT_IDENTIFIERS = new Set(["bt-pill", "bt-theme-dark", "bt-theme-light"]);
  const srcDirUrl = new URL("../src/", import.meta.url);
  const srcFiles = (await readdir(srcDirUrl)).filter((name) => /\.(?:js|css|mjs)$/.test(name));
  assert.ok(srcFiles.length > 0, "expected src files");
  for (const filename of srcFiles) {
    const content = await readFile(new URL(filename, srcDirUrl), "utf8");
    const matches = [...content.matchAll(/--?bt-[a-z0-9-]+|\bbt-[a-z0-9-]+\b/gi)].map((m) => m[0]);
    for (const token of matches) {
      assert.ok(
        ALLOWED_ROAM_BT_IDENTIFIERS.has(token),
        `unexpected BetterTask bt- identifier "${token}" in src/${filename}`
      );
    }
  }
});
