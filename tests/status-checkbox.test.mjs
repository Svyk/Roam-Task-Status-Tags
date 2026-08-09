import assert from "node:assert/strict";
import test from "node:test";

import { createTaskStatusTextHelpers } from "../src/extension.js";
import {
  ALERT_BEACON_ATTRIBUTE,
  CHECKBOX_SHAPE_ATTRIBUTE,
  CHECKBOX_STATUS_ATTRIBUTE,
  HIDDEN_STATUS_PILL_ATTRIBUTE,
  MANAGED_STATUS_PILL_ATTRIBUTE,
  applyStatusCheckboxAnnotation,
  applyManagedStatusPillPresentation,
  buildStatusCheckboxColors,
  buildStatusPillColors,
  clearOwnedStatusCheckboxes,
  clearOwnedStatusPillPresentations,
  clearStatusCheckboxAnnotation,
  clearStatusPillPresentation,
  contrastRatio,
  countExactStatusTagOccurrences,
  decideStatusCheckboxAnnotation,
  deriveAccessibleAccent,
  findSiblingTaskCheckbox,
  getStatusCheckboxShape,
  isExactManagedStatusPill,
  syncStatusCheckboxForPill,
  syncStatusPresentationForPill,
} from "../src/status-checkbox.js";

const DEFAULT_COLORS = {
  ACTIVE: "#14b8a6",
  WAITING: "#eab308",
  HOLDING: "#94a3b8",
  INCUBATING: "#6366f1",
  ALERT: "#f43f5e",
  CANCELLED: "#1e293b",
};

