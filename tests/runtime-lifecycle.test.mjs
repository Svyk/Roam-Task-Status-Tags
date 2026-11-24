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
  const observed = [];
  const activeTimers = new Map();
  let nextTimerId = 1;
  const scheduledDelays = [];
  const fakeSetTimeout = (fn, delay = 0) => {
    const id = nextTimerId++;
    scheduledDelays.push(delay);
    if (delay >= 1000) {
      activeTimers.set(id, { fn, delay });
      return id;
    }
    const nativeId = setTimeout(() => {
      activeTimers.delete(id);
      fn();
    }, delay);
    activeTimers.set(id, { nativeId, delay });
    return id;
  };
  const fakeClearTimeout = (id) => {
    const entry = activeTimers.get(id);
    if (entry?.nativeId) clearTimeout(entry.nativeId);
    activeTimers.delete(id);
  };
  const windowLike = new EventTarget();
  Object.assign(windowLike, {
    document,
    CSS: { supports: () => true },
    React: {
      createElement: (type, props, ...children) => ({ type, props, children }),
      useEffect: () => {},
      useMemo: (fn) => fn(),
      useRef: (value) => ({ current: value }),
      useState: (value) => [value, () => {}],
    },
    getComputedStyle: (el) => {
      if (el === document.body) return { backgroundColor: "rgb(255, 255, 255)" };
      return { color: "rgb(20, 184, 166)" };
    },
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    requestAnimationFrame: (callback) => fakeSetTimeout(callback, 0),
    cancelAnimationFrame: fakeClearTimeout,
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
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      this.disconnected = false;
      observed.push(this);
    }
    observe(target, options) {
      this.targets.push({ target, options });
    }
    disconnect() {
      this.disconnected = true;
    }
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
    const originalConsoleLog = console.log;
    const originalConsoleInfo = console.info;
    const noisyCalls = [];
    console.log = (...args) => noisyCalls.push(["log", ...args]);
    console.info = (...args) => noisyCalls.push(["info", ...args]);
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
      assert.equal(slashCalls.added.length, 14);

      assert.deepEqual(
        latestPanelConfig.settings.map((entry) => entry.id),
        [
          "task-status-theme",
          "task-status-checkbox-style",
          "task-status-style-native-checkboxes",
          "task-status-label-display",
          "task-status-alert-beacon",
          "task-status-change-animation",
          "task-status-follow-up-prompt",
          "task-status-repeat-carry-over",
          "task-status-status-names",
          "task-status-about",
        ]
      );
      assert.match(
        latestPanelConfig.settings.find((entry) => entry.id === "task-status-follow-up-prompt").description,
        /Better Tasks/
      );
      assert.match(
        latestPanelConfig.settings.find((entry) => entry.id === "task-status-repeat-carry-over").description,
        /Better Tasks/
      );
      const aboutSetting = latestPanelConfig.settings.find((entry) => entry.id === "task-status-about");
      assert.equal(aboutSetting.name, "About");
      assert.equal(aboutSetting.action.type, "reactComponent");
      const aboutTree = aboutSetting.action.component();
      assert.equal(aboutTree.props.className, "ts-status-about");
      assert.equal(aboutTree.children[0].children[0], "Task Status Tags v0.2.0-second");
      assert.equal(
        aboutTree.children[1].props.href,
        "https://github.com/Svyk/Roam-Task-Status-Tags#readme"
      );

      const ownedCheckbox = new FakeElement("span");
      ownedCheckbox.className = "rm-checkbox rm-todo";
      ownedCheckbox.setAttribute("data-ts-checkbox-status", "ACTIVE");
      ownedCheckbox.setAttribute("data-ts-checkbox-shape", "active");
      ownedCheckbox.setAttribute("data-ts-checkbox-block-uid", "abcdefghi");
      ownedCheckbox.setAttribute("data-foreign-owner", "keep");
      document.body.appendChild(ownedCheckbox);

      const themeSetting = latestPanelConfig.settings.find(
        (entry) => entry.id === "task-status-theme"
      );
      assert.equal(themeSetting.action.type, "select");
      assert.deepEqual(themeSetting.action.items, ["Follow Roam", "Light", "Dark"]);
      assert.equal(document.documentElement.getAttribute("data-ts-theme"), "light");
      themeSetting.action.onChange("Dark");
      assert.equal(document.documentElement.getAttribute("data-ts-theme"), "dark");
      themeSetting.action.onChange("Light");
      assert.equal(document.documentElement.getAttribute("data-ts-theme"), "light");
      themeSetting.action.onChange("not-a-theme");
      assert.equal(document.documentElement.getAttribute("data-ts-theme"), "light");
      assert.ok(
        observed.some((observer) =>
          observer.targets.some(
            (entry) => entry.target === document.head && entry.options?.childList === true
          )
        ),
        "head childList observer should be registered"
      );
      assert.ok(scheduledDelays.includes(1500), "1500ms theme boot timeout should be scheduled");

      const styleSetting = latestPanelConfig.settings.find(
        (entry) => entry.id === "task-status-checkbox-style"
      );
      assert.equal(styleSetting.action.type, "select");
      assert.deepEqual(styleSetting.action.items, ["Outline", "Glass", "Solid", "Minimal"]);
      assert.equal(document.documentElement.getAttribute("data-ts-checkbox-style"), null);
      styleSetting.action.onChange("Glass");
      assert.equal(document.documentElement.getAttribute("data-ts-checkbox-style"), "glass");
      styleSetting.action.onChange("Solid");
      assert.equal(document.documentElement.getAttribute("data-ts-checkbox-style"), "solid");
      styleSetting.action.onChange("Minimal");
      assert.equal(document.documentElement.getAttribute("data-ts-checkbox-style"), "minimal");
      styleSetting.action.onChange("unknown-style");
      assert.equal(document.documentElement.getAttribute("data-ts-checkbox-style"), null);
      styleSetting.action.onChange("Solid");
      assert.equal(document.documentElement.getAttribute("data-ts-checkbox-style"), "solid");

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

      const popSetting = latestPanelConfig.settings.find(
        (entry) => entry.id === "task-status-change-animation"
      );
      assert.equal(popSetting.name, "Animate status changes");
      assert.equal(popSetting.action.type, "switch");
      popSetting.action.onChange(false);
      popSetting.action.onChange(true);
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
      assert.equal(document.documentElement.getAttribute("data-ts-theme"), null);
      assert.equal(document.documentElement.getAttribute("data-ts-checkbox-style"), null);
      assert.equal(activeTimers.size, 0);
      assert.ok(observed.every((observer) => observer.disconnected));
      assert.equal(document.body.children.filter((node) => node.className === "ts-status-portal").length, 0);
      assert.equal(activeCommands.size, 0);
      assert.equal(slashCalls.removed.length, 14);
      assert.equal(ownedCheckbox.getAttribute("data-ts-checkbox-status"), null);
      assert.equal(ownedCheckbox.getAttribute("data-ts-checkbox-shape"), null);
      assert.equal(ownedCheckbox.getAttribute("data-ts-checkbox-block-uid"), null);
      assert.equal(ownedCheckbox.getAttribute("data-ts-alert-beacon"), null);
      assert.equal(ownedCheckbox.getAttribute("data-foreign-owner"), "keep");
      assert.equal(ownedPill.getAttribute("data-ts-managed-status-pill"), null);
      assert.equal(ownedPill.getAttribute("data-ts-status-pill-hidden"), null);
      assert.equal(ownedPill.getAttribute("data-foreign-owner"), "keep");
      assert.equal(graphWriteCalls, 0);
      assert.deepEqual(noisyCalls, [], "load, settings changes, and unload must not log or info");
    } finally {
      console.log = originalConsoleLog;
      console.info = originalConsoleInfo;
    }
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.MutationObserver = originalMutationObserver;
  }
});

