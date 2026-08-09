import assert from "node:assert/strict";
import test from "node:test";

import {
  ALERT_BEACON_ATTRIBUTE,
  CHECKBOX_SHAPE_ATTRIBUTE,
  CHECKBOX_STATUS_ATTRIBUTE,
  OWNED_CHECKBOX_SELECTOR,
} from "../src/status-checkbox.js";
import {
  STATUS_PEEK_CLASS,
  STATUS_PEEK_HELP_ID,
  appendAttributeToken,
  createStatusPeekController,
  isStatusChooserKey,
  removeAttributeToken,
  resolveOwnedStatusCheckbox,
} from "../src/status-peek.js";

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
  }

  values() {
    return new Set(String(this.owner.className || "").split(/\s+/).filter(Boolean));
  }

  contains(value) {
    return this.values().has(value);
  }

  toggle(value, force) {
    const values = this.values();
    const next = typeof force === "boolean" ? force : !values.has(value);
    if (next) values.add(value);
    else values.delete(value);
    this.owner.className = [...values].join(" ");
    return next;
  }
}

class FakeElement {
  constructor(tagName = "div", ownerDocument = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this.className = "";
    this.classList = new FakeClassList(this);
    this.style = {};
    this.textContent = "";
    this.isConnected = false;
    this.listeners = new Map();
  }

  append(...nodes) {
    nodes.forEach((node) => {
      node.parentElement = this;
      node.parentNode = this;
      node.isConnected = this.isConnected;
      this.children.push(node);
    });
  }

