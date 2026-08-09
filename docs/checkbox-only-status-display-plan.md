# Checkbox-only status display plan

Date: 2026-08-09
Target release: Task Status Tags v0.5.0
Scope: implementation and release contract for v0.5.0.

## Decision

Add a **Checkbox only — reveal on intent** display mode and make it the recommended
mode for this fork.

At rest, a rendered task line shows only its status-aware native checkbox and the task
text. The canonical `#[[task-status/<Name>]]` token remains byte-for-byte in the Roam
block, but its exact managed page-ref is removed from visual layout after the checkbox
has successfully taken ownership.

Changing status remains direct:

- hover the checkbox to reveal a compact floating `Waiting ▾` control;
- click that control to open the existing full status chooser;
- focus the checkbox and press `Enter` or `Alt+ArrowDown` to open the same chooser;
- press `Space` or ordinarily click the checkbox to complete/reopen the task exactly as
  Roam does today;
- retain slash commands, command-palette commands, user-bound hotkeys, block context
  menus, multiselect, and Shift+click-to-remove on the revealed status control.

The reveal control is portaled to the existing extension-owned body root. It never
occupies block layout space, pushes task text, edits the graph, or replaces the native
checkbox.

## Why this model

It solves the tension between visual quiet and operational power:

1. **Quiet at rest.** Only the checkbox color and glyph communicate workflow status.
2. **Explicit on intent.** Hover or keyboard focus reveals the readable status name and
   the normal chooser without permanently displaying metadata.
3. **Native completion stays native.** Ordinary click and `Space` remain exclusively
   TODO/DONE interactions.
4. **The graph stays powerful.** The namespaced page reference remains available to
   Datalog, backlinks, search, Better Tasks, exports, and future integrations.
5. **Failure stays visible.** The plugin never hides a tag unless it has proven the
   canonical status slot and successfully decorated the exact sibling checkbox.

## Persistent data contract

No graph-format migration is needed. A Waiting task remains:

```text
{{[[TODO]]}} #[[task-status/Waiting]] Call supplier
```

Only the rendered page-ref is hidden. The following remain unchanged:

- the block string and its exact status token;
- the `:block/refs` relationship to `task-status/Waiting`;
- status-page backlinks and Datalog/query results;
- the Better Tasks v2 status-write boundary;
- TODO/DONE state and Better Tasks metadata;
- exports, sync, history, and status rename behavior.

The raw token remains visible while the block is actively edited. Hiding characters
inside Roam's textarea would create caret, autocomplete, and certification hazards; the
clean display applies to rendered mode only.

Better Tasks dashboard status UI remains visible. It is a deliberate management surface,
not an inline page-ref, and should keep its explicit label. This feature cleans ordinary
Roam task lines without weakening the dashboard.

## Display modes

Replace the binary presentation assumption with one select setting:

### Checkbox only — reveal on intent (recommended)

- Hide a proven managed status page-ref after its checkbox is annotated.
- Show the transient status control on checkbox hover or keyboard focus.
- Fall back to a visible tag whenever the exact checkbox cannot be proven.

### Checkbox + status pill

- Preserve the current v0.4.0 presentation and click behavior.
- Useful for users who prefer persistent text labels or are learning the glyphs.

The existing **Style native checkboxes by task status** switch remains. If checkbox
styling is disabled, the effective display automatically falls back to a visible pill,
even if Checkbox-only mode is selected. There must never be a supported state where both
the tag and the status-aware checkbox are absent.

## Exact ownership boundary

The existing `data-task-status-key` annotation identifies configured status refs, but it
can also appear on a `task-status/...` reference later in prose. It is therefore not
strong enough to authorize hiding.

Add a second, stricter marker, for example:

```html
<span
  class="rm-page-ref"
  data-task-status-key="WAITING"
  data-ts-managed-status-pill="true"
  data-ts-status-pill-hidden="true"
>…</span>
```

`data-ts-managed-status-pill` is applied only when all conditions hold:

1. the page-ref maps to a currently configured status;
2. the fresh/live block string parses that ref in the one managed prefix slot;
3. the block is a TODO or DONE task;
4. the exact rendered parent contains exactly one valid native checkbox;
5. that checkbox was successfully annotated with the same status key.

Only then may `data-ts-status-pill-hidden` be added. CSS uses the exact owned selector:

```css
.rm-page-ref[data-ts-managed-status-pill="true"][data-ts-status-pill-hidden="true"] {
  display: none !important;
}
```

