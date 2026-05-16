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

- Click a status pill on a TODO block to open a status chooser.
- Shift+click a status pill to remove the status while keeping TODO.
- Marking a visible task as DONE with Roam's native checkbox removes that block's managed status tag only.
- Applying a status to a DONE block reopens it as TODO.
- Selected-block commands apply to the selected blocks only.
- Status editing is token-aware: it changes the managed TODO/status prefix and preserves the rest of the block text as much as possible.

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

Hotkeys note:

- Roam binds hotkeys to command labels. If you rename a status, you may need to re-bind that `Task Status: Set ...` hotkey.

## Install (Developer Extension)

This folder is a Roam Depot-style developer extension.

1. Open:

- `https://relemma-git-roam-app-store.roamresearch.com`

2. In Roam:

- `Settings -> Extensions -> enable Developer Mode`
- `Load Extension` and select:
  - `/Users/chima/code/github/Roam Task Status Tags`

3. Reload dev extensions:

- `Ctrl-D Ctrl-R`

Files:

- `extension.js`
- `extension.css`

## Development

This remains a no-build Roam Depot developer extension. Roam loads `extension.js` and `extension.css` directly.

Run local checks:

```bash
node --check extension.js
npm test
```

The tests cover the pure status text helpers: applying, replacing, removing, canonical-only status matching, DONE cleanup text behavior, slash command fragment removal, custom statuses, reordered cycle order, DONE reopening, bulk text transforms, and multiselect target resolution.

## Troubleshooting

- If commands or clicks behave twice, make sure you're not running another Task Status script at the same time.
- If a DONE block elsewhere in the graph still contains a status tag, that is expected. Cleanup is intentionally local to blocks you directly toggle or edit.