test("status-change pop triggers only on extension writes, respects setting off, and releases timers on cleanup", async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalMutationObserver = globalThis.MutationObserver;

  class PopFakeElement extends FakeElement {
    constructor(tagName = "div") {
      super(tagName);
      this.nodeType = 1;
      this.parentElement = null;
      this.checked = false;
    }
    append(...nodes) {
      for (const node of nodes) {
        node.parentNode = this;
        node.parentElement = this;
        node.isConnected = true;
        this.children.push(node);
      }
    }
    matches(selector) {
      return selector.split(",").map((s) => s.trim()).some((part) => {
        if (part === 'span.rm-page-ref[data-tag^="task-status/"]') {
          return this.tagName === "SPAN" && this.classList.contains("rm-page-ref") && String(this.getAttribute("data-tag") || "").startsWith("task-status/");
        }
        if (part === "span.rm-page-ref[data-task-status-key]") {
          return this.tagName === "SPAN" && this.classList.contains("rm-page-ref") && this.attributes.has("data-task-status-key");
        }
        if (part === ".rm-checkbox") return this.classList.contains("rm-checkbox");
        if (part === ".rm-checkbox[data-ts-checkbox-status]") {
          return this.classList.contains("rm-checkbox") && this.attributes.has("data-ts-checkbox-status");
        }
        if (part === "[data-ts-managed-status-pill]") return this.attributes.has("data-ts-managed-status-pill");
        if (part === 'input[type="checkbox"]') return this.tagName === "INPUT" && this.getAttribute("type") === "checkbox";
        if (part === ".checkmark") return this.classList.contains("checkmark");
        if (part === "[data-uid]") return this.attributes.has("data-uid");
        if (part === ".rm-block__input") return this.classList.contains("rm-block__input");
        if (part.startsWith(".rm-checkbox[data-ts-checkbox-status=\"")) {
          const m = part.match(/data-ts-checkbox-status="([^"]+)"\]\[data-ts-checkbox-block-uid="([^"]+)"/);
          return Boolean(
            m &&
              this.classList.contains("rm-checkbox") &&
              this.getAttribute("data-ts-checkbox-status") === m[1] &&
              this.getAttribute("data-ts-checkbox-block-uid") === m[2]
          );
        }
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
  }

  const document = new FakeDocument();
  document.body = new PopFakeElement("body");
  document.head = new PopFakeElement("head");
  document.documentElement = new PopFakeElement("html");
  document.body.isConnected = true;
  document.head.isConnected = true;
  document.documentElement.isConnected = true;
  document.createElement = (name) => new PopFakeElement(name);

  let blockString = "{{[[TODO]]}} #[[task-status/Active]] Ship pop";
  const blockEl = new PopFakeElement("div");
  blockEl.className = "rm-block__input";
  blockEl.setAttribute("data-uid", "popuid123");
  const checkbox = new PopFakeElement("span");
  checkbox.className = "rm-checkbox rm-todo";
  const label = new PopFakeElement("label");
  label.className = "check-container";
  const input = new PopFakeElement("input");
  input.setAttribute("type", "checkbox");
  input.checked = false;
  const checkmark = new PopFakeElement("span");
  checkmark.className = "checkmark";
  label.append(input, checkmark);
  checkbox.append(label);
  const pill = new PopFakeElement("span");
  pill.className = "rm-page-ref";
  pill.setAttribute("data-tag", "task-status/Active");
  blockEl.append(checkbox, pill);
  document.body.append(blockEl);

  const timers = new Map();
  let nextTimerId = 1;
  const fakeSetTimeout = (fn, delay = 0) => {
    const id = nextTimerId++;
    timers.set(id, { fn, delay });
    return id;
  };
  const fakeClearTimeout = (id) => {
    timers.delete(id);
  };

  const observers = [];
  class PopMutationObserver {
    constructor(cb) {
      this.cb = cb;
      this.targets = [];
      observers.push(this);
    }
    observe(target, opts) { this.targets.push({ target, opts }); }
    disconnect() {}
  }

  const noopApi = { addCommand: async () => {}, removeCommand: async () => {} };
  const windowLike = new EventTarget();
  Object.assign(windowLike, {
    document,
    CSS: { supports: () => true },
    React: { createElement: () => null },
    getComputedStyle: () => ({ backgroundColor: "rgb(255, 255, 255)", color: "rgb(20, 184, 166)" }),
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    requestAnimationFrame: (cb) => fakeSetTimeout(cb, 0),
    cancelAnimationFrame: fakeClearTimeout,
    innerWidth: 1280,
    innerHeight: 800,
    roamAlphaAPI: {
      data: {
        pull: () => ({ ":block/uid": "popuid123", ":block/string": blockString }),
        async: { pull: async () => ({ ":block/uid": "popuid123", ":block/string": blockString }) },
        block: {
          update: async ({ block }) => {
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
  });

  globalThis.window = windowLike;
  globalThis.document = document;
  globalThis.MutationObserver = PopMutationObserver;

  let panelConfig = null;
  const extensionAPI = {
    settings: {
      get: () => null,
      set: async () => {},
      panel: { create: async (cfg) => { panelConfig = cfg; } },
    },
    ui: { commandPalette: noopApi, slashCommand: noopApi },
  };

  let mod = null;
  try {
    mod = await import(`../src/extension.js?pop=${Date.now()}`);
    await mod.onload({ extensionAPI, extension: { version: "0.15.0" } });

    // Initial render claims checkbox without popping
    assert.equal(checkbox.getAttribute("data-ts-checkbox-status"), "ACTIVE");
    assert.equal(checkbox.getAttribute("data-ts-status-pop"), null);

    const bodyObserver = observers.find((o) =>
      o.targets.some((t) => t.target === document.body && t.opts?.subtree === true)
    );
    assert.ok(bodyObserver, "pill observer should be registered on document.body");

    // Manual edit / observer mutation without extension write never pops
    blockString = "{{[[TODO]]}} #[[task-status/Holding]] Ship pop";
    pill.setAttribute("data-tag", "task-status/Holding");
    bodyObserver.cb([{ type: "attributes", attributeName: "data-tag", target: pill }]);
    assert.equal(checkbox.getAttribute("data-ts-checkbox-status"), "HOLDING");
    assert.equal(checkbox.getAttribute("data-ts-status-pop"), null);

    // Extension write via public API triggers pop once Roam re-renders
    const writeRes = await windowLike.RoamTaskStatusTags.setStatus("popuid123", "Waiting");
    assert.equal(writeRes.status, "updated");
    assert.equal(checkbox.getAttribute("data-ts-status-pop"), null);

    pill.setAttribute("data-tag", "task-status/Waiting");
    bodyObserver.cb([{ type: "attributes", attributeName: "data-tag", target: pill }]);
    assert.equal(checkbox.getAttribute("data-ts-checkbox-status"), "WAITING");
    assert.equal(checkbox.getAttribute("data-ts-status-pop"), "true");

    // Running the pop timeout clears the attribute
    const popTimerEntry = [...timers.entries()].find(([, t]) => t.delay === 520);
    assert.ok(popTimerEntry, "expected pop cleanup timeout");
    popTimerEntry[1].fn();
    timers.delete(popTimerEntry[0]);
    assert.equal(checkbox.getAttribute("data-ts-status-pop"), null);

    // Turning the setting off prevents future pops
    const popSetting = panelConfig.settings.find((s) => s.id === "task-status-change-animation");
    popSetting.action.onChange(false);
    const writeOff = await windowLike.RoamTaskStatusTags.setStatus("popuid123", "Alert");
    assert.equal(writeOff.status, "updated");
    pill.setAttribute("data-tag", "task-status/Alert");
    bodyObserver.cb([{ type: "attributes", attributeName: "data-tag", target: pill }]);
    assert.equal(checkbox.getAttribute("data-ts-checkbox-status"), "ALERT");
    assert.equal(checkbox.getAttribute("data-ts-status-pop"), null);

    // Re-enable, start a pop, then onunload releases all timers and clears attribute
    popSetting.action.onChange(true);
    await windowLike.RoamTaskStatusTags.setStatus("popuid123", "Active");
    pill.setAttribute("data-tag", "task-status/Active");
    bodyObserver.cb([{ type: "attributes", attributeName: "data-tag", target: pill }]);
    assert.equal(checkbox.getAttribute("data-ts-status-pop"), "true");

    await mod.onunload();
    assert.equal(checkbox.getAttribute("data-ts-status-pop"), null);
    assert.equal(timers.size, 0);
  } finally {
    await mod?.onunload?.();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.MutationObserver = originalMutationObserver;
  }
});
