# AI Agent and Extension Guide

Roam Task Status Tags exposes five tools to AI agents through Roam's experimental `extensionAPI.ai.addTool` API, plus read and icon helpers on `window.RoamTaskStatusTags` for other extensions.

Every status write from an AI agent goes through the same certified router as the chooser and command palette. Status names are published as a live JSON Schema `enum` on `list_tasks` and `set_task_status`, and both tools update in place whenever you add, rename, or remove statuses in settings.

Turn agent tools on or off in **Settings -> Extensions -> Task Status Tags -> Let AI agents read and set statuses** (on by default).

## Agent tools

| Tool | Scope | Arguments | Returns |
|---|---|---|---|
| `list_statuses` | `read` | none | `{ statuses: [{ name, tag, group, cycles }], tagFormat }` where `group` is `"task"`, `"media"`, or `"extra"`, `cycles` is whether click-to-cycle visits it, and `tagFormat` is `{{[[TODO]]}} #[[task-status/<Name>]] text` |
| `get_task_status` | `read` | `uids`: 1 to 50 block uids (bare or wrapped in `(( ))`) | `{ tasks: [{ uid, found, isTask, done, status }] }` |
| `list_tasks` | `read` | `status` (optional live status name), `include_done` (boolean, default `false`), `limit` (integer 1..200, default `50`) | `{ tasks: [{ uid, text, status, done, page }], truncated }` |
| `status_counts` | `read` | `include_done` (boolean, default `false`) | `{ counts: { "<Name>": n }, total }` for every configured status (zeros included) |
| `set_task_status` | `edit` | `changes`: 1 to 10 items of `{ uid, status }` where `status` is a live status name or `null` to clear | `{ results: [{ uid, status, didWrite, reason?, name }], updated, failed }` |

Always use `set_task_status` instead of editing block text directly. It routes Better Tasks tasks through `window.betterTasks.v2.requestStatusTag`, appends the status entry to the Better Tasks activity log, validates every status name in the batch before writing anything, and runs changes sequentially. It never creates statuses, never converts plain blocks into TODOs, and never changes TODO/DONE.

## Tool IDs

Roam namespaces each extension tool as `<extension-id>/<tool-name>`:

- **Roam Depot install:** `Svyk+Roam-Task-Status-Tags/<tool-name>`
  Example: `Svyk+Roam-Task-Status-Tags/list_statuses`
- **Developer build:** `<installed-base-url>/<tool-name>`. Because a developer build's extension ID ends with a trailing slash, the tool ID has a double slash before the tool name.
  Example: `https://svyk.github.io/Roam-Task-Status-Tags//list_statuses`

## Calling through Roam Desktop's Local API

Enable the Local API in Roam Desktop settings, then read the active port and last opened graph from `~/.roam-local-api.json` (port is usually `3333`). Calls go to `POST http://localhost:3333/api/<graph>` with a bearer token header and action `data.ai.callExtensionTool`.

A successful response has the shape `{"success": true, "result": {"tool": "...", "result": <tool output>, "queriedAt": "..."}}`. Errors return HTTP 500 with `{"success": false, "error": {"message": "..."}}`.

List configured statuses:

```bash
curl -sS -X POST "http://localhost:3333/api/my-graph" \
  -H "Authorization: Bearer $ROAM_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "data.ai.callExtensionTool",
    "args": [{
      "tool": "Svyk+Roam-Task-Status-Tags/list_statuses",
      "args": {}
    }]
  }'
```

Set or clear statuses on existing tasks:

```bash
curl -sS -X POST "http://localhost:3333/api/my-graph" \
  -H "Authorization: Bearer $ROAM_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "data.ai.callExtensionTool",
    "args": [{
      "tool": "Svyk+Roam-Task-Status-Tags/set_task_status",
      "args": {
        "changes": [
          { "uid": "abc123def", "status": "Waiting" },
          { "uid": "ghi456jkl", "status": null }
        ]
      }
    }]
  }'
```

## Agent refusal reasons

Invalid input (such as an unknown status name anywhere in `changes` or a batch larger than 10) fails the call with an error before any write happens. Per-block refusals are returned inside `results` so the agent can inspect each item without aborting the rest of the batch:

- `not-a-task`: the target block does not start with a managed `{{[[TODO]]}}` or `{{[[DONE]]}}` macro (mentioning `[[TODO]]` mid-line does not count). Nothing is written.
- `better-tasks-not-ready`: Better Tasks is not loaded yet, and the block has a child starting with `BT_attr`. Nothing is written, preventing a raw write from bypassing Better Tasks during startup.

Other router outcomes (`unchanged`, `conflict`, `better-tasks-owned-child`, `better-tasks-v2-required`, `block-not-found`, `unknown`) follow the same contract as `window.RoamTaskStatusTags.setStatus`.

## Public API additions for extensions

`window.RoamTaskStatusTags` keeps `apiVersion: 1` and exposes a frozen `features` array (`["statusOfBlock", "tasks", "counts", "renderIcon", "aiTools"]`) for feature detection.

Check features and read status groups (`group` and `inCycle` on each `statuses()` row):

```javascript
const api = window.RoamTaskStatusTags;
if (api?.features?.includes("tasks")) {
  const cycleStatuses = api.statuses().filter((row) => row.inCycle);
  console.log(cycleStatuses.map((row) => `${row.name} (${row.group})`));
}
```

Inspect one block's task and status state (`statusOfBlock` never throws):

```javascript
const info = await api.statusOfBlock(blockUid);
// { found: true, isTask: true, done: false, status: "Waiting" }
```

Query tasks carrying a configured status (omit `status` to list tasks across all configured statuses; `limit` clamps to 1..200):

```javascript
const { tasks, truncated } = await api.tasks({
  status: "Waiting",
  includeDone: false,
  limit: 25,
});
// tasks: [{ uid, text, status, done, page }]
```

Count tasks across every configured status (zeros included):

```javascript
const { counts, total } = await api.counts({ includeDone: false });
```

Render a live status icon inside your own element using Task Status Tags' own styles and active preset (returns a cleanup function; all live icons are also removed on unload):

```javascript
const stop = api.renderIcon(hostElement, "Waiting");
// Later, when unmounting your view:
stop();
```

## Limits

- `extensionAPI.ai.addTool` and `removeTool` are experimental Roam APIs. If a host build does not expose them, Task Status Tags skips tool registration quietly and keeps working normally.
- Extension tools run inside the open Roam Desktop graph window and are reached over local MCP or the Local API / CLI. They are not available when the graph window is closed.
- Write attribution: direct writes and Better Tasks activity-log entries pass `context.tokenUserUid` as `"user-uid"` so Roam attributes them to the calling AI user. When a write routes through Better Tasks' `requestStatusTag`, Better Tasks does not accept a `user-uid` parameter, so that task string update is attributed to the logged-in Roam user.