function hexRgb(value) {
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

class FakeElement {
  constructor(tagName = "span", classes = []) {
    this.tagName = tagName.toUpperCase();
    this.classes = new Set(classes);
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.classList = { contains: (name) => this.classes.has(name) };
  }

  append(...children) {
    children.forEach((child) => {
      child.parentElement = this;
      this.children.push(child);
    });
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  matches(selector) {
    if (selector === `.rm-checkbox[${CHECKBOX_STATUS_ATTRIBUTE}]`) {
      return this.classes.has("rm-checkbox") && this.attributes.has(CHECKBOX_STATUS_ATTRIBUTE);
    }
    if (selector === `[${MANAGED_STATUS_PILL_ATTRIBUTE}]`) {
      return this.attributes.has(MANAGED_STATUS_PILL_ATTRIBUTE);
    }
    return false;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        const isInput =
          selector === 'input[type="checkbox"]' &&
          child.tagName === "INPUT" &&
          child.getAttribute("type") === "checkbox";
        const isCheckmark = selector === ".checkmark" && child.classes.has("checkmark");
        const isOwned =
          selector === `.rm-checkbox[${CHECKBOX_STATUS_ATTRIBUTE}]` &&
          child.classes.has("rm-checkbox") &&
          child.attributes.has(CHECKBOX_STATUS_ATTRIBUTE);
        const isOwnedPill =
          selector === `[${MANAGED_STATUS_PILL_ATTRIBUTE}]` &&
          child.attributes.has(MANAGED_STATUS_PILL_ATTRIBUTE);
        if (isInput || isCheckmark || isOwned || isOwnedPill) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

function taskRender() {
  const parent = new FakeElement("span");
  const checkbox = new FakeElement("span", ["rm-checkbox", "rm-todo"]);
  const label = new FakeElement("label", ["check-container"]);
  const input = new FakeElement("input");
  input.setAttribute("type", "checkbox");
  input.checked = false;
  const checkmark = new FakeElement("span", ["checkmark"]);
  const pill = new FakeElement("span", ["rm-page-ref"]);
  label.append(input, checkmark);
  checkbox.append(label);
  parent.append(checkbox, pill);
  return { parent, checkbox, label, input, checkmark, pill };
}

function taggedTaskRender(tagTitle) {
  const render = taskRender();
  render.pill.setAttribute("data-tag", tagTitle);
  return render;
}

const textHelpers = createTaskStatusTextHelpers();
const statusTagToKey = new Map([
  ["task-status/Active", "ACTIVE"],
  ["task-status/Waiting", "WAITING"],
  ["task-status/Holding", "HOLDING"],
  ["task-status/Incubating", "INCUBATING"],
  ["task-status/Alert", "ALERT"],
  ["task-status/Cancelled", "CANCELLED"],
]);

test("every default status derives contrast-safe integer light and dark accents", () => {
  for (const [statusKey, color] of Object.entries(DEFAULT_COLORS)) {
    const palette = buildStatusCheckboxColors({ baseRgb: hexRgb(color) });
    assert.ok(
      contrastRatio(palette.lightAccent, palette.lightSurface) >= 3.2,
      `${statusKey} light accent did not reach 3.2:1`
    );
    assert.ok(
      contrastRatio(palette.darkAccent, palette.darkSurface) >= 3.2,
      `${statusKey} dark accent did not reach 3.2:1`
    );
  }
});

test("every default status derives small-text-safe light and dark pill colors", () => {
  for (const [statusKey, color] of Object.entries(DEFAULT_COLORS)) {
    const palette = buildStatusPillColors({ baseRgb: hexRgb(color) });
    assert.ok(
      contrastRatio(palette.lightText, palette.lightBackground) >= 4.8,
      `${statusKey} light pill text did not reach 4.8:1`
    );
    assert.ok(
      contrastRatio(palette.darkText, palette.darkBackground) >= 4.8,
      `${statusKey} dark pill text did not reach 4.8:1`
    );
  }
});

test("dark Cancelled pill text is lightened while its light-mode ink is preserved", () => {
  const base = hexRgb(DEFAULT_COLORS.CANCELLED);
  const palette = buildStatusPillColors({ baseRgb: base });

  assert.deepEqual(palette.lightText, base);
  assert.ok(palette.darkText.r > base.r);
  assert.ok(palette.darkText.g > base.g);
  assert.ok(palette.darkText.b > base.b);
  assert.ok(contrastRatio(palette.darkText, palette.darkBackground) >= 4.8);
});

test("a configured text hue stays unchanged in each mode when it already passes", () => {
  const preferred = { r: 0, g: 72, b: 64 };
  const palette = buildStatusPillColors({
    baseRgb: { r: 20, g: 184, b: 166 },
    preferredTextRgb: preferred,
    lightSurfaceRgb: { r: 255, g: 255, b: 255 },
    darkSurfaceRgb: { r: 255, g: 255, b: 255 },
  });

  assert.deepEqual(palette.lightText, preferred);
  assert.deepEqual(palette.darkText, preferred);
});

test("custom colors are adjusted toward the nearest passing contrast endpoint", () => {
  const surface = { r: 255, g: 255, b: 255 };
  const weakAmber = { r: 234, g: 179, b: 8 };
  const adjusted = deriveAccessibleAccent(weakAmber, surface, 3.2);

  assert.ok(contrastRatio(adjusted, surface) >= 3.2);
  assert.ok(adjusted.r < weakAmber.r);
  assert.ok(adjusted.g < weakAmber.g);
});

test("an already passing accent is preserved", () => {
  const base = { r: 99, g: 102, b: 241 };
  assert.deepEqual(deriveAccessibleAccent(base, { r: 255, g: 255, b: 255 }, 3.2), base);
});

test("built-in shapes are stable and unknown statuses use the custom diamond", () => {
  assert.deepEqual(
    Object.keys(DEFAULT_COLORS).map(getStatusCheckboxShape),
    ["active", "waiting", "holding", "incubating", "alert", "cancelled"]
  );
  assert.equal(getStatusCheckboxShape("CUSTOM_DEEP_WORK"), "custom");
});

test("managed TODO and DONE prefixes produce checkbox decisions", () => {
  const todo = decideStatusCheckboxAnnotation({
    tagTitle: "task-status/Waiting",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Waiting]] Call supplier",
    textHelpers,
  });
  const done = decideStatusCheckboxAnnotation({
    tagTitle: "task-status/Alert",
    statusTagToKey,
    blockString: "{{[[DONE]]}} #[[task-status/Alert]] Review incident",
    textHelpers,
  });

  assert.deepEqual(todo, { statusKey: "WAITING", shape: "waiting" });
  assert.deepEqual(done, { statusKey: "ALERT", shape: "alert" });
});

test("a status tag later in prose never claims the checkbox", () => {
  const decision = decideStatusCheckboxAnnotation({
    tagTitle: "task-status/Alert",
    statusTagToKey,
    blockString: "{{[[TODO]]}} Discuss #[[task-status/Alert]] in prose",
    textHelpers,
  });
  assert.equal(decision, null);
});

test("ordinary blocks, unknown tags, missing reads, and disabled styling fail closed", () => {
  const base = {
    tagTitle: "task-status/Active",
    statusTagToKey,
    textHelpers,
  };
  assert.equal(
    decideStatusCheckboxAnnotation({ ...base, blockString: "Not a task" }),
    null
  );
  assert.equal(
    decideStatusCheckboxAnnotation({
      ...base,
      tagTitle: "task-status/Unknown",
      blockString: "{{[[TODO]]}} #[[task-status/Unknown]] Test",
    }),
    null
  );
  assert.equal(decideStatusCheckboxAnnotation({ ...base, blockString: null }), null);
  assert.equal(
    decideStatusCheckboxAnnotation({
      ...base,
      enabled: false,
      blockString: "{{[[TODO]]}} #[[task-status/Active]] Test",
    }),
    null
  );
});

test("the exact sibling native checkbox is resolved without ancestor leakage", () => {
  const { pill, checkbox } = taskRender();
  assert.equal(findSiblingTaskCheckbox(pill), checkbox);

  const parent = new FakeElement("span");
  const wrapper = new FakeElement("span");
  const nested = taskRender();
  const separatePill = new FakeElement("span", ["rm-page-ref"]);
  wrapper.append(nested.checkbox);
  parent.append(wrapper, separatePill);
  assert.equal(findSiblingTaskCheckbox(separatePill), null);
});

test("ambiguous sibling checkboxes fail closed", () => {
  const first = taskRender();
  const second = taskRender();
  const parent = new FakeElement("span");
  const pill = new FakeElement("span", ["rm-page-ref"]);
  parent.append(first.checkbox, second.checkbox, pill);
  assert.equal(findSiblingTaskCheckbox(pill), null);
});

test("sync applies only the owned status and shape attributes", () => {
  const { pill, checkbox } = taskRender();
  checkbox.setAttribute("data-foreign-owner", "keep");
  const result = syncStatusCheckboxForPill({
    statusPill: pill,
    tagTitle: "task-status/Active",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Active]] Ship it",
    textHelpers,
  });

  assert.equal(result.annotated, true);
  assert.equal(checkbox.getAttribute(CHECKBOX_STATUS_ATTRIBUTE), "ACTIVE");
  assert.equal(checkbox.getAttribute(CHECKBOX_SHAPE_ATTRIBUTE), "active");
  assert.equal(checkbox.getAttribute("data-foreign-owner"), "keep");
});