This exact owned selector ensures the pill consumes no layout width. It must not use
`opacity: 0`, `visibility: hidden`, a broad `task-status/` substring selector, or
`:has()`.

A status ref later in prose, an ordinary block, a query result without its checkbox, an
ambiguous render, or a temporarily unreadable block remains visible and navigable.

## Atomic presentation order

Transitions must never produce a frame with no trustworthy status indicator.

### Entering Checkbox-only mode

1. Read/parse the render's current block state.
2. Annotate the exact native checkbox.
3. Certify that checkbox status and pill status match.
4. Add the managed-pill marker.
5. Hide the pill last.

### Leaving the mode, disabling checkbox styling, or unloading

1. Unhide every owned pill first.
2. Close and remove the transient status control and chooser.
3. Remove owned pill markers.
4. Remove checkbox annotations.
5. Remove delegated listeners, timers, descriptions, and the portal root.

If any refresh step throws or becomes ambiguous, remove the hidden marker and fail
visible. DOM recycling must compare exact current attributes rather than trusting an old
node's prior status.

## Seamless interaction specification

| Intent | Interaction | Result |
|---|---|---|
| Complete/reopen | ordinary checkbox click | Native Roam behavior; extension does not intercept |
| Complete/reopen by keyboard | `Space` on checkbox | Native Roam behavior; extension does not intercept |
| Learn current status | hover or focus checkbox | Floating colored glyph + `Status name ▾` appears |
| Change status by pointer | click floating control | Existing chooser opens, anchored to checkbox |
| Change status by keyboard | `Enter` or `Alt+ArrowDown` on focused checkbox | Existing chooser opens and focuses current item |
| Remove status quickly | Shift+click floating control | Existing certified remove path |
| Close transient UI | `Escape`, outside click, scroll, resize, or anchor removal | UI closes; focus returns to checkbox when appropriate |
| Bulk status change | use reveal control while blocks are selected | Existing multiselect target resolution and chooser count |
| Touch/coarse pointer | block context menu or command palette | No long-press interception on the completion control |

Do not implement double-click, click-and-hold, wheel-to-cycle, or split the 16px checkbox
into competing click zones. Those interactions either toggle completion accidentally or
make the primary control too small.

## Transient control design

Create one reusable `.ts-status-peek` button under `.ts-status-portal`:

- use the same paired light/dark status palette and semantic glyph as the checkbox;
- label it `Change task status from Waiting`;
- set `aria-haspopup="menu"` and maintain `aria-expanded` while the chooser is open;
- show after roughly 180–250ms of intentional pointer hover, but immediately on keyboard
  focus;
- keep it open while the pointer is over either the checkbox or the control, with a short
  crossing grace period;
- let `Escape` dismiss it without moving focus;
- position above the checkbox when space permits and below otherwise;
- close on scroll, resize, anchor disconnection, status change, or DOM recycling;
- use no pointer-move loop and no layout-affecting mount inside Roam's React block.

The control is an interactive menu button, not a tooltip. A tooltip cannot receive focus
or contain interactive elements. The revealed button must be hoverable, dismissible, and
persistent until pointer/focus leaves or the user dismisses it.

For assistive technology, preserve the checkbox's existing accessible name. Append an
owned description while it is active, such as:

```text
Workflow status: Waiting. Space completes the task; Enter changes status.
```

Never overwrite a host `aria-label` or `aria-describedby`; merge and restore exact prior
values during teardown.

## Event and lifecycle architecture

Use delegated, scoped events because Roam recycles rendered block nodes:

- one `pointerover`/`pointerout` pair that resolves only
  `.rm-checkbox[data-ts-checkbox-status]`;
- one `focusin`/`focusout` pair for the exact native checkbox input;
- one capture `keydown` handler that intercepts only `Enter`, `Alt+ArrowDown`, and
  `Escape` for an owned checkbox or extension-owned portal;
- existing chooser handlers for click, selection, scroll, resize, and outside dismissal.

Do not attach listeners to every checkbox, observe pointer movement, or rescan the whole
document on hover. Register all timers, listeners, portal nodes, and ARIA restoration with
the existing idempotent lifecycle.

Before opening the chooser, re-resolve the block UID and compare the checkbox's current
status marker. The chooser's existing certified write/Better Tasks routing remains the
only mutation path; hovering and changing display mode perform zero graph writes.

## Implementation phases

### Phase 1 — Pure presentation contract

- Extend `src/status-checkbox.js` with a result that distinguishes a configured status
  ref from a proven managed status pill.
