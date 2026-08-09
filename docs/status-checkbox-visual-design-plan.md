# Status-aware checkbox visual design plan

Date: 2026-08-08
Target release: Task Status Tags v0.3.0
Scope: planning and research only; this document does not implement the feature.

## Decision

Implement the feature in **Task Status Tags**, not in Svy Theme.

Task Status Tags owns the status vocabulary, configured status colors, managed-prefix
rules, and lifecycle. Svy Theme should remain an optional token provider. This keeps the
feature correct when Svy Theme is absent and prevents a theme from acquiring workflow
semantics that belong to the plugin.

Better Tasks remains the only authority for task creation, deletion, recurrence,
metadata, and completion. The new code will decorate Roam's existing checkbox; it will
not replace the input, intercept its event, write task state, or infer a second kind of
completion.

## Research constraints

The visual design follows these findings:

- A checkbox represents checked, unchecked, and—when intentionally implemented—mixed.
  Status decoration must not resemble a second checkmark or an indeterminate dash in the
  center of an unchecked checkbox. See the
  [WAI-ARIA checkbox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/).
- A visible control boundary and state indicator should reach at least 3:1 contrast
  against adjacent colors. Thin anti-aliased lines merit some margin above the numeric
  minimum. See [WCAG 2.2 non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast).
- Color cannot be the only visual carrier of status. The existing text pill plus a
  status-specific outline/ornament supplies redundant meaning. See
  [WCAG use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).