  appendChild(node) {
    this.append(node);
    node.isConnected = true;
    return node;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter(
        (child) => child !== this
      );
    }
    this.parentElement = null;
    this.parentNode = null;
    this.isConnected = false;
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
    if (selector === OWNED_CHECKBOX_SELECTOR) {
      return (
        this.classList.contains("rm-checkbox") &&
        this.attributes.has(CHECKBOX_STATUS_ATTRIBUTE)
      );
    }
    if (selector === 'input[type="checkbox"]') {
      return this.tagName === "INPUT" && this.getAttribute("type") === "checkbox";
    }
    if (selector === ".checkmark") return this.classList.contains("checkmark");
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    return false;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches?.(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  contains(target) {
    let current = target;
    while (current) {
      if (current === this) return true;
      current = current.parentElement;
    }
    return false;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  addEventListener(type, handler) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(handler);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  emit(type, event) {
    for (const handler of this.listeners.get(type) || []) handler(event);
  }

  getBoundingClientRect() {
    return this.className === STATUS_PEEK_CLASS
      ? { left: 0, top: 0, right: 108, bottom: 30, width: 108, height: 30 }
      : { left: 100, top: 100, right: 124, bottom: 124, width: 24, height: 24 };
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
    this.documentElement = { clientWidth: 800, clientHeight: 600 };
    this.activeElement = null;
  }

  createElement(name) {
    return new FakeElement(name, this);
  }

  addEventListener(type, handler) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(handler);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  emit(type, event) {
    for (const handler of this.listeners.get(type) || []) handler(event);
  }
}

class FakeWindow {
  constructor() {
    this.innerWidth = 800;
    this.innerHeight = 600;
    this.listeners = new Map();
    this.setTimeout = setTimeout;
    this.clearTimeout = clearTimeout;
    this.requestAnimationFrame = (callback) => callback();
  }

  addEventListener(type, handler) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(handler);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  emit(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) handler(event);
  }
}

function makeOwnedCheckbox(document, statusKey = "WAITING", blockUid = "abcdefghi") {
  const host = document.createElement("div");
  host.isConnected = true;
  const checkbox = document.createElement("span");
  checkbox.className = "rm-checkbox rm-todo";
  checkbox.setAttribute(CHECKBOX_STATUS_ATTRIBUTE, statusKey);
  checkbox.setAttribute(CHECKBOX_SHAPE_ATTRIBUTE, statusKey.toLowerCase());
  checkbox.setAttribute("data-block-uid", blockUid);
  const input = document.createElement("input");
  input.setAttribute("type", "checkbox");
  input.checked = false;
  const checkmark = document.createElement("span");
  checkmark.className = "checkmark";
  checkbox.append(input, checkmark);
  host.appendChild(checkbox);
  input.isConnected = true;
  checkmark.isConnected = true;
  return { host, checkbox, input, checkmark };
}

function intentEvent(overrides = {}) {
  let prevented = 0;
  let stopped = 0;
  const event = {
    key: "",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    relatedTarget: null,
    preventDefault: () => {
      prevented += 1;
    },
    stopPropagation: () => {
      stopped += 1;
    },
    stopImmediatePropagation: () => {
      stopped += 1;
    },
    ...overrides,
  };
  return {
    event,
    prevented: () => prevented,
    stopped: () => stopped,
  };
}

function makeControllerFixture() {
  const document = new FakeDocument();
  const portalRoot = document.createElement("div");
  portalRoot.isConnected = true;
  const task = makeOwnedCheckbox(document);
  const window = new FakeWindow();
  const opened = [];
  const removed = [];
  const errors = [];
  const invalidAnchors = [];
  const controller = createStatusPeekController({
    document,
    window,
    portalRoot,
    showDelay: 0,
    hideDelay: 0,
    resolveContext: ({ checkbox, statusKey }) => ({
      blockUid: checkbox.getAttribute("data-block-uid"),
      statusKey,
      label: statusKey[0] + statusKey.slice(1).toLowerCase(),
    }),
    onOpen: async (context) => opened.push(context),
    onRemove: async (context) => removed.push(context),
    onAnchorInvalid: () => invalidAnchors.push(true),
    onError: (error) => errors.push(error),
  });
  controller.start();
  controller.setEnabled(true);
  return {
    document,
    window,
    portalRoot,
    task,
    controller,
    opened,
    removed,
    errors,
    invalidAnchors,
  };
}

test("chooser shortcuts are exact and Space remains native", () => {
  assert.equal(isStatusChooserKey({ key: "Enter" }), true);
  assert.equal(isStatusChooserKey({ key: "ArrowDown", altKey: true }), true);
  assert.equal(isStatusChooserKey({ key: " ", altKey: false }), false);
  assert.equal(isStatusChooserKey({ key: "Enter", shiftKey: true }), false);
  assert.equal(isStatusChooserKey({ key: "ArrowDown", altKey: false }), false);
  assert.equal(isStatusChooserKey({ key: "Enter", metaKey: true }), false);
});

test("owned description tokens preserve host aria values exactly", () => {
  const element = new FakeElement("input");
  element.setAttribute("aria-describedby", "host-note host-help");
  appendAttributeToken(element, "aria-describedby", STATUS_PEEK_HELP_ID);
  appendAttributeToken(element, "aria-describedby", STATUS_PEEK_HELP_ID);
  assert.equal(
    element.getAttribute("aria-describedby"),
    `host-note host-help ${STATUS_PEEK_HELP_ID}`
  );
  removeAttributeToken(element, "aria-describedby", STATUS_PEEK_HELP_ID);
  assert.equal(element.getAttribute("aria-describedby"), "host-note host-help");
});

test("owned resolver requires the exact marked checkbox, input, and checkmark", () => {
  const document = new FakeDocument();
  const { checkbox, input } = makeOwnedCheckbox(document);
  assert.equal(resolveOwnedStatusCheckbox(input)?.checkbox, checkbox);

  checkbox.removeAttribute(CHECKBOX_STATUS_ATTRIBUTE);
  assert.equal(resolveOwnedStatusCheckbox(input), null);
});

test("peek Alert beacon follows the setting, exact status, and native checked state", () => {
  const fixture = makeControllerFixture();
  fixture.task.checkbox.setAttribute(CHECKBOX_STATUS_ATTRIBUTE, "ALERT");
  fixture.controller.setAlertBeaconEnabled(true);
  fixture.document.emit("focusin", intentEvent({ target: fixture.task.input }).event);

  const button = fixture.portalRoot.querySelector(`.${STATUS_PEEK_CLASS}`);
  assert.equal(button.getAttribute("data-task-status-key"), "ALERT");
  assert.equal(button.getAttribute(ALERT_BEACON_ATTRIBUTE), "true");

  fixture.task.input.checked = true;
  assert.equal(fixture.controller.syncNativeCheckboxState(fixture.task.input), true);
  assert.equal(button.getAttribute(ALERT_BEACON_ATTRIBUTE), null);

  fixture.task.input.checked = false;
  assert.equal(fixture.controller.syncNativeCheckboxState(fixture.task.input), true);
  assert.equal(button.getAttribute(ALERT_BEACON_ATTRIBUTE), "true");

  fixture.task.checkbox.setAttribute(CHECKBOX_STATUS_ATTRIBUTE, "WAITING");
  fixture.controller.refresh();
  assert.equal(button.getAttribute("data-task-status-key"), "WAITING");
  assert.equal(button.getAttribute(ALERT_BEACON_ATTRIBUTE), null);

  fixture.task.checkbox.setAttribute(CHECKBOX_STATUS_ATTRIBUTE, "ALERT");
  fixture.controller.refresh();
  assert.equal(button.getAttribute(ALERT_BEACON_ATTRIBUTE), "true");
  fixture.controller.setAlertBeaconEnabled(false);
  assert.equal(button.getAttribute(ALERT_BEACON_ATTRIBUTE), null);
});

test("focus reveals one accessible portaled control and Enter opens the chooser", async () => {
  const fixture = makeControllerFixture();
  fixture.task.input.setAttribute("aria-describedby", "host-note");
  fixture.document.emit("focusin", intentEvent({ target: fixture.task.input }).event);

  const button = fixture.portalRoot.querySelector(`.${STATUS_PEEK_CLASS}`);
  assert.ok(button);
  assert.equal(button.getAttribute("data-task-status-key"), "WAITING");
  assert.equal(button.getAttribute("aria-haspopup"), "menu");
  assert.match(button.getAttribute("aria-label"), /Change task status from Waiting/);
  assert.equal(
    fixture.task.input.getAttribute("aria-describedby"),
    `host-note ${STATUS_PEEK_HELP_ID}`
  );

  const enter = intentEvent({ target: fixture.task.input, key: "Enter" });
  fixture.document.emit("keydown", enter.event);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(fixture.opened.length, 1);
  assert.equal(fixture.opened[0].returnFocusEl, fixture.task.input);
  assert.ok(enter.prevented() > 0);
  assert.equal(fixture.controller.isVisible(), true);
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(button.classList.contains("ts-status-peek-expanded"), true);
  assert.equal(fixture.task.input.getAttribute("aria-describedby"), "host-note");
  assert.deepEqual(fixture.errors, []);

  fixture.controller.chooserClosed();
  assert.equal(fixture.controller.isVisible(), false);
});

test("Space and ordinary click are never claimed by the delegated controller", async () => {
  const fixture = makeControllerFixture();
  const space = intentEvent({ target: fixture.task.input, key: " " });
  fixture.document.emit("keydown", space.event);
  fixture.document.emit("click", intentEvent({ target: fixture.task.input }).event);
  await Promise.resolve();

  assert.equal(space.prevented(), 0);
  assert.equal(space.stopped(), 0);
  assert.equal(fixture.opened.length, 0);
  assert.equal(fixture.removed.length, 0);
});

test("pointer crossing grace keeps the control open and Shift-click removes status", async () => {
  const fixture = makeControllerFixture();
  fixture.document.emit(
    "pointerover",
    intentEvent({ target: fixture.task.checkmark, relatedTarget: null }).event
  );
  const button = fixture.portalRoot.querySelector(`.${STATUS_PEEK_CLASS}`);
  assert.ok(button);

  fixture.document.emit(
    "pointerout",
    intentEvent({ target: fixture.task.checkmark, relatedTarget: button }).event
  );
  assert.equal(fixture.controller.isVisible(), true);

  const shiftClick = intentEvent({ target: button, shiftKey: true });
  button.emit("click", shiftClick.event);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(fixture.removed.length, 1);
  assert.equal(fixture.opened.length, 0);
  assert.ok(shiftClick.prevented() > 0);
  assert.equal(fixture.controller.isVisible(), false);
});

test("a reused portal button always acts on its newest checkbox anchor", async () => {
  const fixture = makeControllerFixture();
  const second = makeOwnedCheckbox(fixture.document, "ALERT", "second123");

  fixture.document.emit("focusin", intentEvent({ target: fixture.task.input }).event);
  const originalButton = fixture.portalRoot.querySelector(`.${STATUS_PEEK_CLASS}`);
  fixture.document.emit("focusin", intentEvent({ target: second.input }).event);
  const reusedButton = fixture.portalRoot.querySelector(`.${STATUS_PEEK_CLASS}`);
  assert.equal(reusedButton, originalButton);
  assert.equal(reusedButton.getAttribute("data-task-status-key"), "ALERT");

  reusedButton.emit("click", intentEvent({ target: reusedButton }).event);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fixture.opened.length, 1);
  assert.equal(fixture.opened[0].blockUid, "second123");
  assert.equal(fixture.opened[0].statusKey, "ALERT");
});

