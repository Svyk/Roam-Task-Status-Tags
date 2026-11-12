# Roam Task Status Tags

Roam Task Status Tags keeps Roam's native `{{[[TODO]]}}` behavior and adds one managed status tag on the same line.

Example:

```text
{{[[TODO]]}} #[[task-status/Active]] Call landlord about repairs
```

## Key Idea

- TODO remains TODO, so Roam's native TODO/DONE behavior and TODO queries still work.
- Status is stored only as a namespaced Roam tag: `#[[task-status/<Name>]]`.
- Unnamespaced tags like `#[[Active]]` and old macro-style statuses are not managed by this extension.
- Statuses are configurable in the extension settings.

## Behavior

- The recommended **Checkbox only — reveal on intent** mode keeps task lines quiet at rest: only the status-aware native checkbox and task text are visible.
- Hover or focus that checkbox to reveal a compact status control in the quiet gutter left of the current block bullet. Click it, or press `Enter` / `Alt+ArrowDown` on the focused checkbox, to open the full chooser in the same gutter without covering task text.
- Shift+click the revealed control to remove the status while keeping TODO.
- Ordinary checkbox click and `Space` remain Roam's native complete/reopen interactions.
- **Checkbox + status pill** mode keeps the persistent v0.4-style label and its click/Shift+click interactions.
- Unchecked Alert tasks use a brief two-beat attention halo followed by a long quiet interval. The effect can be disabled in settings.
- TODO/DONE remains authoritative. Status edits never complete or reopen an existing task.
- Completing a task preserves its last status tag; remove it explicitly when desired.
- Better Tasks-owned tasks route status writes through `window.betterTasks.v2`.
- Ambiguous or legacy Better Tasks ownership fails closed instead of performing a raw write.
- Selected-block commands apply to the selected blocks only.
- Status editing is token-aware: it changes the managed TODO/status prefix and preserves the rest of the block text as much as possible.

## Status-aware Checkboxes

Task Status Tags gives the exact native checkbox beside a managed status a compact
color-and-shape treatment. The checkbox is still Roam's real checkbox: this feature
does not replace it, intercept it, or create another completion state.

| Status | Light mode, unchecked | Dark mode, unchecked | Checked |
|---|---|---|---|
| Active | Darkened teal outline + centered play symbol | Teal outline + centered play symbol | Native theme checkmark |
| Waiting | Darkened amber outline + centered pause symbol | Amber outline + centered pause symbol | Native theme checkmark |
| In Review | Darkened sky-blue outline + centered half-filled circle | Sky-blue outline + centered half-filled circle | Native theme checkmark |
| Holding | Darkened slate dashed outline + centered stop symbol | Slate dashed outline + centered stop symbol | Native theme checkmark |
| Incubating | Violet dotted outline + centered ring | Adjusted violet dotted outline + centered ring | Native theme checkmark |
| Alert | Rose strong outline + centered exclamation mark | Rose strong outline + centered exclamation mark | Native theme checkmark |
| Cancelled | Charcoal outline + centered X | Lightened slate outline + centered X | Native theme checkmark |
| Series | Fuchsia outline + centered TV | Fuchsia outline + centered TV | Native theme checkmark |
| Movie | Darkened orange outline + centered clapperboard | Orange outline + centered clapperboard | Native theme checkmark |
| Watching | Darkened green outline + centered disc with play triangle | Green outline + centered disc with play triangle | Native theme checkmark |
| Watchlist | Pink outline + centered bookmark | Pink outline + centered bookmark | Native theme checkmark |
| Upcoming | Azure outline + centered calendar | Azure outline + centered calendar | Native theme checkmark |
| Rewatch | Darkened lime outline + centered loop arrows | Lime outline + centered loop arrows | Native theme checkmark |
| Dropped | Rust-brown outline + centered eject symbol | Lightened tan outline + centered eject symbol | Native theme checkmark |
| Custom status | Contrast-adjusted configured hue + centered diamond | Contrast-adjusted configured hue + centered diamond | Native theme checkmark |

When a task is checked, the workflow glyph disappears completely and the active
Roam/Svy Theme completion fill and checkmark become authoritative. Its retained status
is still available by hovering or focusing the checkbox; persistent-pill mode keeps the
label visible instead.

Checkbox accents are derived separately for light and dark surfaces with a minimum
3.2:1 contrast target. Svy Theme users get its public surface and focus tokens; bare
Roam and other themes use safe fallbacks. Reduced-motion and forced-colors modes are
supported.

