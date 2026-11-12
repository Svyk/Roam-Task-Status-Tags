# Changelog

## 0.14.0 — 2026-11-11

- New read-only **Watching now** panel: open tasks grouped by status, each row showing the task, its status icon, and its episode (`S2E5`) when it has an `Episode::` block. An unreadable or duplicate `Episode::` shows `?`.
- It opens at the top of Roam's right sidebar, opening the sidebar if needed. Closing the sidebar closes the view; if the view opened the sidebar and no other window is there, closing the view closes the sidebar again. If the sidebar cannot be used, it floats at the right edge instead.
- Open it with the command palette entry `Task Status: Watching now` (toggles it) or the chooser item `Watching now…` below Remove status.
- Filter: **Media** (default), **Tasks** or **All**, kept for the session. Order is by status name: Watching, Watchlist, Upcoming, Series, Rewatch, other media statuses, Dropped last; Alert first and Cancelled last among task statuses. Empty groups are hidden; newest edit first inside a group.
- Rows act like a block ref: click opens the task in the main window, Shift+click (or Shift+Enter) opens it in the sidebar, below the panel. Links inside the text work as in Roam. It is not a native `((ref))` (no hover preview).
- Read-only: it never writes to the graph. DONE tasks are not listed. Escape or the close button closes it. Roam's shortcuts do not fire while it has focus.
- It refreshes on status changes made through this extension and on episode clicks. Edits typed by hand, or completing a task in Roam, show after Refresh or reopening (no polling).
- A panel docked in the right sidebar, not a query page: a query page would write blocks into your graph, could not follow the status order or show the episode, and the filter would mean editing the query.

## 0.13.0 — 2026-11-11

- A task with the status **Series**, **Watching** or **Rewatch** (open or done) shows a small episode counter like `S2E5` right after its status.
- Click it for the next episode. Alt-click, right-click, Shift+F10 or the ContextMenu key opens a menu: **Next episode**, **New season** (season + 1, episode 1), or set the season and episode yourself (fields marked S and E).
- Before it is first used the counter is a single small `+` that appears when you hover the row (always faintly visible on touch screens). It takes no width (the `+` sits in the space after the status), so a task that never uses it looks as before and nothing shifts. A set counter is wide enough for `S9E99`, so E9 to E10 does not move anything.
- The value is stored as a plain child block of the task, `Episode:: S2E5`, created only when you first use the counter. Edit that block by hand and the counter follows. The block may have extra lines under its first one; only the value on the first line changes. If its value is not `S<number>E<number>`, or the task has two `Episode::` blocks, the counter shows `?` and nothing is written.
- Better Tasks has no API for custom attributes (its `bt_modify` only knows its own), so the `Episode::` block is written directly: it is created, or its text is changed in place (same uid). Better Tasks ignores unknown attributes. No Better Tasks attribute and no task text is touched, and nothing is written to tasks that never use the counter.
- Each change adds one line to the task's existing Better Tasks activity log (`episode → S2E6`), only into a log that already exists, never duplicated.
- Fast double clicks count twice and never create a second `Episode::` block. A write that cannot be confirmed puts the counter back to what the graph says.
- Clicks on the counter never enter Roam's edit mode or open the status chooser. Roam's shortcuts do not fire while its menu has focus.

## 0.12.0 — 2026-11-11

- Picking **Waiting** or **In Review** in the status chooser on an open Better Tasks task now asks when to check back: **Tomorrow**, **In 3 days**, **Next week**, a date field, or **Skip**.
- The date is written as the task's Better Tasks due date through Better Tasks' own `bt_modify`: the existing due block changes in place (same uid), in your Better Tasks date format, with its own activity-log line. One call; the due block is read again to confirm.
- An existing due date is shown first as **Keep due <date>**; any other choice replaces it. A repeating task says that a date moves the series' due date.
- No prompt when the due date sits under a Better Tasks alias name (Better Tasks would add a second due block), and nothing is written if the task was completed before a date was picked.
- Skip, Keep, Escape, or a click outside write nothing more. Roam's shortcuts do not fire while the prompt has focus.
- No prompt without Better Tasks, for a DONE task, a plain block, several selected blocks, or a slash command or palette command.
- New setting `Ask for a follow-up date on Waiting / In Review` (on by default).

## 0.11.0 — 2026-11-11