test("sync removes stale owned markers when the managed prefix disappears", () => {
  const { pill, checkbox } = taskRender();
  applyStatusCheckboxAnnotation(checkbox, { statusKey: "ACTIVE", shape: "active" });

  const result = syncStatusCheckboxForPill({
    statusPill: pill,
    tagTitle: "task-status/Active",
    statusTagToKey,
    blockString: "{{[[TODO]]}} Status removed #[[task-status/Active]]",
    textHelpers,
  });

  assert.equal(result.annotated, false);
  assert.equal(checkbox.getAttribute(CHECKBOX_STATUS_ATTRIBUTE), null);
  assert.equal(checkbox.getAttribute(CHECKBOX_SHAPE_ATTRIBUTE), null);
});

test("a recycled checkbox replaces stale status attributes exactly", () => {
  const { pill, checkbox } = taskRender();
  syncStatusCheckboxForPill({
    statusPill: pill,
    tagTitle: "task-status/Active",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Active]] First render",
    textHelpers,
  });
  const result = syncStatusCheckboxForPill({
    statusPill: pill,
    tagTitle: "task-status/Waiting",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Waiting]] Recycled render",
    textHelpers,
  });

  assert.equal(result.annotated, true);
  assert.equal(checkbox.getAttribute(CHECKBOX_STATUS_ATTRIBUTE), "WAITING");
  assert.equal(checkbox.getAttribute(CHECKBOX_SHAPE_ATTRIBUTE), "waiting");
});

