# Changelog

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
