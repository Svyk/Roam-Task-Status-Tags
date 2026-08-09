# Changelog

## 0.6.2 — 2026-08-09

- Fix the remaining graph freeze when hovering or completing an Alert task.
- Make hover/focus resolution DOM-only by binding every certified checkbox annotation to its block UID; status writes still revalidate from fresh graph state.
- Ignore Task Status Tags' own portal and unrelated body mutations instead of re-entering status refresh when the hover control is created or removed.
- Remove the native checkbox `change` bridge entirely. Roam's `rm-todo` / `rm-done` state now gates the Alert animation directly in CSS, so completion runs zero Task Status Tags JavaScript.
- Move the checkbox halo from paint-heavy animated outlines to an opacity/transform-only ring, and keep the portaled hover control static.
- Add regression gates for zero completion listeners, graph-read-free hover, UID-bound annotations, scoped observer refresh, and browser stress across 2,000 completion transitions and 2,000 hover crossings.

## 0.6.1 — 2026-08-09

- Fix Roam freezing when an Alert checkbox is completed or reopened.
- Let Roam finish its native completion event before Task Status Tags mirrors the checked state into its already-certified Alert markers.
- Remove synchronous graph pulls and full DOM re-certification from the native checkbox event path while preserving immediate checkbox, pill, and reveal-control updates.
- Add regression coverage and a 1,000-transition browser stress fixture for the lightweight completion bridge.

## 0.6.0 — 2026-08-09

- Add an eye-catching Alert beacon: two brief rose halo beats followed by a long quiet interval on the exact unchecked Alert checkbox.
- Echo the beacon on the certified persistent Alert pill and the checkbox-only hover/focus control without animating query results or later-prose Alert references.
- Stop the beacon immediately when the native checkbox is completed, and keep checked tasks, reduced-motion, forced-colors, and print fully still.
- Add an **Animate Alert status** switch, enabled by default; changing it is presentation-only and writes no Roam or Better Tasks data.
- Derive light and dark beacon colors from configured status colors, retaining Svy Theme compatibility and exact unload/reload cleanup.

## 0.5.0 — 2026-08-09

- Add the recommended **Checkbox only — reveal on intent** display mode while preserving the exact queryable `task-status/<Name>` graph token.
- Hide only a certified managed-prefix page reference after the exact sibling checkbox has successfully taken ownership; ambiguous, unreadable, later-prose, disabled, and missing-checkbox renders fail visible.
- Reveal one portaled status control after intentional hover or immediately on keyboard focus, reusing the existing chooser and certified Better Tasks-aware write path.
- Open the chooser with `Enter` or `Alt+ArrowDown`, preserve native checkbox click and `Space`, and retain Shift+click removal, multiselect, slash, palette, and context-menu power.
- Add Svy Theme and bare-Roam light/dark styling, semantic glyphs, focus-visible, reduced-motion, forced-colors, narrow viewport positioning, ARIA token preservation, and exact lifecycle cleanup.
- Add a persistent **Checkbox + status pill** fallback mode; disabling native checkbox styling always restores visible labels without writing graph data.

## 0.4.0 — 2026-08-08

- Redesign unchecked task checkboxes with centered, semantic workflow glyphs: play, pause, stop, ring, exclamation, X, and diamond.
- Remove the workflow glyph immediately when a task is checked so Roam or Svy Theme exclusively owns the completion checkmark.
- Repeat the same glyph language in status pills and preserve every shape in forced-colors mode.
- Keep all styling scoped to extension-owned markers with no new event handlers or graph writes.

## 0.3.1 — 2026-08-08

- Add paired, contrast-certified light and dark colors for status pills, including custom colors and text overrides.
- Fix Cancelled and other dark base hues disappearing against Svy Theme's dark canvas.
- Repeat each checkbox's shape cue in the adjacent status pill for clearer, color-independent scanning.
- Use Svy Theme's public tag geometry and surface tokens when present while retaining bare-Roam fallbacks.

## 0.3.0 — 2026-08-08

- Add status-aware styling to the exact native TODO/DONE checkbox.
- Give every built-in status a distinct static shape as well as its configured color.
- Derive contrast-safe light and dark checkbox accents from built-in and custom colors.
- Consume Svy Theme's public surface and accent tokens without making the theme a dependency.
- Preserve the host theme's checked fill, checkmark geometry, keyboard behavior, and Better Tasks ownership.
- Add an on/off setting, reduced-motion and forced-colors support, exact unload cleanup, and an incremental render-scoped observer.

## 0.2.1 — 2026-08-08

- Register slash commands through Roam's extension-scoped Developer Extension API.
- Advertise the bundled release version even when Roam reports a developer build as `DEV`.
- Restore slash-command activation with Better Tasks on current Roam block DOM.

## 0.2.0 — 2026-08-08

- Add a fail-closed Better Tasks compatibility boundary.
- Preserve TODO/DONE state when applying or removing workflow status tags.
- Add lifecycle, build-integrity, artifact-drift, CI, Pages, and secret-scan gates.

## 0.1.0 — 2026-05-18

- Upstream task status tags baseline by Harpreet Singh Chima.