test("multiple rendered references of one block annotate independently", () => {
  const first = taskRender();
  const second = taskRender();
  const input = {
    tagTitle: "task-status/Holding",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Holding]] Shared task",
    textHelpers,
  };

  const firstResult = syncStatusCheckboxForPill({ ...input, statusPill: first.pill });
  const secondResult = syncStatusCheckboxForPill({ ...input, statusPill: second.pill });

  assert.equal(firstResult.annotated, true);
  assert.equal(secondResult.annotated, true);
  assert.notEqual(firstResult.checkbox, secondResult.checkbox);
  assert.equal(first.checkbox.getAttribute(CHECKBOX_STATUS_ATTRIBUTE), "HOLDING");
  assert.equal(second.checkbox.getAttribute(CHECKBOX_STATUS_ATTRIBUTE), "HOLDING");
});

test("custom status sync uses the configured tag and generic shape", () => {
  const { pill, checkbox } = taskRender();
  const customHelpers = createTaskStatusTextHelpers({
    cycleOrder: ["CUSTOM_REVIEW"],
    statuses: {
      CUSTOM_REVIEW: {
        name: "Review",
        tagTitle: "task-status/Review",
        tagTitles: ["task-status/Review"],
      },
    },
  });

  const result = syncStatusCheckboxForPill({
    statusPill: pill,
    tagTitle: "task-status/Review",
    statusTagToKey: new Map([["task-status/Review", "CUSTOM_REVIEW"]]),
    blockString: "{{[[TODO]]}} #[[task-status/Review]] Read draft",
    textHelpers: customHelpers,
  });

  assert.equal(result.annotated, true);
  assert.equal(checkbox.getAttribute(CHECKBOX_STATUS_ATTRIBUTE), "CUSTOM_REVIEW");
  assert.equal(checkbox.getAttribute(CHECKBOX_SHAPE_ATTRIBUTE), "custom");
});

test("owned cleanup removes only Task Status attributes", () => {
  const root = new FakeElement("div");
  const first = taskRender().checkbox;
  const second = taskRender().checkbox;
  applyStatusCheckboxAnnotation(first, { statusKey: "ACTIVE", shape: "active" });
  applyStatusCheckboxAnnotation(second, { statusKey: "ALERT", shape: "alert" });
  second.setAttribute(ALERT_BEACON_ATTRIBUTE, "true");
  first.setAttribute("data-foreign-owner", "keep");
  root.append(first, second);

  assert.equal(clearOwnedStatusCheckboxes(root), 2);
  assert.equal(first.getAttribute(CHECKBOX_STATUS_ATTRIBUTE), null);
  assert.equal(second.getAttribute(CHECKBOX_SHAPE_ATTRIBUTE), null);
  assert.equal(second.getAttribute(ALERT_BEACON_ATTRIBUTE), null);
  assert.equal(first.getAttribute("data-foreign-owner"), "keep");

  clearStatusCheckboxAnnotation(first);
  assert.equal(first.getAttribute("data-foreign-owner"), "keep");
});

