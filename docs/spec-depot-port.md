# Spec: BetterTask port and Roam Depot readiness (v0.15.0)

Status: design approved by host, 2026-11-23. Baseline: v0.14.0, commit `9c368b7`, `npm run check` green (257 tests).

## 1. Source and licensing boundary

Source of ideas: BetterTask for Thymer, `github.com/imhalid/thymer-plugins/tree/main/plugins/better-task`.

That repository has **no license file**, so its code and artwork are all rights reserved. This port is a clean-room re-implementation:

- Do not open, copy or adapt upstream `plugin.js`, `plugin.css`, its SVG icons, or its screenshots. Everything needed is in this spec.
- Status names, the idea of style presets, and the feature list are taken as ideas only. All glyphs are drawn new, in this repo's existing 10x10 mask style. All colours below are chosen here.
- README credits the inspiration in one line with a link.

## 2. Inventory of the source and what happens to each part

### Statuses

| BetterTask (Thymer) | Look there | Roam Task Status Tags |
|---|---|---|
| In Progress | cyan play ring | already covered by **Active** (play). No change. |
| Waiting | amber pause pill | already **Waiting**. No change. |
| Alert | red warning triangle | already **Alert**. No change. |
| Canceled | slate slash | already **Cancelled**. No change. |
| Done / Open | green check / empty box | native `{{[[DONE]]}}` / `{{[[TODO]]}}`. Never a status tag. |
| Billable | green-gold coin | **new, ported** |
| Important | rose badge | **new, ported** |
| Discuss | violet speech bubble | **new, ported** |
| Starred | gold star | **new, ported** |
| Bug (custom, hashtag) | green beetle | **new, ported** |
| Draft (custom) | blue pencil | **new, ported** |
| Deadline (custom) | orange hourglass | **new, ported** |
| Kawaii, Flower, Sun, Moon (custom) | decorative | **not ported**. No workflow meaning; a user can add any of them as a custom status (diamond glyph). |

Thymer's custom statuses sit on top of a base status (Bug on Important, and so on). Roam Task Status Tags keeps exactly one managed tag per task, so the base-status coupling is dropped.

### Themes (style presets)

