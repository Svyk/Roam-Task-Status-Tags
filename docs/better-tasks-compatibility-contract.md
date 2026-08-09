# Better Tasks compatibility contract

This fork treats task status tags as workflow labels, not as an independent
task-completion system.

## Canonical graph state

- Roam's leading `{{[[TODO]]}}` or `{{[[DONE]]}}` macro remains the only
  completion state.
- This extension owns at most one inline
  `#[[task-status/<Name>]]` token immediately after that macro.
- Better Tasks owns its task metadata, recurrence, relationships, completion
  attributes, activity history, caches, and dashboard state.
- A status edit never changes an existing task's TODO/DONE macro. In
  particular, applying a tag to a DONE task does not reopen it.
- Completing a task does not automatically erase its status tag. This avoids
  racing Better Tasks' completion pipeline and preserves the last workflow
  label as history. Removing the tag remains an explicit action.

## Provider capability

The owned Better Tasks fork exposes `window.betterTasks.v2` while retaining
the existing `v1` contract unchanged. Version 2 adds:

```js
requestStatusTag(uid, {
  expectedString,
  statusTagTitle, // `task-status/<Name>` or null
  source,
  // Optional, coupled fields for a slash-command editor handoff:
  expectedLiveEditorString,
  editorString,
})
```

The provider:

1. reads and classifies the target from the graph;
2. requires a recognized Better Tasks task and an exact `expectedString`;
3. validates the status namespace and modifies only the managed prefix slot;
4. preserves the task macro and all remaining text byte-for-byte;
5. writes through Better Tasks, refreshes its caches/dashboard, and re-reads
   the block to certify the result;
6. returns a discriminated `updated`, `unchanged`, `rejected`, or `unknown`
   result instead of falling back to an unsafe raw write.

The two optional editor fields are accepted only together. Better Tasks
requires the active editor to still equal the captured value (or the exact
slash-cleaned value), requires its TODO/DONE state to match the fresh graph,
and checks it again immediately before the write. This preserves upstream
slash-command behavior without allowing an old editor snapshot to reopen or
complete a managed task.

## Companion routing

The status extension resolves capabilities at operation time so load order and
reloads cannot leave a stale reference.

| Fresh classification | Write owner |
|---|---|
| Better Tasks task | `window.betterTasks.v2.requestStatusTag` |
| Better Tasks-owned metadata/activity block | no write |
| Unknown/ambiguous | no write |
| Ordinary block with no managed descendants | status extension's certified direct adapter |
| Better Tasks absent | status extension's certified direct adapter |

If only `betterTasks.v1` is present, the extension may use it to classify, but
it refuses to modify recognized Better Tasks tasks because v1 has no status
write method. If a Better Tasks runtime is detectable but no capability is
available, task-like writes fail closed.

## Direct adapter

For ordinary blocks, the status extension uses an async fresh pull, requires
the expected string to match, updates once, and performs a fresh post-write
read. A third value is a conflict. A thrown update is resolved by certification:
the exact requested value counts as committed, the exact original counts as
not committed, and any third or unreadable state is unknown. No retry writes
occur automatically.

## UI and lifecycle

- The chooser is mounted under one extension-owned body portal.
- CSS is scoped to owned markers or the extension's explicit
  `data-task-status-*` annotations.
- Added listeners, observers, timers, commands, settings UI, portal nodes, and
  globals share one idempotent lifecycle.
- Reload/unload uses identity fences and never removes a newer or foreign
  runtime.

## Release gates

- Preserve all upstream configuration, rename, reorder, color, bulk-selection,
  slash-command, command-palette, and context-menu behavior except the two
  intentional changes: DONE never reopens, and completion never auto-removes a
  status.
- Prove provider-present, provider-absent, v1-only, unknown, owned-child,
  stale-read, update-throws-after-commit, load-order, and reload/unload cases.
- `npm run check` must pass in both repositories; generated root and `deploy/`
  artifacts must be byte-identical and self-contained.
- Publishing does not authorize installing into a primary graph or opening an
  upstream pull request.