The reveal control and chooser are portaled so Roam cannot clip them, but they resolve
the current block's own bullet from DOM structure and open entirely to its left whenever
the available gutter can contain them. On a narrow viewport—or when a long custom status
name makes the chooser too wide—they fall back above or below and remain clamped on
screen. The chooser consumes Svy Theme's public overlay, border, hover, selected, text,
accent, radius, and font tokens; complete light/dark fallbacks keep it usable without
Svy Theme. This positioning and hover path performs no graph reads.

Status pills use their own paired light/dark palette with at least 4.8:1 text contrast.
The small pill marker repeats the checkbox cue (play, pause, stop, ring, exclamation, X, diamond, or one of the media glyphs),
making statuses readable by shape as well as color. Dark base colors such as Cancelled
are automatically lightened on Svy Theme's dark canvas without changing the configured
hue used in light mode.

### Alert beacon

Alert is intentionally more noticeable than the other workflow states without becoming
a constant strobe. The exact unchecked Alert checkbox pulses twice during the first
1.25 seconds of a 5.2-second cycle, then remains quiet. In persistent-pill mode the
certified Alert pill repeats the same rhythm. The hover/focus status control stays static
so revealing or using it never starts another animation.

The beacon is enabled by default under **Task Status Tags → Animate Alert status**.
Turning it off changes presentation only and performs no graph writes. Checked tasks
never pulse, and the animation is disabled automatically for `prefers-reduced-motion`,
forced-colors mode, and print. Query results, later-prose Alert references, ambiguous
renders, and other unowned tags never receive animation ownership. Roam's native
`rm-todo` / `rm-done` state gates the pulse directly in CSS: Task Status Tags installs no
checkbox completion listener and runs no JavaScript when the task is completed or reopened.
Hover/focus reads only the already-certified checkbox annotation, never the graph; every
eventual status write still performs its own fresh graph precondition.

### Quiet display without losing query power

Checkbox-only mode changes presentation only. A Waiting task still stores exactly:

```text
{{[[TODO]]}} #[[task-status/Waiting]] Call supplier
```

The namespaced page reference remains available to Roam queries, backlinks, search,
exports, and Better Tasks. The raw token is visible while editing. The plugin hides only
the exact rendered managed-prefix tag after it has successfully styled the exact sibling
checkbox; later-prose tags, ambiguous renders, and query results without a proven
checkbox remain visible.

## Default Statuses

- Active
- Waiting
- In Review
- Holding
- Incubating
- Alert
- Cancelled

Media statuses, listed after the task statuses:

- Series
- Movie
- Watching
- Watchlist
- Upcoming
- Rewatch
- Dropped

Default order:

```text
Active -> Waiting -> In Review -> Holding -> Incubating -> Alert -> Cancelled -> Series -> Movie -> Watching -> Watchlist -> Upcoming -> Rewatch -> Dropped
```

Click-to-cycle and `Task Status: Cycle` walk the task statuses only; media statuses are
set from the chooser (shown below a divider), slash commands, or the palette. A status you
add yourself named Series, Movie, Watching, Watchlist, Upcoming, Rewatch, or Dropped gets
the matching glyph by name, keeps its own key and colour, and is left out of click-to-cycle like the other media statuses. Existing installs get the media
statuses once, appended at the end, unless a status with that name already exists.

You can add, rename, delete, and reorder statuses in settings.

## Usage

Slash commands:

- Type `/` and pick `task status: <StatusName>`.

Command palette and Roam hotkeys:

- `Task Status: Set <StatusName>`
- `Task Status: Cycle`
- `Task Status: Remove`

Block context menu:

- Right click a TODO block -> `Plugins -> Task Status: Set ...`

Selected blocks:

- Select multiple blocks in Roam, then use a `Task Status: Set ...` command, multiselect context menu command, or the status chooser.
- The command palette supports Roam individual multiselect and drag/blue multiselect.

## Repeating Better Tasks tasks

When Better Tasks creates the next occurrence of a repeating task, the new task starts with no status. Better Tasks copies the completed task's text, so the old `task-status/<Name>` tag would otherwise come along.

- Media statuses (Series, Movie, Watching, Watchlist, Upcoming, Rewatch, Dropped) carry over by default. Edit the setting `Statuses kept on the next repeat` (comma-separated, any case; empty means nothing carries over).
- The tag is removed with one write through Better Tasks' own `requestStatusTag`. The completed task is never touched.
- Requires Better Tasks v2; without it nothing is written.
- Only a block born with the tag that also carries Better Tasks' series props is touched. A task you type yourself keeps its status.