test("checkbox-only presentation hides only after exact checkbox annotation succeeds", () => {
  const { pill, checkbox } = taggedTaskRender("task-status/Waiting");
  const result = syncStatusPresentationForPill({
    statusPill: pill,
    hideManagedPill: true,
    tagTitle: "task-status/Waiting",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Waiting]] Call supplier",
    textHelpers,
  });

  assert.equal(result.annotated, true);
  assert.equal(result.managed, true);
  assert.equal(result.hidden, true);
  assert.equal(checkbox.getAttribute(CHECKBOX_STATUS_ATTRIBUTE), "WAITING");
  assert.equal(pill.getAttribute(MANAGED_STATUS_PILL_ATTRIBUTE), "true");
  assert.equal(pill.getAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE), "true");
});

test("Alert beacon belongs only to the exact managed unchecked Alert presentation", () => {
  const active = taggedTaskRender("task-status/Alert");
  const activeResult = syncStatusPresentationForPill({
    statusPill: active.pill,
    hideManagedPill: false,
    alertBeaconEnabled: true,
    tagTitle: "task-status/Alert",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Alert]] Escalate incident",
    textHelpers,
  });

  assert.equal(activeResult.alertBeacon, true);
  assert.equal(active.checkbox.getAttribute(ALERT_BEACON_ATTRIBUTE), "true");
  assert.equal(active.pill.getAttribute(ALERT_BEACON_ATTRIBUTE), "true");

  active.input.checked = true;
  const checkedResult = syncStatusPresentationForPill({
    statusPill: active.pill,
    hideManagedPill: false,
    alertBeaconEnabled: true,
    tagTitle: "task-status/Alert",
    statusTagToKey,
    blockString: "{{[[DONE]]}} #[[task-status/Alert]] Escalate incident",
    textHelpers,
  });
  assert.equal(checkedResult.alertBeacon, false);
  assert.equal(active.checkbox.getAttribute(ALERT_BEACON_ATTRIBUTE), null);
  assert.equal(active.pill.getAttribute(ALERT_BEACON_ATTRIBUTE), null);

  active.input.checked = false;
  const disabledResult = syncStatusPresentationForPill({
    statusPill: active.pill,
    hideManagedPill: false,
    alertBeaconEnabled: false,
    tagTitle: "task-status/Alert",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Alert]] Escalate incident",
    textHelpers,
  });
  assert.equal(disabledResult.alertBeacon, false);
  assert.equal(active.checkbox.getAttribute(ALERT_BEACON_ATTRIBUTE), null);
  assert.equal(active.pill.getAttribute(ALERT_BEACON_ATTRIBUTE), null);
});

test("Alert lookalikes and non-Alert managed statuses never gain beacon ownership", () => {
  const later = taggedTaskRender("task-status/Alert");
  const laterResult = syncStatusPresentationForPill({
    statusPill: later.pill,
    alertBeaconEnabled: true,
    tagTitle: "task-status/Alert",
    statusTagToKey,
    blockString: "{{[[TODO]]}} Discuss #[[task-status/Alert]] in prose",
    textHelpers,
  });
  assert.equal(laterResult.annotated, false);
  assert.equal(later.checkbox.getAttribute(ALERT_BEACON_ATTRIBUTE), null);
  assert.equal(later.pill.getAttribute(ALERT_BEACON_ATTRIBUTE), null);

  const waiting = taggedTaskRender("task-status/Waiting");
  const waitingResult = syncStatusPresentationForPill({
    statusPill: waiting.pill,
    alertBeaconEnabled: true,
    tagTitle: "task-status/Waiting",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Waiting]] Await reply",
    textHelpers,
  });
  assert.equal(waitingResult.alertBeacon, false);
  assert.equal(waiting.checkbox.getAttribute(ALERT_BEACON_ATTRIBUTE), null);
  assert.equal(waiting.pill.getAttribute(ALERT_BEACON_ATTRIBUTE), null);
});