| BetterTask preset | Roam Task Status Tags checkbox style |
|---|---|
| (none; this repo's current look) | **Outline**, the default. Unchanged. |
| Neon Glass | **Glass** |
| Vivid Solid | **Solid** |
| Minimal Crisp | **Minimal** |

BetterTask also has light and dark variants picked from the Thymer theme. Here that becomes the theme resolver in section 5.

### Other source features

| Feature | Decision |
|---|---|
| Alt+click picker with number keys | Ported as number keys in the existing chooser (section 7). |
| Settings page with presets and switches | Ported into the Roam settings panel (section 6). |
| Transition bursts, ambient icon motion | Not ported. The Alert beacon stays the only motion. |
| Subtask progress badge | Deferred. Needs per-task child reads on the render path. |
| Row mood tint | Deferred. Needs a rule on blocks the extension does not own. |
| Done keeps the status colour | Deferred. The host theme keeps owning the checked state. |
| Smart Markdown task paste | Out of scope. |

## 3. New statuses

Seven statuses in a new group called **extra**. Tag form is the existing one: `#[[task-status/<Name>]]`.

| Key | Name | Glyph id | Glyph to draw (10x10 mask, new artwork) | Base colour |
|---|---|---|---|---|
| `IMPORTANT` | Important | `important` | flag on a pole | `#dc2626` |
| `STARRED` | Starred | `starred` | five-point star, filled | `#d97706` |
| `DISCUSS` | Discuss | `discuss` | speech bubble with tail | `#8b5cf6` |
| `BILLABLE` | Billable | `billable` | coin: ring with a short vertical bar in the centre | `#10b981` |
| `BUG` | Bug | `bug` | beetle: oval body, centre line, short legs | `#65a30d` |
| `DRAFT` | Draft | `draft` | pencil on a diagonal | `#3b82f6` |
| `DEADLINE` | Deadline | `deadline` | hourglass | `#ea580c` |

Rules, mirroring how media statuses already work:

- **Opt-in.** No migration. `defaults-version` stays 3 and `DEFAULT_STATUS_LIST` stays at fourteen. The statuses panel gets one button, **Add more statuses**, that appends those of the seven whose key and whose name (any case) are not already in the list, in the table order, after everything else. It reports `Added N statuses` or `All seven are already in your list`. Deleting one afterwards works like any status; pressing the button again adds it back.
- **Glyph by name.** A status the user typed by hand called Bug, Draft, and so on (any case) gets the matching glyph and is in the extra group, keeping its own key, tag and colour. Same lookup pattern as `getMediaStatusShape`.
- **Group function.** Add `getStatusGroup(statusKey, statusName)` returning `"task"`, `"media"` or `"extra"`. `isMediaStatus` keeps its exact current result (episode counter, Watching now and repeat carry-over depend on it).
- **Cycle.** Click-to-cycle, `Task Status: Cycle` and API `cycle` walk group `task` only. Cycling from an extra status starts at the first task status, as media does today.
- **Chooser.** Task statuses, divider, media statuses, divider, extra statuses. A divider is drawn only before a non-empty group.
- **Glyph everywhere a media glyph shows:** native checkbox, pill marker, peek control, settings preview pill, chooser row, Watching now row. Light and dark accent, wash and pill colours are derived the same way as for existing statuses (contrast targets unchanged: 3.2:1 checkbox, 4.8:1 pill text).
- **Commands.** Slash, palette and context-menu commands come from the status list as today; no special case.
- **Public API.** `statuses()` rows carry the new glyph ids. Additive; `apiVersion` stays 1.
- **Watching now.** Extras are non-media, so they appear under the **Tasks** filter with the existing ordering rule. No other change to the view.
- **Unchanged:** follow-up prompt (Waiting and In Review only), repeat carry-over default (media names), episode counter (Series, Watching, Rewatch), Better Tasks routing and the fail-closed boundary in `docs/better-tasks-compatibility-contract.md`. A status write for an extra status goes through the same certified path as every other status.

## 4. Checkbox styles

New setting `task-status-checkbox-style`, a select: `Outline` (default), `Glass`, `Solid`, `Minimal`. A stored value that is not one of the four reads as `Outline`.

Applied as `data-ts-checkbox-style="glass|solid|minimal"` on `document.documentElement`. Outline sets no attribute, so existing users get byte-identical rendering. Removed on unload.

All style rules keep the existing ownership rule: the rightmost compound is always `.rm-checkbox[data-ts-checkbox-status]` (or a descendant of it), so an unclaimed Roam checkbox can never match. Styles change **unchecked** checkboxes only; a checked task stays with the host theme's fill and checkmark in every style.

Introduce one variable, `--ts-checkbox-ink`, the colour the glyph is drawn in. It defaults to `var(--ts-checkbox-accent)`. Every glyph rule (clip-path, mask, border and gradient shapes, all 21 plus `custom`) draws with `--ts-checkbox-ink` instead of naming the accent directly.

| Style | Box | Glyph |
|---|---|---|
| Outline | current: 2px accent border, wash fill | ink = accent |
| Glass | 1.5px accent border, 5px radius, wash fill plus a top gloss (`linear-gradient` from white at about 20% to transparent at half height), soft glow `0 0 6px` of the accent at about 35% | ink = accent |
| Solid | accent fill and accent border, no wash | ink = `--ts-checkbox-on-accent` |
| Minimal | no border, no fill, no shadow; a faint wash on hover only | ink = accent, glyph box 12px |

- `--ts-checkbox-on-accent` is white or near-black (`#10161a`), whichever has the higher contrast against that status's accent on the current theme, and at least 3:1. Built-in statuses get static light and dark values; custom colours get them from `deriveStatusCheckboxColorValues` (add the two fields there).
- No `backdrop-filter`, no new keyframes. The Alert beacon keeps working in every style. Focus ring unchanged in every style.
- Holding's dashed and Incubating's dotted outline are part of the box, so they are absent in Minimal and replaced by the fill in Solid; the centre glyph still tells them apart.
- `forced-colors: active` and print: the three new styles fall back to Outline.
- The switch `Style native checkboxes by task status` off still means no checkbox decoration at all, whatever the style.

## 5. Theme resolution

Today the stylesheet decides dark mode itself from four host classes plus `@media (prefers-color-scheme: dark)` guarded by `:root:not(.bp3-light)`. Roam does not stamp `bp3-light`, so a Mac in dark mode running light Roam gets dark chooser, peek and checkbox tokens. That is the known failure this section removes.

### One resolver

New module `src/theme.js`:

```js
resolveHostTheme({ document, window, preference }) // -> "light" | "dark"
```

Order, first match wins:

1. **Explicit setting.** `preference` is `"light"` or `"dark"`.
2. **Host dark marker.** `html.bp3-dark`, `body.bt-theme-dark`, `rm-dark-theme` on `html` or `body`, or `body.roam-body.dark`.
3. **Host light marker.** `html.bp3-light` or `body.bt-theme-light`.
4. **Measured background.** Computed `background-color` of `body`; if it is transparent or unreadable, of `html`. Relative luminance below 0.4 is dark. Roam paints only `body`; do not sample `.roam-main`, `.roam-article` or `#app` (they are transparent).
5. **OS hint.** `matchMedia("(prefers-color-scheme: dark)")`, used only when step 4 found no readable colour on either element.

`resolveViewTheme` in `src/status-view.js` becomes a thin call into this resolver (keep the export; its existing tests must pass unchanged).

### One signal

- The extension stamps `data-ts-theme="light|dark"` on `document.documentElement`, synchronously at the start of `init`, before the observer claims any checkbox or pill.
- In `src/extension.css`, every dark branch keys on `:root[data-ts-theme="dark"]` and nothing else. Remove every `@media (prefers-color-scheme: dark)` block and every `:root.bp3-dark` / `body.bt-theme-dark` / `.rm-dark-theme` / `body.roam-body.dark` / `body.bp3-dark` selector from the stylesheet. The dark declarations themselves do not change.
- The inline status colour style element and the Watching now panel follow the same resolved value.

### Setting

`task-status-theme`, a select: `Follow Roam` (default), `Light`, `Dark`. Unknown stored values read as `Follow Roam`.

### Re-resolve triggers

All through the existing frame-coalesced `scheduleThemeColorRefresh`, which now re-resolves first and rewrites the attribute only when the value changed:

- the existing `MutationObserver` on `class` and `style` of `html` and `body`;
- the existing `prefers-color-scheme` change listener (it matters only for step 5 and for Roam's own auto mode repainting `body`);
- a `childList` observer on `document.head` (a theme extension adding or removing a stylesheet changes the body background without touching a class);
- one timeout 1500 ms after load (boot-order: an extension loaded before the theme sheet would have sampled the wrong background);
- the theme setting's `onChange`.

Every one of these is disconnected or cleared in `cleanup`, and `cleanup` removes both `data-ts-theme` and `data-ts-checkbox-style` from `html`.

## 6. Settings panel

`extensionAPI.settings.panel.create`, tab title `Task Status Tags`. Existing setting ids are synced into users' graphs and **must not be renamed**. Final order:

| # | id | Name | Control | New |
|---|---|---|---|---|
| 1 | `task-status-theme` | Theme | select: Follow Roam, Light, Dark | yes |
| 2 | `task-status-checkbox-style` | Checkbox style | select: Outline, Glass, Solid, Minimal | yes |
| 3 | `task-status-style-native-checkboxes` | Style native checkboxes by task status | switch | |
| 4 | `task-status-label-display` | Status label display | select | |
| 5 | `task-status-alert-beacon` | Animate Alert status | switch | |
| 6 | `task-status-follow-up-prompt` | Ask for a follow-up date on Waiting / In Review | switch | |
| 7 | `task-status-repeat-carry-over` | Statuses kept on the next repeat | input | |
| 8 | `task-status-status-names` | (statuses panel) | reactComponent, with the new **Add more statuses** button after the Add status row | button |
| 9 | `task-status-about` | About | reactComponent: `Task Status Tags v<runtime version>` and a link to the README on GitHub | replaces `task-status-help` |

- Each description is one or two plain sentences. Rows 6 and 7 say they need Better Tasks.
- The `Print Help` button and its console output are removed. The About row is the place the running version is read (GUARDRAILS: published artifact, installed URL and running runtime are three facts).
- The checkbox style and theme selects apply immediately, with no reload and no graph write.

## 7. Small additions for a first-time user

- **Number keys in the chooser.** While the status chooser is open and focus is not in a text or date field inside it, `1` to `9` pick the first nine statuses in the chooser's displayed order, and `0` picks Remove status. Each row shows its digit as a muted hint at the right edge (first nine rows only). Keys are consumed so Roam's shortcuts do not fire, as the chooser already does for arrows and Enter.
- **Quiet console.** No `console.log` or `console.info` on load, unload or normal use. `console.warn` and `console.error` stay for real failures. The debug logger becomes a no-op. A build test asserts the bundled `extension.js` contains neither `console.log(` nor `console.info(`.
- **Gallery fixture.** `tests/fixtures/depot-gallery.html`: a static page that links the built `extension.css` and shows every status (21 plus one custom) as an unchecked checkbox, a checked checkbox and a pill, for each of the four styles, under `data-ts-theme="light"` and `"dark"`. It is the source for README images and for visual review.

## 8. Depot readiness checklist

| Item | State at v0.14.0 | Required for release |
|---|---|---|
| `README.md` at repo root | present, developer-oriented | Rewrite the top: what it does in three sentences, screenshots, a five-step quick start, "works with or without Better Tasks". Keep the reference sections below. One credit line for BetterTask. Images referenced by absolute `raw.githubusercontent.com` URLs under `docs/images/` so they render inside Roam Depot. |
| Screenshots | none | `docs/images/statuses-light.png`, `statuses-dark.png`, `styles.png` from the gallery fixture (host captures them). Live-Roam screenshots are a follow-up for Svy after install. |
| `CHANGELOG.md` | present | Add `0.15.0`. |
| `LICENSE` | **missing**; `package.json` says `UNLICENSED` | MIT by default, `Copyright (c) 2026 Svyatoslav Kleshchev`, `package.json` `"license": "MIT"`. In its own commit so Svy can swap it. **Svy confirms the license before the Depot PR.** |
| `extension.js` default export with `onload` / `onunload` | present | unchanged |
| Clean unload | one idempotent lifecycle; observers, listeners, portal, commands, public API removed | Add: head observer, boot timeout, both `html` attributes. Test that after `cleanup` no extension attribute remains on `html` and no timer or observer is live. |
| No console noise | logs on load, unload, version, and a help button | Section 7. |
| No remote code | none; build guard rejects HTTP imports; zero runtime dependencies | unchanged. README images are the only remote references and are not code. |
| `build.sh` at root builds from `src/` | present (`npm ci --ignore-scripts`, then `node build.mjs`) | unchanged; Depot runs it on `ubuntu-24.04`. |
| Root `extension.js` / `extension.css` equal `deploy/` | enforced by `verify:generated` | unchanged |
| `npm run check` | green, 257 tests | green, with the new tests |
| Secrets | scanner in `check` | unchanged |
| Public repo | to be confirmed by host | required by Depot |

### Roam Depot metadata (draft, **not submitted**)

File in a fork of `Roam-Research/roam-depot`: `extensions/Svyk/Roam-Task-Status-Tags.json`

```json
{
  "name": "Task Status Tags",
  "short_description": "Workflow statuses for TODOs, stored as queryable tags and shown on the native checkbox.",
  "author": "Svyatoslav Kleshchev",
  "tags": ["tasks", "todo", "status", "workflow"],
  "source_url": "https://github.com/Svyk/Roam-Task-Status-Tags",
  "source_repo": "https://github.com/Svyk/Roam-Task-Status-Tags.git",
  "source_commit": "<full SHA of the pushed 0.15.0 commit>"
}
```

PR shape: one commit adding that one file; title `Add Task Status Tags`. Updates later are a PR that changes only `source_commit`.

Steps that need Svy, in order: confirm the license; review the build; say push; verify the Pages build and the runtime version in his own Roam window (remove and re-add the URL entry if the version stays at 0.14.0); take live screenshots if wanted; then give explicit go-ahead for the Depot PR. The Depot PR is a separate permission from push.

## 9. Tests to add

- `tests/theme.test.mjs`: every step of the resolver order; **OS dark with a white `body` and no classes resolves light**; OS light with a dark `body` resolves dark; explicit setting beats `bp3-dark` and beats `bp3-light`; transparent `body` falls through to `html`, then to the OS hint.
- CSS tests: no `prefers-color-scheme` and no `bp3-dark` / `bt-theme-dark` / `rm-dark-theme` / `roam-body.dark` anywhere in `src/extension.css`; every dark branch starts with `:root[data-ts-theme="dark"]`; every `data-ts-checkbox-style` rule ends on an owned checkbox selector; every glyph id (21 plus `custom`) has a checkbox rule and a pill-marker rule; no glyph rule names `--ts-checkbox-accent` as its paint directly.
- Status tests: `getStatusGroup` for built-in keys, by-name lookups in any case, and unknown names; `isMediaStatus` unchanged for every existing key; cycle skips extra statuses; the Add more statuses merge (skips existing key, skips existing name, keeps order, idempotent); `defaults-version` still 3 and a fresh install still has fourteen.
- Settings and lifecycle: unknown theme or style values fall back; style and theme attributes are set, updated and removed on cleanup; the head observer and boot timeout are released.
- Chooser: digits pick the right row, `0` removes, digits are ignored while the follow-up date field has focus.
- Build: no `console.log(` or `console.info(` in the bundle; version `0.15.0`.
- Update, do not delete, the existing assertions that expect the old theme selectors (`tests/status-checkbox-css.test.mjs` around line 120, `tests/status-view.test.mjs` around line 715).

## 10. Out of scope

Pushing, tagging, the Pages deploy, any Roam Depot fork or PR, changes to Better Tasks, changes to the public API shape beyond the new glyph ids, `.system-sync-include` (its deletion in the working tree is left exactly as it is, uncommitted).

## 11. Second pass (RTS-7, 2026-11-23)

Svy asked for the look to be "appealing, fun" over faithful, and for a Settings link. Work order: `/tmp/wo/rts-depot-polish.wo.md`. This pass overrides three earlier decisions:

- Section 2 "Transition bursts ... Not ported": a single status-change pop now exists, behind `task-status-change-animation` (`Animate status changes`, on by default, off under reduced motion). Ambient looping motion is still limited to the Alert beacon.
- Section 4 "no new keyframes": the pop and the hover and press feedback add keyframes and transitions on owned checkboxes only.
- Section 3 chooser rows: rows show the status glyph in a column.

Added: a live style preview row in settings (`task-status-style-preview`), a `Settings…` chooser item and a `Task Status: Open settings` command through `roamAlphaAPI.depot.openSettings({id})` (hidden when the API or the extension's own id is missing), README reference sections in `<details>`, and `docs/images/` screenshots rendered from `tests/fixtures/depot-gallery.html`.

Added to the Depot checklist (section 8): after the Depot PR is opened and before it is merged, Svy installs the PR build in Roam with `roamAlphaAPI.depot.developer.install({url: "Svyk+Roam-Task-Status-Tags+<PR number>"})` and checks it. After a Pages push, `roamAlphaAPI.depot.developer.reload({id: "https://svyk.github.io/Roam-Task-Status-Tags/"})` is the first update step, then the About row for the running version.

## 12. Third pass (RTS-8, 2026-11-24)

The clean-room boundary in section 1 is superseded for BetterTask for Thymer (`github.com/imhalid/thymer-plugins/tree/main/plugins/better-task`, commit `cb1350d4d6b03d7939c77de2b1d99a685f093e66`). The author (imhalid) confirmed MIT license permission to Svyatoslav Kleshchev on 2026-11-24; attribution and the full MIT license text live in `THIRD_PARTY_NOTICES.md`.

### Ported

- Upstream 24x24 vector SVG icon artwork, per-status tile geometry, gradient inks, gloss, and glow for Active (Started), Waiting (Blocked), Alert, Cancelled (Canceled), Billable (Dollar), Important (Exclaim, replacing the flag), Discuss (Question), Starred, Bug, Draft, and Deadline, under `--ts-` custom properties.
- Four additional opt-in extra statuses from BetterTask: **Kawaii**, **Flower**, **Sun**, and **Moon**, bringing the **Add more statuses** extra set to eleven (`DEFAULT_STATUS_LIST` stays at 14, `defaults-version` stays 3, never in click-to-cycle, glyph lookup by name).
- Unmapped statuses (In Review, Holding, Incubating, the seven media statuses, and user custom statuses) keep their glyphs drawn inside the same Glass, Solid, and Minimal tile language so the full catalog reads as one family.
- The three style presets (`Glass`, `Solid`, `Minimal`) ported from Neon Glass, Vivid Solid, and Minimal Crisp, with light and dark tokens keyed solely on `:root[data-ts-theme="dark"]`. Outline keeps v0.14.0 rendering for built-in task and media statuses and draws extra statuses as single-colour masks in `--ts-checkbox-ink`.
- Ambient looping icon motion for the mapped statuses in Glass, Solid, and Minimal, gated by a new setting `task-status-ambient-motion` (`Animate status icons`, default on), reduced motion, forced colors, and print, animating transform, opacity, and filter only.
- Canvas transition burst engine (`src/status-burst.js`) played on extension-initiated status writes for unchecked tasks in Glass, Solid, and Minimal (generic colour burst for unmapped statuses; Outline keeps the pass-2 CSS pop with no canvas created), controlled by `task-status-change-animation`, off under reduced motion and forced colors, with lazy canvas creation and full cleanup on unload.
- Chooser styling adapted from BetterTask's picker (rounded panel, small-caps heading, roomy rows with full-size icon preview, bold name, muted digit hint, highlighted current row, and one-line footer key hint) while preserving existing chooser items, order, and keyboard behaviour.

### Left out

- Row mood tinting on host task rows (requires styling nodes this extension does not own).
- Subtask count badges (requires per-task child graph reads on the render path).
- Completed-task origin colour retention ("done keeps the status colour"; checked tasks stay host-owned in every style).
- Open / unclaimed TODO checkbox restyling (unclaimed checkboxes are never styled).
- Hashtag-on-top-of-base-status coupling (Roam Task Status Tags keeps one managed `#[[task-status/<Name>]]` tag per task).
- Smart Markdown task paste, hashtag chip toning, Thymer autocomplete dropdown styling, upstream's settings page, and upstream commands.

