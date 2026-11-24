import assert from "node:assert/strict";
import test from "node:test";

import {
  isEditableField,
  resolveChooserDigitAction,
} from "../src/extension.js";

class FakeClassList {
  constructor(owner) { this.owner = owner; }
  values() { return new Set(String(this.owner.className || "").split(/\s+/).filter(Boolean)); }
  contains(value) { return this.values().has(value); }
  toggle(value, force) {
    const values = this.values();
    const next = typeof force === "boolean" ? force : !values.has(value);
    if (next) values.add(value); else values.delete(value);
    this.owner.className = [...values].join(" ");
    return next;
  }
  add(...items) {
    const values = this.values();
    items.forEach((item) => values.add(item));
    this.owner.className = [...values].join(" ");
  }
  remove(...items) {
    const values = this.values();
    items.forEach((item) => values.delete(item));
    this.owner.className = [...values].join(" ");
  }
}

class FakeElement extends EventTarget {
  constructor(tagName = "div") {
    super();
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.attributes = new Map();
    this.className = "";
    this.classList = new FakeClassList(this);
    this.isConnected = false;
    this.textContent = "";
    this.style = {
      color: "",
      setProperty() {},
      removeProperty() {},
    };
  }
  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === "string") continue;
      node.parentNode = this;
      node.parentElement = this;
      node.isConnected = true;
      this.children.push(node);
    }
  }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) {
    this.children.forEach((c) => { c.parentNode = null; c.parentElement = null; c.isConnected = false; });
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    }
    this.parentNode = null;
    this.parentElement = null;
    this.isConnected = false;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  contains(node) {
    let cur = node;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentNode;
    }
    return false;
  }
  getBoundingClientRect() {
    return { left: 200, top: 100, width: 140, height: 220, right: 340, bottom: 320 };
  }
  focus() {}
  matches(selector) {
    return selector.split(",").map((s) => s.trim()).some((part) => {
      if (part === ".ts-status-choice") return this.classList.contains("ts-status-choice");
      if (part === ".ts-status-choice[aria-current='true']") {
        return this.classList.contains("ts-status-choice") && this.getAttribute("aria-current") === "true";
      }
      if (part === ".ts-status-choice-shortcut") return this.classList.contains("ts-status-choice-shortcut");
      if (part === ".ts-status-chooser") return this.classList.contains("ts-status-chooser");
      if (part === ".bp3-popover-content") return this.classList.contains("bp3-popover-content");
      if (part === ".bp3-popover-arrow") return this.classList.contains("bp3-popover-arrow");
      if (part === "span.rm-page-ref[data-tag]") {
        return this.tagName === "SPAN" && this.classList.contains("rm-page-ref") && this.attributes.has("data-tag");
      }
      if (part === "[data-uid]") return this.attributes.has("data-uid");
      return false;
    });
  }
  closest(selector) {
    let cur = this;
    while (cur) {
      if (cur.matches?.(selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (child.matches?.(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.body = new FakeElement("body");
    this.head = new FakeElement("head");
    this.documentElement = new FakeElement("html");
    this.body.isConnected = true;
    this.head.isConnected = true;
    this.documentElement.isConnected = true;
    this.activeElement = null;
  }
  createElement(name) { return new FakeElement(name); }
  createElementNS(_namespace, name) { return new FakeElement(name); }
  querySelectorAll(selector) {
    return [
      ...this.documentElement.querySelectorAll(selector),
      ...this.head.querySelectorAll(selector),
      ...this.body.querySelectorAll(selector),
    ];
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getElementById() { return null; }
}

function fakeKeyEvent(key, { target = null, ctrlKey = false, metaKey = false, altKey = false } = {}) {
  const state = { defaultPrevented: false, stopped: false, immediateStopped: false };
  return {
    type: "keydown",
    key,
    target,
    ctrlKey,
    metaKey,
    altKey,
    preventDefault() { state.defaultPrevented = true; },
    stopPropagation() { state.stopped = true; },
    stopImmediatePropagation() { state.immediateStopped = true; },
    state,
  };
}

test("resolveChooserDigitAction maps 1..9 to displayed rows, 0 to remove, and ignores editable fields", () => {
  const picked = [];
  const actions = Array.from({ length: 12 }, (_, idx) => () => picked.push(idx + 1));
  const onRemove = () => picked.push("remove");

  const first = resolveChooserDigitAction(fakeKeyEvent("1"), { statusActions: actions, onRemove });
  const ninth = resolveChooserDigitAction(fakeKeyEvent("9"), { statusActions: actions, onRemove });
  const zero = resolveChooserDigitAction(fakeKeyEvent("0"), { statusActions: actions, onRemove });
  first();
  ninth();
  zero();
  assert.deepEqual(picked, [1, 9, "remove"]);

  // Out of range returns null
  assert.equal(
    resolveChooserDigitAction(fakeKeyEvent("5"), { statusActions: actions.slice(0, 3), onRemove }),
    null
  );

  // Modifier keys are not captured
  assert.equal(resolveChooserDigitAction(fakeKeyEvent("1", { ctrlKey: true }), { statusActions: actions, onRemove }), null);
  assert.equal(resolveChooserDigitAction(fakeKeyEvent("1", { metaKey: true }), { statusActions: actions, onRemove }), null);
  assert.equal(resolveChooserDigitAction(fakeKeyEvent("0", { altKey: true }), { statusActions: actions, onRemove }), null);

  // Editable fields (date input, text input, textarea, contenteditable) ignore digits
  const dateInput = new FakeElement("input");
  dateInput.setAttribute("type", "date");
  const textArea = new FakeElement("textarea");
  const editableDiv = new FakeElement("div");
  editableDiv.setAttribute("contenteditable", "true");
  assert.equal(isEditableField(dateInput), true);
  assert.equal(isEditableField(textArea), true);
  assert.equal(isEditableField(editableDiv), true);
  assert.equal(isEditableField(new FakeElement("a")), false);

  assert.equal(
    resolveChooserDigitAction(fakeKeyEvent("1", { target: dateInput }), { statusActions: actions, onRemove }),
    null
  );
  assert.equal(
    resolveChooserDigitAction(fakeKeyEvent("0"), { activeElement: dateInput, statusActions: actions, onRemove }),
    null
  );
  assert.equal(
    resolveChooserDigitAction(fakeKeyEvent("3", { target: textArea }), { statusActions: actions, onRemove }),
    null
  );
});

test("chooser renders hints on first nine rows, handles 1..9 and 0, and ignores digits when date input has focus", async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalMutationObserver = globalThis.MutationObserver;

  const document = new FakeDocument();
  let blockString = "{{[[TODO]]}} #[[task-status/Active]] Write tests";
  const writes = [];
  const noopApi = { addCommand: async () => {}, removeCommand: async () => {} };

  const windowListeners = new Map();
  const windowLike = {
    document,
    CSS: { supports: () => true },
    React: { createElement: () => null },
    getComputedStyle: () => ({ backgroundColor: "rgb(255, 255, 255)", color: "rgb(20, 184, 166)" }),
    setTimeout: () => 1,
    clearTimeout: () => {},
    requestAnimationFrame: (cb) => { cb(); return 1; },
    cancelAnimationFrame: () => {},
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener(type, fn, capture) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push({ fn, capture });
    },
    removeEventListener(type, fn) {
      const list = windowListeners.get(type) || [];
      windowListeners.set(type, list.filter((entry) => entry.fn !== fn));
    },
    dispatchEvent(event) {
      for (const entry of [...(windowListeners.get(event.type) || [])]) {
        entry.fn(event);
      }
      return true;
    },
    roamAlphaAPI: {
      data: {
        pull: () => ({ ":block/uid": "blk123456", ":block/string": blockString }),
        async: { pull: async () => ({ ":block/uid": "blk123456", ":block/string": blockString }) },
        block: {
          update: async ({ block }) => {
            writes.push(block.string);
            blockString = block.string;
          },
        },
      },
      ui: {
        commandPalette: noopApi,
        blockContextMenu: noopApi,
        msContextMenu: noopApi,
      },
    },
  };
  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }

  globalThis.window = windowLike;
  globalThis.document = document;
  globalThis.MutationObserver = FakeMutationObserver;

  const extensionAPI = {
    settings: {
      get: () => null,
      set: async () => {},
      panel: { create: async () => {} },
    },
    ui: { commandPalette: noopApi, slashCommand: noopApi },
  };

  let mod = null;
  try {
    mod = await import(`../src/extension.js?chooser=${Date.now()}`);
    await mod.onload({ extensionAPI, extension: { version: "0.15.0" } });

    const block = new FakeElement("div");
    block.setAttribute("data-uid", "blk123456");
    const pill = new FakeElement("span");
    pill.className = "rm-page-ref";
    pill.setAttribute("data-tag", "task-status/Active");
    block.append(pill);
    document.body.append(block);

    const openChooser = async () => {
      const clickEv = {
        type: "click",
        target: pill,
        shiftKey: false,
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {},
      };
      windowLike.dispatchEvent(clickEv);
      await new Promise((r) => setTimeout(r, 10));
    };

    // 1. Open chooser and check digit hints on first 9 rows only
    await openChooser();
    const chooser = document.querySelector(".ts-status-chooser");
    assert.ok(chooser, "status chooser should open");
    const statusChoices = chooser
      .querySelectorAll(".ts-status-choice")
      .filter((el) => el.getAttribute("data-task-status-choice"));
    assert.equal(statusChoices.length, 14);
    for (let i = 0; i < statusChoices.length; i += 1) {
      const hint = statusChoices[i].querySelector(".ts-status-choice-shortcut");
      if (i < 9) {
        assert.ok(hint, `row ${i + 1} should show shortcut hint`);
        assert.equal(hint.textContent, String(i + 1));
      } else {
        assert.equal(hint, null, `row ${i + 1} should not show shortcut hint`);
      }
    }

    // 2. While a date input has focus inside the chooser, digits are ignored
    const dateInput = new FakeElement("input");
    dateInput.setAttribute("type", "date");
    chooser.append(dateInput);
    document.activeElement = dateInput;
    const ignoredEv = fakeKeyEvent("3", { target: dateInput });
    windowLike.dispatchEvent(ignoredEv);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(ignoredEv.state.defaultPrevented, false);
    assert.equal(writes.length, 0);

    // 3. Pressing "3" with focus on menu picks the 3rd displayed status (In Review) and consumes key
    document.activeElement = statusChoices[0];
    const pick3 = fakeKeyEvent("3", { target: statusChoices[0] });
    windowLike.dispatchEvent(pick3);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(pick3.state.defaultPrevented, true);
    assert.equal(pick3.state.stopped, true);
    assert.equal(pick3.state.immediateStopped, true);
    assert.equal(blockString, "{{[[TODO]]}} #[[task-status/In Review]] Write tests");

    // 4. Reopen and press "0" to remove status
    pill.setAttribute("data-tag", "task-status/In Review");
    await openChooser();
    const pick0 = fakeKeyEvent("0", { target: document.body });
    document.activeElement = document.body;
    windowLike.dispatchEvent(pick0);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(pick0.state.defaultPrevented, true);
    assert.equal(blockString, "{{[[TODO]]}} Write tests");

  } finally {
    await mod?.onunload?.();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.MutationObserver = originalMutationObserver;
  }
});