- Add idempotent apply/clear helpers for the two owned pill attributes.
- Make hidden eligibility depend on a successful exact checkbox annotation.
- Add unit tests for managed prefix, later prose, nested tasks, missing/ambiguous
  checkbox, disabled styling, DONE, custom status, and recycled nodes.

### Phase 2 — Display-mode setting and atomic hiding

- Add `task-status-label-display` using the official settings `select` action.
- Support `Checkbox only — reveal on intent` and `Checkbox + status pill`.
- Refactor `refreshStatusVisuals` to annotate checkbox first and hide pill last.
- Make mode changes refresh existing render scopes without graph writes.
- Unhide first during setting disablement and unload.

### Phase 3 — Portaled reveal controller

- Add a small testable controller for anchor resolution, show/hide timers, positioning,
  focus return, and stale-anchor refusal.
- Reuse the current status chooser and target-resolution paths rather than creating a
  second menu or write flow.
- Preserve Shift+click removal on the revealed control.
- Add Enter/Alt+ArrowDown opening while leaving click and Space untouched.

### Phase 4 — Theme and accessibility finish

- Style the reveal control with existing status tokens and all five dark signals.
- Cover focus-visible, forced colors, reduced motion, zoom, narrow sidebars, and long
  custom status names.
- Add the shared owned description and exact ARIA restoration.
- Update README, Help text, changelog, and the visual fixture.

### Phase 5 — Release and live acceptance

- Build from a clean locked install and run the complete repository gate.
- Validate locally in a synthetic fixture, then in a disposable Roam graph with Better
  Tasks and Svy Theme loaded in both orders.
- Publish only after CI and Pages are green and the served artifacts match locally.

## Automated acceptance

The suite must prove:

- display-mode changes produce zero Roam or Better Tasks writes;
- the graph string and ref relationship are unchanged;
- only a proven managed prefix page-ref can be hidden;
- later-prose and ordinary status refs stay visible;
- hiding occurs only after checkbox annotation succeeds;
- missing, ambiguous, disabled, unreadable, or recycled cases fail visible;
- multiple renders of the same UID own their presentation independently;
- normal click and `Space` still toggle completion exactly once;
- hover/focus alone never toggles completion or writes status;
- revealed control click, Shift+click, Enter, and Alt+ArrowDown use the existing chooser
  and certified write paths exactly once;
- Escape/outside-click/scroll/resize/anchor removal cleanly close transient UI;
- unload restores pill visibility, original ARIA, native checkbox DOM, and zero portal or
  listener residue;
- Better Tasks present/absent, reload order, and stale capability cases retain the
  existing fail-closed contract.

## Live visual acceptance

Test every built-in and custom status in:

- unchecked and checked states;
- Svy Theme light, dark, and auto, plus bare Roam light/dark;
- main outline, right sidebar, block references, linked references, and zoomed blocks;
- 80%, 100%, 125%, and 200% browser zoom;
- keyboard-only, pointer, coarse-pointer fallback, forced-colors, and reduced-motion;
- single task and multiselect flows.

Require:

- at rest, the task line contains no visible managed status pill or leftover gap;
- the task text does not shift when the reveal control appears or disappears;
- the control never clips or becomes unreachable in a narrow sidebar;
- it remains hoverable, dismissible with Escape, and persistent while used;
- checked tasks keep only the host completion mark at rest but can reveal their retained
  historical status on intent;
- status changes update checkbox glyph/color and close the chooser without a stale frame;
- no later-prose tag, query result, or unowned page-ref disappears;
- mutation work remains proportional to changed render roots, with no meaningful
  regression during 100 status edits.

## Research basis

- The native checkbox keeps `Space` because that is the standard checkbox keyboard
  interaction: [WAI-ARIA Checkbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/).
- The revealed control uses menu-button semantics (`aria-haspopup`, `aria-expanded`, and
  Enter/optional Down Arrow behavior): [WAI-ARIA Menu Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/).
- Hover/focus content must be dismissible, hoverable, and persistent:
  [WCAG 2.2 Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html).
- A tooltip cannot receive focus or contain interactive controls, which is why the
  reveal is a button rather than a tooltip:
  [WAI-ARIA Tooltip Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/).

## Release decision

Ship this as v0.5.0 only if the Checkbox-only mode is genuinely cleaner at rest while
ordinary completion remains indistinguishable from stock Roam. If live testing shows
that hover UI is distracting or the hidden token leaves unstable spacing, keep the data
contract and setting but fall back to the current persistent pill rather than shipping a
partially hidden state.
