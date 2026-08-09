import assert from "node:assert/strict";
import test from "node:test";

class FakeClassList {
  toggle() {}
  add() {}
  remove() {}
}

class FakeElement extends EventTarget {
  constructor(tagName = "div") {
    super();
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.className = "";
    this.classList = new FakeClassList();
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
  querySelectorAll() { return []; }
  querySelector() { return null; }
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
  querySelectorAll() { return []; }
  querySelector() { return null; }
  getElementById() { return null; }
}

function commandApi(active) {
  return {
    addCommand: async ({ label }) => { active.add(label); },
    removeCommand: async ({ label }) => { active.delete(label); },
  };
}

test("overlapping independent loads keep one portal/runtime and stale init stays inert", async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalMutationObserver = globalThis.MutationObserver;
  const document = new FakeDocument();
  const activeCommands = new Set();
  const palette = commandApi(activeCommands);
  const slash = commandApi(activeCommands);
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
        block: { update: async () => {} },
        page: { update: async () => {} },
      },
      ui: {
        commandPalette: palette,
        slashCommand: slash,
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
  let releaseFirstPanel;
  const firstPanel = new Promise((resolve) => { releaseFirstPanel = resolve; });
  const extensionAPI = {
    settings: {
      get: () => null,
      set: async () => {},
      panel: {
        create: async () => {
          panelCalls += 1;
          if (panelCalls === 1) await firstPanel;
        },
      },
    },
    ui: { commandPalette: palette },
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
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.MutationObserver = originalMutationObserver;
  }
});