test("key repeat or duplicate activation cannot open two chooser flows", async () => {
  const fixture = makeControllerFixture();
  fixture.document.emit("focusin", intentEvent({ target: fixture.task.input }).event);
  fixture.document.emit(
    "keydown",
    intentEvent({ target: fixture.task.input, key: "Enter" }).event
  );
  fixture.document.emit(
    "keydown",
    intentEvent({ target: fixture.task.input, key: "Enter", repeat: true }).event
  );
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fixture.opened.length, 1);
});

test("pending chooser intent becomes invalid after Escape or status recycling", async () => {
  const fixture = makeControllerFixture();
  fixture.document.emit("focusin", intentEvent({ target: fixture.task.input }).event);
  fixture.document.emit(
    "keydown",
    intentEvent({ target: fixture.task.input, key: "Enter" }).event
  );
  await Promise.resolve();
  assert.equal(fixture.opened[0].isIntentCurrent(), true);

  fixture.controller.hide();
  assert.equal(fixture.opened[0].isIntentCurrent(), false);

  fixture.document.emit("focusin", intentEvent({ target: fixture.task.input }).event);
  fixture.document.emit(
    "keydown",
    intentEvent({ target: fixture.task.input, key: "Enter" }).event
  );
  await Promise.resolve();
  fixture.task.checkbox.setAttribute(CHECKBOX_STATUS_ATTRIBUTE, "ALERT");
  assert.equal(fixture.controller.refresh(), false);
  assert.equal(fixture.opened[1].isIntentCurrent(), false);
  assert.equal(fixture.invalidAnchors.length, 1);
});