- A new occurrence of a repeating Better Tasks task now starts with no status. Better Tasks copies the old text, so the previous `task-status/<Name>` tag used to come along.
- The media statuses (Series, Movie, Watching, Watchlist, Upcoming, Rewatch, Dropped) carry over by default. Change the list in the new setting "Statuses kept on the next repeat" (comma-separated, any case; empty means nothing carries over).
- The tag is removed with one write through Better Tasks' own `requestStatusTag`. The completed block is never touched.
- Needs Better Tasks v2. Without it nothing is written (fails closed).
- Only a block born with the tag that also carries Better Tasks' series props is touched, so a task you type yourself keeps its status.

## 0.10.0 — 2026-11-11

- Add seven media statuses for a watch list: **Series**, **Movie**, **Watching**, **Watchlist**, **Upcoming**, **Rewatch**, and **Dropped**. Each has its own checkbox glyph (TV, clapperboard, disc with play triangle, bookmark, calendar, loop arrows, eject) and a matching marker on the status pill, peek control, and settings preview.
- A status you added by hand called Series, Movie, and so on gets the same glyph by name (any case). It keeps its own key, tag, and colour, and like the other media statuses it is left out of click-to-cycle.
- Existing installs get the seven once, appended after the task statuses, through `defaults-version` 3. Any whose key or name already exists is skipped, and none is re-added after you delete it. New installs start with all fourteen.
- Click-to-cycle, the `Task Status: Cycle` command, and the API `cycle` walk the task statuses only. Media statuses are still set from the chooser, slash commands, and palette; cycling from a media status starts at the first task status.
- The chooser lists the task statuses first, then a divider and the media statuses.
- API `statuses()` rows carry `glyph: "series"`, `"movie"`, and so on for media statuses, including a hand-added one.

## 0.9.1 — 2026-10-06

- A status change on a Better Tasks task now adds one line to that task's Better Tasks activity log (`2026-10-06 18:05 — status → Waiting`, or `status removed`), written in one step with Better Tasks' event props, so one undo takes it back. Better Tasks itself does not log status changes made through its router.
- The line is only added to an activity log Better Tasks already created, never twice in a row, and not at all when Better Tasks starts reporting the activity itself. The task string and its other children are never touched.
- `setStatus` results include `activity: { recorded, reason }` on an update.

## 0.9.0 — 2026-10-06

- Add `window.RoamTaskStatusTags` (`apiVersion` 1) so another extension can read the configured statuses and ask this extension to set or cycle one.
- `statuses()` re-reads settings on every call and returns each status with its tag, glyph, and the same light and dark pill colours the outline uses. The default catalog includes In Review.
- `setStatus` and `cycle` use the same certified writer as the palette, including the Better Tasks router. A plain TODO gains exactly one `#[[task-status/<Name>]]` after `{{[[TODO]]}}`; `null` removes only that tag.
- Dispatch `roam-task-status-tags:ready` on install and `roam-task-status-tags:unload` on unload. The `statuses` event fires when a status is renamed, recoloured, or reordered. The global is removed on unload only while it is still this extension's object.

## 0.8.0 — 2026-10-06

- Add a built-in **In Review** status (`#[[task-status/In Review]]`) for work waiting on someone's review or sign-off. It sits after Waiting in the default order, with its own sky-blue palette and a half-filled circle glyph on both checkbox and pill.
- Existing installs get In Review once, after Waiting (or at the end if Waiting was removed), through a new `defaults-version` setting. It is skipped if a status named In Review already exists and never re-added after you delete it.
- Add coverage for the two-word status name, the migration, and the new contrast and glyph rules.

## 0.7.0 — 2026-08-09

- Move the checkbox-only reveal control and full status chooser into the quiet gutter immediately left of the current block bullet, keeping task text unobstructed.
- Resolve the current block's bullet from DOM structure only, without adding hover graph reads or touching Roam's native completion path.
- Fall back above or below the bullet only when a narrow viewport or long custom label cannot fit safely in the left gutter, with viewport clamping in every placement.
- Restyle the portaled chooser with Svy Theme's public overlay, border, hover, selected, text, accent, radius, and font tokens while retaining complete bare-Roam light/dark fallbacks.
- Add a compact current-state treatment, themed arrow, destructive-action styling, visible keyboard focus, and forced-colors support, all scoped to extension-owned UI.
- Add pure geometry, current-bullet ownership, nested-block isolation, theme-token, accessibility, and browser visual regression coverage.

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
