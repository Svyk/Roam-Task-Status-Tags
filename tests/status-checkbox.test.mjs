import assert from "node:assert/strict";
import test from "node:test";

import { createTaskStatusTextHelpers } from "../src/extension.js";
import {
  CHECKBOX_SHAPE_ATTRIBUTE,
  CHECKBOX_STATUS_ATTRIBUTE,
  applyStatusCheckboxAnnotation,
  buildStatusCheckboxColors,
  buildStatusPillColors,
  clearOwnedStatusCheckboxes,
  clearStatusCheckboxAnnotation,
  contrastRatio,
  decideStatusCheckboxAnnotation,
  deriveAccessibleAccent,
  findSiblingTaskCheckbox,
  getStatusCheckboxShape,
  syncStatusCheckboxForPill,
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
        if (isInput || isCheckmark || isOwned) matches.push(child);
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
  const checkmark = new FakeElement("span", ["checkmark"]);
  const pill = new FakeElement("span", ["rm-page-ref"]);
  label.append(input, checkmark);
  checkbox.append(label);
  parent.append(checkbox, pill);
  return { parent, checkbox, label, input, checkmark, pill };
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
  first.setAttribute("data-foreign-owner", "keep");
  root.append(first, second);

  assert.equal(clearOwnedStatusCheckboxes(root), 2);
  assert.equal(first.getAttribute(CHECKBOX_STATUS_ATTRIBUTE), null);
  assert.equal(second.getAttribute(CHECKBOX_SHAPE_ATTRIBUTE), null);
  assert.equal(first.getAttribute("data-foreign-owner"), "keep");

  clearStatusCheckboxAnnotation(first);
  assert.equal(first.getAttribute("data-foreign-owner"), "keep");
});