test("a later duplicate Alert ref cannot clear the exact prefix beacon", () => {
  const render = taggedTaskRender("task-status/Alert");
  const duplicate = new FakeElement("span", ["rm-page-ref"]);
  duplicate.setAttribute("data-tag", "task-status/Alert");
  render.parent.append(duplicate);
  const blockString =
    "{{[[TODO]]}} #[[task-status/Alert]] Escalate; mention #[[task-status/Alert]] later";

  const exact = syncStatusPresentationForPill({
    statusPill: render.pill,
    alertBeaconEnabled: true,
    tagTitle: "task-status/Alert",
    statusTagToKey,
    blockString,
    textHelpers,
  });
  const later = syncStatusPresentationForPill({
    statusPill: duplicate,
    alertBeaconEnabled: true,
    tagTitle: "task-status/Alert",
    statusTagToKey,
    blockString,
    textHelpers,
  });

  assert.equal(exact.alertBeacon, true);
  assert.equal(later.annotated, false);
  assert.equal(render.checkbox.getAttribute(ALERT_BEACON_ATTRIBUTE), "true");
  assert.equal(duplicate.getAttribute(ALERT_BEACON_ATTRIBUTE), null);
});

test("pill presentation fails visible for later prose, disabled styling, and missing exact checkbox", () => {
  const later = taggedTaskRender("task-status/Alert");
  applyManagedStatusPillPresentation(later.pill, { hidden: true });
  const laterResult = syncStatusPresentationForPill({
    statusPill: later.pill,
    hideManagedPill: true,
    tagTitle: "task-status/Alert",
    statusTagToKey,
    blockString: "{{[[TODO]]}} Discuss #[[task-status/Alert]] in prose",
    textHelpers,
  });
  assert.equal(laterResult.annotated, false);
  assert.equal(later.pill.getAttribute(MANAGED_STATUS_PILL_ATTRIBUTE), null);
  assert.equal(later.pill.getAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE), null);

  const disabled = taggedTaskRender("task-status/Active");
  applyManagedStatusPillPresentation(disabled.pill, { hidden: true });
  const disabledResult = syncStatusPresentationForPill({
    statusPill: disabled.pill,
    enabled: false,
    hideManagedPill: true,
    tagTitle: "task-status/Active",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Active]] Ship",
    textHelpers,
  });
  assert.equal(disabledResult.annotated, false);
  assert.equal(disabled.pill.getAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE), null);

  const missingParent = new FakeElement("span");
  const missingPill = new FakeElement("span", ["rm-page-ref"]);
  missingPill.setAttribute("data-tag", "task-status/Active");
  missingParent.append(missingPill);
  applyManagedStatusPillPresentation(missingPill, { hidden: true });
  const missingResult = syncStatusPresentationForPill({
    statusPill: missingPill,
    hideManagedPill: true,
    tagTitle: "task-status/Active",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Active]] Ship",
    textHelpers,
  });
  assert.equal(missingResult.reason, "missing-exact-checkbox");
  assert.equal(missingPill.getAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE), null);
});

test("pill mode keeps the managed tag visible while retaining exact ownership", () => {
  const { pill } = taggedTaskRender("task-status/Holding");
  const result = syncStatusPresentationForPill({
    statusPill: pill,
    hideManagedPill: false,
    tagTitle: "task-status/Holding",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Holding]] Review",
    textHelpers,
  });

  assert.equal(result.annotated, true);
  assert.equal(result.hidden, false);
  assert.equal(pill.getAttribute(MANAGED_STATUS_PILL_ATTRIBUTE), "true");
  assert.equal(pill.getAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE), null);
});