## Follow-up date for Waiting and In Review

Pick **Waiting** or **In Review** in the status chooser on an open Better Tasks task, and the chooser asks when to check back.

- Choices: **Tomorrow**, **In 3 days**, **Next week**, a date field with **Set**, and **Skip**.
- The date becomes the task's Better Tasks due date (`BT_attrDue`, or whatever due attribute you set in Better Tasks). It is written through Better Tasks' own `bt_modify`, which changes the existing due block in place (same uid), uses your Better Tasks date format, and logs the change in its activity log.
- If the task already has a due date, the first choice is **Keep due <date>**. Any other choice replaces it.
- A repeating task says so in the prompt: a new date moves the series' due date.
- Picking Waiting on a task that is already Waiting still asks.
- A due date stored under one of Better Tasks' due aliases gets no prompt: Better Tasks would add a second due block instead of changing it.
- **Skip**, **Keep**, Escape, or a click outside write nothing more. The status is already set.
- Arrow keys move, Enter picks, Escape cancels. Roam's shortcuts do not fire while the prompt has focus.
- Only from the chooser, only for one task at a time, and only when Better Tasks is present. A DONE task, a plain block, or several selected blocks get no prompt.
- Turn it off with the setting `Ask for a follow-up date on Waiting / In Review`.

## Episode counter for Series, Watching and Rewatch

A task whose status is **Series**, **Watching** or **Rewatch** (open or done) shows a small counter such as `S2E5` right after its status.

- Click, Enter or Space: next episode. The first click on a task that has no counter creates `S1E1`.
- Alt-click, right-click, Shift+F10 or the ContextMenu key: a menu with **Next episode**, **New season** (season + 1, episode 1), and season (S) and episode (E) fields with **Set**. Escape or a click outside writes nothing.
- Before first use the counter is a single small `+` that appears when you hover the row (faintly visible all the time on touch screens). It keeps its size, so it leaves no gap and nothing shifts.
- The value is a plain child block of the task: `Episode:: S2E5`, created only the first time you use the counter. Edit it by hand and the counter follows. Extra lines under the first line are kept; only the first line's value changes. A value that is not `S<number>E<number>`, or two `Episode::` blocks on one task, shows `?` and is never overwritten.
- Better Tasks has no API for custom attributes, so this one block is written directly: created, or changed in place (same uid). Better Tasks attributes and the task text are never touched.
- Each change adds one line to the task's existing Better Tasks activity log (`episode → S2E6`). It never creates a log and never repeats a line.
- Fast double clicks count twice. A write that cannot be confirmed puts the counter back to what the graph says.

## Settings

Open `Settings -> Extensions -> Task Status Tags`.

Statuses:

- Add a status.
- Edit a status name.
- Drag the handle to reorder statuses.
- Use the row action menu (`...`) to delete a status.
- Use the inline `Base` and `Text` swatches beside each preview pill to edit colors.
- Preview pills update immediately while you choose colors; the check saves the change, and the X restores the saved colors.
- When renaming, `Yes` renames the existing `task-status/<Old>` page to `task-status/<New>`. `No` changes the configured status name without aliasing the old tag.
- Deleting a status removes it from commands, chooser, and styling. Existing tags remain in the graph as ordinary Roam tags.
- `Reset colors` returns all statuses to their built-in defaults.
- `Style native checkboxes by task status` turns checkbox decoration on or off without changing status pills or graph data.
- `Status label display` chooses between **Checkbox only — reveal on intent** (recommended) and **Checkbox + status pill**. If checkbox styling is disabled, labels automatically remain visible.
- `Ask for a follow-up date on Waiting / In Review` (on by default) turns the follow-up date prompt on or off.
- `Statuses kept on the next repeat` lists the statuses that carry over to the next occurrence of a repeating Better Tasks task. Every other status is removed from the new occurrence.

Hotkeys note:

- Roam binds hotkeys to command labels. If you rename a status, you may need to re-bind that `Task Status: Set ...` hotkey.

## Public API

Other extensions can call the frozen `window.RoamTaskStatusTags` object (`apiVersion` 1). It is installed with the extension and removed on unload only when the global is still this object.