- Pointer targets should reach 24 by 24 CSS pixels when the layout permits, without
  enlarging the visible square or shifting block text. See
  [WCAG target size (minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).
- Semantic color should be used deliberately, with dedicated light/dark token values.
  See [Fluent 2 color](https://fluent2.microsoft.design/color),
  [Carbon color tokens](https://carbondesignsystem.com/elements/color/overview/), and
  [Atlassian design tokens](https://atlassian.design/tokens/design-tokens).
- Small status symbols should be simple, consistent, and supported by text. See
  [Atlassian iconography](https://atlassian.design/foundations/iconography).
- Motion should provide useful feedback, not decoration, and must respect reduced-motion
  preferences. See [Apple motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion).

## Current palette audit

The existing configured base colors cannot be copied directly to a control border. The
ratios below are WCAG contrast ratios for each default base color against the relevant
Svy Theme canvas colors.

| Status | Base color | On light `#fff` | On dark `#182026` | Result |
|---|---:|---:|---:|---|
| Active | `#14b8a6` | 2.49:1 | 6.63:1 | needs a darker light-mode accent |
| Waiting | `#eab308` | 1.92:1 | 8.60:1 | needs a darker light-mode accent |
| Holding | `#94a3b8` | 2.56:1 | 6.43:1 | needs a darker light-mode accent |
| Incubating | `#6366f1` | 4.47:1 | 3.69:1 | passes both canvases |
| Alert | `#f43f5e` | 3.67:1 | 4.49:1 | passes both canvases |
| Cancelled | `#1e293b` | 14.63:1 | 1.13:1 | needs a lighter dark-mode accent |

Implementation must therefore separate the user-facing base hue from the rendered
checkbox accent. For each built-in or custom status, derive a light-mode and dark-mode
accent by adjusting lightness toward the nearest 3.2:1-or-better result while preserving
hue and as much chroma as practical. The 3.2 target gives a small anti-aliasing margin
over WCAG's 3:1 requirement.

## Visual language

The central 10-by-10-ish interior of the native 16px square is reserved for Roam's
completion checkmark. Status appears in the border and a tiny top-right ornament that
sits on or just outside the corner. All ornaments use `pointer-events: none`.

| Status | Meaning | Unchecked checkbox treatment | Shape cue |
|---|---|---|---|
| Active | work underway now | contrast-safe teal solid outline, very light teal wash | small filled circular beacon at the top-right corner |
| Waiting | blocked on another person/event | contrast-safe amber solid outline, very light amber wash | two narrow parallel bars in the corner ornament |
| Holding | deliberately paused | contrast-safe slate outline, neutral surface | dashed outline with a short horizontal corner tab |
| Incubating | saved for later development | contrast-safe violet dotted outline, very light violet wash | hollow circular corner ornament |
| Alert | requires attention | contrast-safe rose outline with the strongest visual weight | small diamond corner ornament; never a repeating pulse |
| Cancelled | intentionally abandoned | muted contrast-safe charcoal/slate outline and reduced wash | short diagonal corner slash; no central X |
| Custom | user-defined status | derived contrast-safe configured hue and light wash | generic solid outline plus a small square corner marker |

The shapes are intentionally modest. The adjacent status pill remains the primary text
label, so the checkbox does not have to carry the full meaning alone.

### Checked state

When the native input is checked:

1. Roam/Svy Theme's completion fill and white checkmark remain dominant.
2. The status ornament becomes secondary (lower opacity or an outer one-pixel ring).
3. Nothing covers, replaces, recolors, or geometrically changes the checkmark.
4. Toggling the checkbox behaves exactly as it does without Task Status Tags.

This rule prevents `Cancelled`, `Waiting`, or `Holding` from being confused with a
completion state.

### Interaction states

- Preserve the native 16px visual footprint and baseline alignment.
- Where the live Roam DOM permits it without overlap, expand only the label's invisible
  click area to 24px; do not enlarge the drawn box or shift the text.
- Keep hover feedback to color, background, and box-shadow changes over 120–150ms.
- Preserve or strengthen `:focus-visible` with a 2px outer focus ring based on
  `--svy-accent` (with Blueprint/Roam fallbacks). Never suppress the native focus state.
- Under `prefers-reduced-motion: reduce`, remove all transitions.
- Under `forced-colors: active`, use `currentColor`, allow system color adjustment, and
  favor outline/border shape over authored fills.

## DOM and CSS ownership

### Exact marker

Annotate the exact rendered native checkbox span, not the graph block and not a broad
ancestor:

```html
<span class="rm-checkbox rm-todo" data-ts-checkbox-status="ACTIVE">…</span>
```

This prevents a parent block's status from leaking into nested child checkboxes. The
attribute is owned by Task Status Tags and must be removed on status change, tag removal,
DOM recycling, setting disablement, and extension unload.

The marker is applied only when all of the following are true:

1. The rendered status ref maps to a currently configured status.
2. The ref occupies the plugin's managed prefix slot in the fresh/live block string.
3. The same rendered block contains the exact native TODO/DONE checkbox being marked.

A `task-status/...` reference later in prose must remain an ordinary link and must not
style the checkbox.

### Selector shape

Use cheap extension-owned selectors such as:

```css
.rm-checkbox[data-ts-checkbox-status="ACTIVE"] > .check-container > .checkmark { … }
```

Do not use a document-wide `:has()` selector, a substring match over block text, or a
generic `.checkmark` override. The plugin's MutationObserver should queue only affected
render roots after the initial scan, then resolve and annotate the exact checkbox. It
should not rescan the whole document after every unrelated mutation.

### Svy Theme contract

Task Status Tags will consume, but never redefine, Svy Theme's public variables:

- surfaces: `--svy-canvas`, `--svy-surface`
- interaction/focus/completion: `--svy-accent`
- neutral structure: `--svy-border-strong`, `--svy-text-muted`
- semantic fallbacks where appropriate: `--svy-danger`, `--svy-warning`

Every use gets a Blueprint/Roam/static fallback, so the plugin is visually complete
without Svy Theme. User-configured status colors remain authoritative over default hues;
Svy supplies surfaces, contrast context, and interaction tokens rather than replacing
the status palette.

Support all five established dark signals:

1. `:root.bp3-dark`
2. `body.bt-theme-dark`
3. `.rm-dark-theme`
4. `body.roam-body.dark`
5. `@media (prefers-color-scheme: dark)` guarded by `:root:not(.bp3-light)`

No Svy Theme repository change is required for v0.3.0. If testing exposes a genuinely
missing general-purpose public token, add it separately to Svy Theme only after proving
that it benefits more than this plugin.

## Implementation plan

### Phase 1 — Testable annotation boundary

Add a small pure helper module (proposed: `src/status-checkbox.js`) that:

- resolves the exact checkbox belonging to a rendered status pill;
- receives the block UID/string and configured status map as inputs;
- returns an annotation decision without writing to the graph;
- applies/removes only `data-ts-checkbox-status` and any one owned style marker;
- supports page views, sidebar views, block references, and recycled DOM nodes;
- deduplicates fresh block-string reads by UID within a refresh batch.

Integrate it with the current status-pill observer. Replace the observer's repeated
whole-document refresh with an initial full scan plus a coalesced set of affected render
roots.

### Phase 2 — Contrast-aware status tokens

Extend the existing status-color derivation path rather than creating a second color
configuration system:

- keep the stored base/text color schema unchanged;
- derive separate checkbox accents for light and dark surfaces;
- certify at least 3.2:1 against the resolved adjacent surface;
- retain hue while adjusting lightness; fall back to a known accessible neutral if the
  configured color cannot be parsed or certified;
- emit variables for checkbox accent, wash, ornament, and checked-state outer ring;
- regenerate values on status-color setting changes and effective theme changes.

### Phase 3 — Scoped checkbox CSS

Add the base checkbox rule and the six built-in shape modifiers to `src/extension.css`.
Use `.checkmark::before` only for the corner ornament; preserve Roam/Svy Theme's existing
`.checkmark::after` checkmark geometry. Add the generic custom-status treatment.

Add one setting, **Style native checkboxes by task status**, default on. Turning it off
removes all checkbox markers and leaves status pills unchanged.

### Phase 4 — Build and documentation

- Update README with a checked/unchecked, light/dark visual matrix and the ownership
  statement that this is cosmetic only.
- Add a v0.3.0 changelog entry.
- Rebuild the root and `deploy/` artifacts using the existing build pipeline.
- Do not hand-edit generated artifacts.

## Test plan

### Automated behavior tests

- Managed prefix status annotates exactly one checkbox.
- A status reference later in prose annotates none.
- Parent status never styles a child checkbox.
- Multiple rendered block refs are annotated independently.
- Status replacement updates the marker without a stale frame.
- Status removal, custom-status deletion, setting disablement, DOM recycling, and unload
  remove the marker.
- Custom status colors produce certified light/dark checkbox tokens.
- Invalid custom colors fail to an accessible neutral.
- Annotation and styling perform zero Roam graph writes and install zero checkbox event
  handlers.
- Better Tasks present, absent, loaded first, loaded second, reloaded, and unloaded all
  produce the same checkbox behavior.

### Visual acceptance matrix

Capture every built-in status in:

- unchecked and checked states;
- Svy Theme light, dark, and auto modes;
- bare Roam light and dark modes;
- main page, right sidebar, block reference, and zoomed block contexts;
- default and custom status colors;
- browser zoom at 80%, 100%, 125%, and 200%;
- forced-colors/high-contrast and reduced-motion modes.

Acceptance requirements:

- each control boundary/focus indicator reaches at least 3:1 against its adjacent
  surface;
- all six statuses remain distinguishable in grayscale because their shapes differ;
- the status pill and checkbox use the same hue family;
- the checkmark is fully legible for every status and theme;
- keyboard focus, Space activation, pointer activation, and undo behavior are unchanged;
- no layout shift, clipped ornament, nested-selector leak, or sidebar mismatch;
- no sustained animation or pulsing.

### Performance acceptance

- No broad `:has()` or document-wide text selector is introduced.
- After initial load, observer work is proportional to changed render roots rather than
  total document size.
- Record mutation-batch counts and forced-style/reflow measurements during 100 edits in
  a long page, with the feature on and off.
- Typing, opening the slash menu, and opening the status chooser show no meaningful
  regression; investigate any repeated long task or forced-layout spike.

## Release gate

Ship v0.3.0 only after:

1. `npm ci` succeeds with no dependency drift.
2. `npm run check` passes, including deterministic generated-artifact verification.
3. The full visual matrix passes in a disposable Roam graph.
4. Better Tasks contract tests stay green and no Better Tasks source change is needed.
5. Svy Theme light/dark/auto acceptance passes with the same plugin build.
6. The final commit is signed, the branch is clean, and the GitHub Pages artifact matches
   the tested commit byte-for-byte.