test("recycled presentation replaces stale checkbox state and never inherits hidden state", () => {
  const { pill, checkbox } = taggedTaskRender("task-status/Active");
  syncStatusPresentationForPill({
    statusPill: pill,
    hideManagedPill: true,
    tagTitle: "task-status/Active",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Active]] First",
    textHelpers,
  });
  pill.setAttribute("data-tag", "task-status/Cancelled");
  const result = syncStatusPresentationForPill({
    statusPill: pill,
    hideManagedPill: false,
    tagTitle: "task-status/Cancelled",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Cancelled]] Recycled",
    textHelpers,
  });

  assert.equal(result.statusKey, "CANCELLED");
  assert.equal(checkbox.getAttribute(CHECKBOX_STATUS_ATTRIBUTE), "CANCELLED");
  assert.equal(pill.getAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE), null);
});

test("exact tag occurrence counting distinguishes boundaries and duplicate prose refs", () => {
  assert.equal(
    countExactStatusTagOccurrences(
      "{{[[TODO]]}} #[[task-status/Waiting]] Then #task-status/Waiting.",
      "task-status/Waiting"
    ),
    2
  );
  assert.equal(
    countExactStatusTagOccurrences(
      "#task-status/WaitingExtra #[[task-status/Waiting Again]]",
      "task-status/Waiting"
    ),
    0
  );
});

test("only the first fully-accounted duplicate status ref can own presentation", () => {
  const first = taggedTaskRender("task-status/Waiting");
  const duplicate = new FakeElement("span", ["rm-page-ref"]);
  duplicate.setAttribute("data-tag", "task-status/Waiting");
  first.parent.append(duplicate);
  const blockString =
    "{{[[TODO]]}} #[[task-status/Waiting]] Ask later about #[[task-status/Waiting]]";

  assert.equal(
    isExactManagedStatusPill({
      statusPill: first.pill,
      tagTitle: "task-status/Waiting",
      blockString,
    }),
    true
  );
  assert.equal(
    isExactManagedStatusPill({
      statusPill: duplicate,
      tagTitle: "task-status/Waiting",
      blockString,
    }),
    false
  );

  const firstResult = syncStatusPresentationForPill({
    statusPill: first.pill,
    hideManagedPill: true,
    tagTitle: "task-status/Waiting",
    statusTagToKey,
    blockString,
    textHelpers,
  });
  const duplicateResult = syncStatusPresentationForPill({
    statusPill: duplicate,
    hideManagedPill: true,
    tagTitle: "task-status/Waiting",
    statusTagToKey,
    blockString,
    textHelpers,
  });

  assert.equal(firstResult.hidden, true);
  assert.equal(duplicateResult.annotated, false);
  assert.equal(duplicateResult.managed, false);
  assert.equal(duplicateResult.reason, "not-exact-managed-pill");
  assert.equal(duplicate.getAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE), null);
  assert.equal(first.checkbox.getAttribute(CHECKBOX_STATUS_ATTRIBUTE), "WAITING");
});

test("a partial duplicate render fails visible even for the first status ref", () => {
  const render = taggedTaskRender("task-status/Waiting");
  const result = syncStatusPresentationForPill({
    statusPill: render.pill,
    hideManagedPill: true,
    tagTitle: "task-status/Waiting",
    statusTagToKey,
    blockString:
      "{{[[TODO]]}} #[[task-status/Waiting]] Hidden duplicate #[[task-status/Waiting]]",
    textHelpers,
  });

  assert.equal(result.annotated, false);
  assert.equal(result.managed, false);
  assert.equal(render.checkbox.getAttribute(CHECKBOX_STATUS_ATTRIBUTE), null);
  assert.equal(render.pill.getAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE), null);
});

