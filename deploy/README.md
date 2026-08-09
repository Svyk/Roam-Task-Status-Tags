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
- Hover or focus that checkbox to reveal a compact status control. Click it, or press `Enter` / `Alt+ArrowDown` on the focused checkbox, to open the full chooser.
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
| Holding | Darkened slate dashed outline + centered stop symbol | Slate dashed outline + centered stop symbol | Native theme checkmark |
| Incubating | Violet dotted outline + centered ring | Adjusted violet dotted outline + centered ring | Native theme checkmark |
| Alert | Rose strong outline + centered exclamation mark | Rose strong outline + centered exclamation mark | Native theme checkmark |
| Cancelled | Charcoal outline + centered X | Lightened slate outline + centered X | Native theme checkmark |
| Custom status | Contrast-adjusted configured hue + centered diamond | Contrast-adjusted configured hue + centered diamond | Native theme checkmark |

When a task is checked, the workflow glyph disappears completely and the active
Roam/Svy Theme completion fill and checkmark become authoritative. Its retained status
is still available by hovering or focusing the checkbox; persistent-pill mode keeps the
label visible instead.

Checkbox accents are derived separately for light and dark surfaces with a minimum
3.2:1 contrast target. Svy Theme users get its public surface and focus tokens; bare
Roam and other themes use safe fallbacks. Reduced-motion and forced-colors modes are
supported.

Status pills use their own paired light/dark palette with at least 4.8:1 text contrast.
The small pill marker repeats the checkbox cue (play, pause, stop, ring, exclamation, X, or diamond),
making statuses readable by shape as well as color. Dark base colors such as Cancelled
are automatically lightened on Svy Theme's dark canvas without changing the configured
hue used in light mode.

### Alert beacon

Alert is intentionally more noticeable than the other workflow states without becoming
a constant strobe. The exact unchecked Alert checkbox pulses twice during the first
1.25 seconds of a 5.2-second cycle, then remains quiet. In persistent-pill mode the
certified Alert pill repeats the same rhythm; in checkbox-only mode the hover/focus
status control carries a soft expanding ring.

The beacon is enabled by default under **Task Status Tags → Animate Alert status**.
Turning it off changes presentation only and performs no graph writes. Checked tasks
never pulse, and the animation is disabled automatically for `prefers-reduced-motion`,
forced-colors mode, and print. Query results, later-prose Alert references, ambiguous
renders, and other unowned tags never receive animation ownership.

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
- Holding
- Incubating
- Alert
- Cancelled

Default order:

```text
Active -> Waiting -> Holding -> Incubating -> Alert -> Cancelled
```

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

Hotkeys note:

- Roam binds hotkeys to command labels. If you rename a status, you may need to re-bind that `Task Status: Set ...` hotkey.

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

The tests cover status text transforms, Better Tasks routing, certified writes, exact
checkbox and hidden-pill ownership, reveal timing and keyboard semantics, ARIA cleanup,
light/dark contrast derivation, CSS scoping and theme signals, lifecycle cleanup, build
determinism, secret scanning, and multiselect target resolution.

## Troubleshooting

- If commands or clicks behave twice, make sure you're not running another Task Status script at the same time.
- If a DONE block elsewhere in the graph still contains a status tag, that is expected. Cleanup is intentionally local to blocks you directly toggle or edit.
