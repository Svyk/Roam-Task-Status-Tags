import assert from "node:assert/strict";
import test from "node:test";

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
      node.parentNode = this;
      node.isConnected = true;
      this.children.push(node);
    }
  }
  appendChild(node) { this.append(node); return node; }
  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    }
    this.parentNode = null;
    this.isConnected = false;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  matches(selector) {
    if (selector === ".rm-checkbox[data-ts-checkbox-status]") {
      return this.classList.contains("rm-checkbox") &&
        this.attributes.has("data-ts-checkbox-status");
    }
    if (selector === "[data-ts-managed-status-pill]") {
      return this.attributes.has("data-ts-managed-status-pill");
    }
    return false;
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
  closest() { return null; }
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

function commandApi(active, calls = null) {
  return {
    addCommand: async ({ label }) => {
      calls?.added.push(label);
      active.add(label);
    },
    removeCommand: async ({ label }) => {
      calls?.removed.push(label);
      active.delete(label);
    },
  };
}

test("overlapping independent loads keep one portal/runtime and stale init stays inert", async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalMutationObserver = globalThis.MutationObserver;
  const document = new FakeDocument();
  const activeCommands = new Set();
  let graphWriteCalls = 0;
  const palette = commandApi(activeCommands);
  const slashCalls = { added: [], removed: [] };
  const slash = commandApi(activeCommands, slashCalls);
  const forbiddenGlobalSlash = {
    addCommand: () => assert.fail("slash commands must use the extension-scoped API"),
    removeCommand: () => assert.fail("slash commands must use the extension-scoped API"),
  };
  const context = commandApi(activeCommands);
  const multi = commandApi(activeCommands);
  const windowLike = new EventTarget();
  Object.assign(windowLike, {
    document,
    CSS: { supports: () => true },
    React: {
      createElement: () => null,
      useEffect: () => {},
      useMemo: (fn) => fn(),
      useRef: (value) => ({ current: value }),
      useState: (value) => [value, () => {}],
    },
    getComputedStyle: () => ({ color: "rgb(20, 184, 166)" }),
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    innerWidth: 1280,
    innerHeight: 800,
    roamAlphaAPI: {
      data: {
        async: { pull: async () => null },
        block: { update: async () => { graphWriteCalls += 1; } },
        page: { update: async () => { graphWriteCalls += 1; } },
      },
      ui: {
        commandPalette: palette,
        slashCommand: forbiddenGlobalSlash,
        blockContextMenu: context,
        msContextMenu: multi,
      },
    },
  });
  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }
  globalThis.window = windowLike;
  globalThis.document = document;
  globalThis.MutationObserver = FakeMutationObserver;

  let panelCalls = 0;
  let latestPanelConfig = null;
  let releaseFirstPanel;
  const firstPanel = new Promise((resolve) => { releaseFirstPanel = resolve; });
  const extensionAPI = {
    settings: {
      get: () => null,
      set: async () => {},
      panel: {
        create: async (config) => {
          panelCalls += 1;
          latestPanelConfig = config;
          if (panelCalls === 1) await firstPanel;
        },
      },
    },
    ui: { commandPalette: palette, slashCommand: slash },
  };

  try {
    const nonce = Date.now();
    const firstExtension = await import(`../src/extension.js?runtime=${nonce}-first`);
    const secondExtension = await import(`../src/extension.js?runtime=${nonce}-second`);
    const firstLoad = firstExtension.onload({
      extensionAPI,
      extension: { version: "0.2.0-first" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const firstRuntime = windowLike.__svyk_roamTaskStatusTags;
    assert.ok(firstRuntime);
    assert.equal(document.body.children.filter((node) => node.className === "ts-status-portal").length, 1);
    assert.equal(activeCommands.size, 0);

    await secondExtension.onload({ extensionAPI, extension: { version: "0.2.0-second" } });
    const secondRuntime = windowLike.__svyk_roamTaskStatusTags;
    assert.notEqual(secondRuntime, firstRuntime);
    assert.equal(document.body.children.filter((node) => node.className === "ts-status-portal").length, 1);
    assert.ok(activeCommands.size > 0);
    assert.equal(slashCalls.added.length, 6);

    const ownedCheckbox = new FakeElement("span");
    ownedCheckbox.className = "rm-checkbox rm-todo";
    ownedCheckbox.setAttribute("data-ts-checkbox-status", "ACTIVE");
    ownedCheckbox.setAttribute("data-ts-checkbox-shape", "active");
    ownedCheckbox.setAttribute("data-ts-checkbox-block-uid", "abcdefghi");
    ownedCheckbox.setAttribute("data-foreign-owner", "keep");
    document.body.appendChild(ownedCheckbox);

    const checkboxSetting = latestPanelConfig.settings.find(
      (entry) => entry.id === "task-status-style-native-checkboxes"
    );
    assert.equal(checkboxSetting.action.type, "switch");
    checkboxSetting.action.onChange(false);
    assert.equal(ownedCheckbox.getAttribute("data-ts-checkbox-status"), null);
    assert.equal(ownedCheckbox.getAttribute("data-ts-checkbox-block-uid"), null);
    assert.equal(ownedCheckbox.getAttribute("data-foreign-owner"), "keep");
    ownedCheckbox.setAttribute("data-ts-checkbox-status", "ACTIVE");
    ownedCheckbox.setAttribute("data-ts-checkbox-shape", "active");
    ownedCheckbox.setAttribute("data-ts-checkbox-block-uid", "abcdefghi");

    const displaySetting = latestPanelConfig.settings.find(
      (entry) => entry.id === "task-status-label-display"
    );
    assert.equal(displaySetting.action.type, "select");
    assert.deepEqual(displaySetting.action.items, [
      "Checkbox only — reveal on intent",
      "Checkbox + status pill",
    ]);
    displaySetting.action.onChange("Checkbox + status pill");
    displaySetting.action.onChange("Checkbox only — reveal on intent");

    const alertBeaconSetting = latestPanelConfig.settings.find(
      (entry) => entry.id === "task-status-alert-beacon"
    );
    assert.equal(alertBeaconSetting.action.type, "switch");
    alertBeaconSetting.action.onChange(false);
    alertBeaconSetting.action.onChange(true);
    assert.equal(graphWriteCalls, 0);

    ownedCheckbox.setAttribute("data-ts-checkbox-status", "ALERT");
    ownedCheckbox.setAttribute("data-ts-checkbox-shape", "alert");
    ownedCheckbox.setAttribute("data-ts-alert-beacon", "true");

    const ownedPill = new FakeElement("span");
    ownedPill.className = "rm-page-ref";
    ownedPill.setAttribute("data-ts-managed-status-pill", "true");
    ownedPill.setAttribute("data-ts-status-pill-hidden", "true");
    ownedPill.setAttribute("data-foreign-owner", "keep");
    document.body.appendChild(ownedPill);

    releaseFirstPanel();
    const cleanupFirst = await firstLoad;
    await cleanupFirst();
    assert.equal(windowLike.__svyk_roamTaskStatusTags, secondRuntime);
    assert.equal(document.body.children.filter((node) => node.className === "ts-status-portal").length, 1);
    assert.ok(activeCommands.size > 0);

    await secondExtension.onunload();
    assert.equal(windowLike.__svyk_roamTaskStatusTags, undefined);
    assert.equal(document.body.children.filter((node) => node.className === "ts-status-portal").length, 0);
    assert.equal(activeCommands.size, 0);
    assert.equal(slashCalls.removed.length, 6);
    assert.equal(ownedCheckbox.getAttribute("data-ts-checkbox-status"), null);
    assert.equal(ownedCheckbox.getAttribute("data-ts-checkbox-shape"), null);
    assert.equal(ownedCheckbox.getAttribute("data-ts-checkbox-block-uid"), null);
    assert.equal(ownedCheckbox.getAttribute("data-ts-alert-beacon"), null);
    assert.equal(ownedCheckbox.getAttribute("data-foreign-owner"), "keep");
    assert.equal(ownedPill.getAttribute("data-ts-managed-status-pill"), null);
    assert.equal(ownedPill.getAttribute("data-ts-status-pill-hidden"), null);
    assert.equal(ownedPill.getAttribute("data-foreign-owner"), "keep");
    assert.equal(graphWriteCalls, 0);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.MutationObserver = originalMutationObserver;
  }
});