test("DONE, custom statuses, and multiple views independently qualify for hiding", () => {
  const done = taggedTaskRender("task-status/Alert");
  const doneResult = syncStatusPresentationForPill({
    statusPill: done.pill,
    hideManagedPill: true,
    tagTitle: "task-status/Alert",
    statusTagToKey,
    blockString: "{{[[DONE]]}} #[[task-status/Alert]] Retained history",
    textHelpers,
  });
  assert.equal(doneResult.hidden, true);

  const custom = taggedTaskRender("task-status/Review");
  const customHelpers = createTaskStatusTextHelpers({
    cycleOrder: ["CUSTOM_REVIEW"],
    statuses: {
      CUSTOM_REVIEW: {
        name: "Review",
        tagTitle: "task-status/Review",
        tagTitles: ["task-status/Review"],
      },
    },
  });
  const customResult = syncStatusPresentationForPill({
    statusPill: custom.pill,
    hideManagedPill: true,
    tagTitle: "task-status/Review",
    statusTagToKey: new Map([["task-status/Review", "CUSTOM_REVIEW"]]),
    blockString: "{{[[TODO]]}} #[[task-status/Review]] Read draft",
    textHelpers: customHelpers,
  });
  assert.equal(customResult.hidden, true);

  const first = taggedTaskRender("task-status/Holding");
  const second = taggedTaskRender("task-status/Holding");
  const shared = {
    hideManagedPill: true,
    tagTitle: "task-status/Holding",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Holding]] Shared task",
    textHelpers,
  };
  assert.equal(
    syncStatusPresentationForPill({ ...shared, statusPill: first.pill }).hidden,
    true
  );
  assert.equal(
    syncStatusPresentationForPill({ ...shared, statusPill: second.pill }).hidden,
    true
  );
  assert.notEqual(first.checkbox, second.checkbox);
});

test("unreadable and ambiguous checkbox renders clear stale hidden ownership", () => {
  const unreadable = taggedTaskRender("task-status/Active");
  applyManagedStatusPillPresentation(unreadable.pill, { hidden: true });
  const unreadableResult = syncStatusPresentationForPill({
    statusPill: unreadable.pill,
    hideManagedPill: true,
    tagTitle: "task-status/Active",
    statusTagToKey,
    blockString: null,
    textHelpers,
  });
  assert.equal(unreadableResult.annotated, false);
  assert.equal(unreadable.pill.getAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE), null);

  const firstCheckbox = taskRender().checkbox;
  const secondCheckbox = taskRender().checkbox;
  const parent = new FakeElement("span");
  const pill = new FakeElement("span", ["rm-page-ref"]);
  pill.setAttribute("data-tag", "task-status/Active");
  parent.append(firstCheckbox, secondCheckbox, pill);
  applyManagedStatusPillPresentation(pill, { hidden: true });
  const ambiguousResult = syncStatusPresentationForPill({
    statusPill: pill,
    hideManagedPill: true,
    tagTitle: "task-status/Active",
    statusTagToKey,
    blockString: "{{[[TODO]]}} #[[task-status/Active]] Ambiguous",
    textHelpers,
  });
  assert.equal(ambiguousResult.reason, "missing-exact-checkbox");
  assert.equal(pill.getAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE), null);
});

test("owned pill cleanup is idempotent, view-local, and preserves foreign attributes", () => {
  const root = new FakeElement("div");
  const first = taskRender().pill;
  const second = taskRender().pill;
  applyManagedStatusPillPresentation(first, { hidden: true });
  applyManagedStatusPillPresentation(second, { hidden: false });
  first.setAttribute(ALERT_BEACON_ATTRIBUTE, "true");
  first.setAttribute("data-foreign-owner", "keep");
  root.append(first, second);

  assert.equal(clearOwnedStatusPillPresentations(root), 2);
  assert.equal(first.getAttribute(MANAGED_STATUS_PILL_ATTRIBUTE), null);
  assert.equal(first.getAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE), null);
  assert.equal(first.getAttribute(ALERT_BEACON_ATTRIBUTE), null);
  assert.equal(second.getAttribute(MANAGED_STATUS_PILL_ATTRIBUTE), null);
  assert.equal(first.getAttribute("data-foreign-owner"), "keep");
  assert.equal(clearOwnedStatusPillPresentations(root), 0);

  clearStatusPillPresentation(first);
  assert.equal(first.getAttribute("data-foreign-owner"), "keep");
});
