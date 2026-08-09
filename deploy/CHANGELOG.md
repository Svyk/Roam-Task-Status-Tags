# Changelog

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