| Member | Call | Result |
|---|---|---|
| `apiVersion` | — | `1` |
| `statuses` | `statuses()` | Frozen array of `{ key, name, tag, glyph, light: { base, text }, dark: { base, text } }`. Re-reads settings on every call, so rename, recolour, and reorder show up without a reload. Colours are the pill colours. `glyph` is the checkbox shape id: a built-in one, `custom`, or `series`, `movie`, `watching`, `watchlist`, `upcoming`, `rewatch`, `dropped`. |
| `statusOf` | `statusOf(blockString)` | The status display name, or `null` when the string has no managed status tag. |
| `setStatus` | `setStatus(uid, nameOrNull)` | Promise of `{ status, didWrite, reason? }`. `name` is the display name (`"Waiting"`, `"In Review"`); `null` clears the tag. |
| `cycle` | `cycle(uid)` | Promise of the same result shape. |
| `addEventListener` | `addEventListener("change" \| "statuses", callback)` | Callback receives the event detail. |
| `removeEventListener` | `removeEventListener(type, callback)` | Removes that callback. |

`status` is `"updated"`, `"rejected"`, `"unknown"`, `"conflict"`, `"not-updated"`, or `"unchanged"`. `didWrite` is true only for `"updated"`. Writes go through the same certified path as the command palette, and a Better Tasks task is handed to `window.betterTasks.v2.requestStatusTag`. This extension still owns that routing.

On a Better Tasks task an `"updated"` result also carries `activity: { recorded, reason }`. Better Tasks' `requestStatusTag` changes the task string but records nothing in the task's `**Activity log**`, so after a certified write this extension appends one line in Better Tasks' own shape (`2026-10-04 15:29 — status → Waiting`, or `status removed`, with `bt` event props, `source: "task-status-tags"`, in a single `block.create` call so the line and its props are one write and one undo step). It writes only into an activity-log container Better Tasks already created, never creates one (`reason: "no-activity-log"`), skips an identical trailing line (`"duplicate"`), and stands down as soon as Better Tasks returns its own `activity` field from `requestStatusTag`. A failed append never changes `status` or `didWrite`.

Window events, with detail `{ apiVersion: 1 }`:

- `roam-task-status-tags:ready` when the global is installed.
- `roam-task-status-tags:unload` when the extension unloads.

API events:

- `"change"` after a committed status write: `{ apiVersion, uid, name, status: "updated" }`. `name` is `null` when the tag was removed.
- `"statuses"` after a status rename, recolour, or reorder. Call `statuses()` again to re-render.

```javascript
window.addEventListener("roam-task-status-tags:ready", async () => {
  const api = window.RoamTaskStatusTags;
  const waiting = api.statuses().find((row) => row.name === "Waiting");
  api.addEventListener("statuses", () => {
    // Names, colours, or order changed. Read api.statuses() again.
  });
  await api.setStatus(uid, "Waiting");
  await api.setStatus(uid, null);
  console.log(waiting.glyph, waiting.light, waiting.dark);
});
```

## Install (Developer Extension)

This folder is a Roam Depot-style developer extension.

### Remote Developer Extension

After the GitHub Pages deployment finishes, this extension can be loaded in Roam's remote developer extension field with:

```text
https://svyk.github.io/Roam-Task-Status-Tags/
```

Use the URL exactly as shown. GitHub Pages project paths are case-sensitive, and the trailing slash is important for tools that append file names to the URL.

Roam will load the required files from:

- `https://svyk.github.io/Roam-Task-Status-Tags/README.md`
- `https://svyk.github.io/Roam-Task-Status-Tags/extension.js`
- `https://svyk.github.io/Roam-Task-Status-Tags/extension.css`

### Local Developer Extension

1. Open:

- `https://relemma-git-roam-app-store.roamresearch.com`

2. In Roam:

- `Settings -> Extensions -> enable Developer Mode`
- `Load Extension` and select this repository's local folder.

3. Reload dev extensions:

- `Ctrl-D Ctrl-R`

Files:

- `extension.js`
- `extension.css`

## Development

Source lives in `src/`; the pinned build emits the root and `deploy/` artifacts Roam loads.

Run local checks:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

The tests cover status text transforms, Better Tasks routing, certified writes, the public status API, exact
checkbox and hidden-pill ownership, reveal timing and keyboard semantics, ARIA cleanup,
light/dark contrast derivation, graph-read-free hover, zero-JavaScript native completion,
current-bullet gutter placement and viewport fallbacks, scoped Svy Theme menu tokens,
scoped observer behavior, CSS scoping and theme signals, lifecycle cleanup, build
determinism, secret scanning, and multiselect target resolution.

## Troubleshooting

- If commands or clicks behave twice, make sure you're not running another Task Status script at the same time.
- If a DONE block elsewhere in the graph still contains a status tag, that is expected. Cleanup is intentionally local to blocks you directly toggle or edit.