test("disabling and destroying remove only controller-owned UI and delegated listeners", () => {
  const fixture = makeControllerFixture();
  fixture.document.emit("focusin", intentEvent({ target: fixture.task.input }).event);
  assert.equal(fixture.controller.isVisible(), true);
  assert.equal(fixture.document.listeners.size, 6);
  assert.equal(fixture.window.listeners.size, 2);

  fixture.controller.setEnabled(false);
  assert.equal(fixture.controller.isVisible(), false);
  assert.equal(fixture.portalRoot.querySelector(`.${STATUS_PEEK_CLASS}`), null);
  assert.ok(fixture.portalRoot.querySelector(".ts-status-sr-only"));

  fixture.controller.destroy();
  for (const listeners of fixture.document.listeners.values()) {
    assert.equal(listeners.size, 0);
  }
  for (const listeners of fixture.window.listeners.values()) {
    assert.equal(listeners.size, 0);
  }
  assert.equal(fixture.portalRoot.querySelector(".ts-status-sr-only"), null);
});

test("outside press, scroll, resize, and disconnected anchors close or refuse stale UI", () => {
  const fixture = makeControllerFixture();
  fixture.document.emit("focusin", intentEvent({ target: fixture.task.input }).event);
  assert.equal(fixture.controller.isVisible(), true);

  const outside = new FakeElement("div", fixture.document);
  fixture.document.emit("mousedown", intentEvent({ target: outside }).event);
  assert.equal(fixture.controller.isVisible(), false);

  fixture.document.emit("focusin", intentEvent({ target: fixture.task.input }).event);
  fixture.window.emit("scroll");
  assert.equal(fixture.controller.isVisible(), false);

  fixture.document.emit("focusin", intentEvent({ target: fixture.task.input }).event);
  fixture.window.emit("resize");
  assert.equal(fixture.controller.isVisible(), false);

  fixture.task.checkbox.isConnected = false;
  fixture.document.emit("focusin", intentEvent({ target: fixture.task.input }).event);
  assert.equal(fixture.controller.isVisible(), false);
});

test("an expanded chooser is invalidated when its recycled anchor disappears", async () => {
  const fixture = makeControllerFixture();
  fixture.document.emit("focusin", intentEvent({ target: fixture.task.input }).event);
  fixture.document.emit(
    "keydown",
    intentEvent({ target: fixture.task.input, key: "Enter" }).event
  );
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fixture.controller.isVisible(), true);

  fixture.task.checkbox.isConnected = false;
  assert.equal(fixture.controller.refresh(), false);
  assert.equal(fixture.controller.isVisible(), false);
  assert.equal(fixture.invalidAnchors.length, 1);
});
