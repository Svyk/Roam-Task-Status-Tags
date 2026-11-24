import assert from "node:assert/strict";
import test from "node:test";

import {
  canOpenExtensionSettings,
  findExtensionSettingsCandidates,
  openExtensionSettings,
} from "../src/depot-settings.js";

test("findExtensionSettingsCandidates handles both developer URL and Roam Depot id forms, skips non-running, and puts onload id first", () => {
  const depot = {
    getInstalledExtensions: () => ({
      "other+plugin": { id: "other+plugin", running: true },
      "Svyk+Roam-Task-Status-Tags": {
        id: "Svyk+Roam-Task-Status-Tags",
        running: true,
      },
      "https://svyk.github.io/Roam-Task-Status-Tags/": {
        id: "https://svyk.github.io/Roam-Task-Status-Tags/",
        running: true,
      },
      "stopped+roam-task-status-tags": {
        id: "stopped+roam-task-status-tags",
        running: false,
      },
    }),
  };

  assert.deepEqual(findExtensionSettingsCandidates({ depot }), [
    "Svyk+Roam-Task-Status-Tags",
    "https://svyk.github.io/Roam-Task-Status-Tags/",
  ]);

  assert.deepEqual(
    findExtensionSettingsCandidates({
      depot,
      extensionId: "https://svyk.github.io/Roam-Task-Status-Tags/",
    }),
    [
      "https://svyk.github.io/Roam-Task-Status-Tags/",
      "Svyk+Roam-Task-Status-Tags",
    ]
  );

  assert.deepEqual(
    findExtensionSettingsCandidates({
      depot,
      extensionId: "custom-onload-id",
    }),
    [
      "custom-onload-id",
      "Svyk+Roam-Task-Status-Tags",
      "https://svyk.github.io/Roam-Task-Status-Tags/",
    ]
  );
});

test("findExtensionSettingsCandidates ignores non-running entries and missing/throwing API", () => {
  assert.deepEqual(findExtensionSettingsCandidates({}), []);
  assert.deepEqual(
    findExtensionSettingsCandidates({
      depot: {
        getInstalledExtensions: () => ({
          "Svyk+Roam-Task-Status-Tags": {
            id: "Svyk+Roam-Task-Status-Tags",
            running: false,
          },
          "https://svyk.github.io/Roam-Task-Status-Tags/": {
            id: "https://svyk.github.io/Roam-Task-Status-Tags/",
            running: false,
          },
        }),
      },
    }),
    []
  );
  assert.deepEqual(
    findExtensionSettingsCandidates({
      depot: {
        getInstalledExtensions: () => {
          throw new Error("boom");
        },
      },
    }),
    []
  );
});

test("canOpenExtensionSettings fails closed when openSettings is absent or no candidate exists", () => {
  assert.equal(canOpenExtensionSettings({ roamAlphaAPI: null }), false);
  assert.equal(canOpenExtensionSettings({ roamAlphaAPI: {} }), false);
  assert.equal(
    canOpenExtensionSettings({
      roamAlphaAPI: {
        depot: {
          getInstalledExtensions: () => ({
            "Svyk+Roam-Task-Status-Tags": {
              id: "Svyk+Roam-Task-Status-Tags",
              running: true,
            },
          }),
        },
      },
    }),
    false
  );
  assert.equal(
    canOpenExtensionSettings({
      roamAlphaAPI: {
        depot: {
          openSettings: async () => {},
          getInstalledExtensions: () => ({
            "other+ext": { id: "other+ext", running: true },
          }),
        },
      },
    }),
    false
  );
  assert.equal(
    canOpenExtensionSettings({
      roamAlphaAPI: {
        depot: {
          openSettings: async () => {},
          getInstalledExtensions: () => ({
            "Svyk+Roam-Task-Status-Tags": {
              id: "Svyk+Roam-Task-Status-Tags",
              running: true,
            },
          }),
        },
      },
    }),
    true
  );
});

test("openExtensionSettings tries candidates in order, stops at first resolution, and warns quietly if all reject", async () => {
  const attempted = [];
  const warnings = [];
  const res = await openExtensionSettings({
    extensionId: "https://svyk.github.io/Roam-Task-Status-Tags/",
    warn: (...args) => warnings.push(args),
    roamAlphaAPI: {
      depot: {
        getInstalledExtensions: () => ({
          "Svyk+Roam-Task-Status-Tags": {
            id: "Svyk+Roam-Task-Status-Tags",
            running: true,
          },
        }),
        openSettings: async ({ id }) => {
          attempted.push(id);
          if (id.startsWith("https://")) throw new Error("not found");
        },
      },
    },
  });
  assert.deepEqual(res, { opened: true, id: "Svyk+Roam-Task-Status-Tags" });
  assert.deepEqual(attempted, [
    "https://svyk.github.io/Roam-Task-Status-Tags/",
    "Svyk+Roam-Task-Status-Tags",
  ]);
  assert.equal(warnings.length, 0);

  // All reject: quiet warn, no throw
  const rejected = await openExtensionSettings({
    warn: (...args) => warnings.push(args),
    roamAlphaAPI: {
      depot: {
        getInstalledExtensions: () => ({
          "Svyk+Roam-Task-Status-Tags": {
            id: "Svyk+Roam-Task-Status-Tags",
            running: true,
          },
        }),
        openSettings: async () => {
          throw new Error("tab missing");
        },
      },
    },
  });
  assert.equal(rejected.opened, false);
  assert.equal(rejected.reason, "rejected");
  assert.equal(warnings.length, 1);

  // Missing API and no candidates
  assert.deepEqual(
    await openExtensionSettings({ roamAlphaAPI: {}, warn: () => assert.fail("should not warn") }),
    { opened: false, reason: "api-unavailable" }
  );
  assert.deepEqual(
    await openExtensionSettings({
      roamAlphaAPI: {
        depot: { openSettings: async () => {}, getInstalledExtensions: () => ({}) },
      },
      warn: () => assert.fail("should not warn"),
    }),
    { opened: false, reason: "no-candidates" }
  );
});

test("chooser Settings… item and palette command wire when available, omit when absent, and make no graph writes", async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalMutationObserver = globalThis.MutationObserver;

  class FakeClassList {
    constructor(owner) { this.owner = owner; }
    values() { return new Set(String(this.owner.className || "").split(/\s+/).filter(Boolean)); }
    contains(v) { return this.values().has(v); }
    toggle(v, force) {
      const s = this.values();
      const next = typeof force === "boolean" ? force : !s.has(v);
      if (next) s.add(v); else s.delete(v);
      this.owner.className = [...s].join(" ");
      return next;
    }
    add(...items) { const s = this.values(); items.forEach((i) => s.add(i)); this.owner.className = [...s].join(" "); }
    remove(...items) { const s = this.values(); items.forEach((i) => s.delete(i)); this.owner.className = [...s].join(" "); }
  }
  class FakeElement extends EventTarget {
    constructor(tag = "div") {
      super();
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.parentElement = null;
      this.attributes = new Map();
      this.className = "";
      this.classList = new FakeClassList(this);
      this.isConnected = false;
      this.textContent = "";
      this.style = { color: "", setProperty() {}, removeProperty() {} };
    }
    append(...nodes) {
      for (const n of nodes) {
        if (typeof n === "string") continue;
        n.parentNode = this;
        n.parentElement = this;
        n.isConnected = true;
        this.children.push(n);
      }
    }
    appendChild(n) { this.append(n); return n; }
    remove() {
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
      this.parentNode = null;
      this.parentElement = null;
      this.isConnected = false;
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.get(k) ?? null; }
    removeAttribute(k) { this.attributes.delete(k); }
    contains(node) { let c = node; while (c) { if (c === this) return true; c = c.parentNode; } return false; }
    getBoundingClientRect() { return { left: 200, top: 100, width: 140, height: 220, right: 340, bottom: 320 }; }
    focus() {}
    matches(selector) {
      return selector.split(",").map((s) => s.trim()).some((part) => {
        if (part === ".ts-status-chooser") return this.classList.contains("ts-status-chooser");
        if (part === ".ts-status-choice") return this.classList.contains("ts-status-choice");
        if (part === ".ts-status-choice-settings") return this.classList.contains("ts-status-choice-settings");
        if (part === ".ts-status-choice-view") return this.classList.contains("ts-status-choice-view");
        if (part === ".ts-status-choice-label") return this.classList.contains("ts-status-choice-label");
        if (part === "span.rm-page-ref[data-tag]") return this.tagName === "SPAN" && this.classList.contains("rm-page-ref") && this.attributes.has("data-tag");
        if (part === "[data-uid]") return this.attributes.has("data-uid");
        return false;
      });
    }
    closest(selector) { let c = this; while (c) { if (c.matches?.(selector)) return c; c = c.parentElement; } return null; }
    querySelectorAll(selector) {
      const out = [];
      const walk = (n) => {
        for (const ch of n.children || []) {
          if (ch.matches?.(selector)) out.push(ch);
          walk(ch);
        }
      };
      walk(this);
      return out;
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
    createElement(n) { return new FakeElement(n); }
    createElementNS(_, n) { return new FakeElement(n); }
    querySelectorAll(s) {
      return [
        ...this.documentElement.querySelectorAll(s),
        ...this.head.querySelectorAll(s),
        ...this.body.querySelectorAll(s),
      ];
    }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
    getElementById() { return null; }
  }

  async function runScenario(depot) {
    const document = new FakeDocument();
    const blockString = "{{[[TODO]]}} #[[task-status/Active]] Check settings link";
    let writes = 0;
    const paletteCommands = new Map();
    const paletteApi = {
      addCommand: async (cmd) => { paletteCommands.set(cmd.label, cmd); },
      removeCommand: async ({ label }) => { paletteCommands.delete(label); },
    };
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
      addEventListener(type, fn) {
        if (!windowListeners.has(type)) windowListeners.set(type, []);
        windowListeners.get(type).push(fn);
      },
      removeEventListener(type, fn) {
        windowListeners.set(type, (windowListeners.get(type) || []).filter((f) => f !== fn));
      },
      dispatchEvent(ev) {
        for (const fn of [...(windowListeners.get(ev.type) || [])]) fn(ev);
        return true;
      },
      roamAlphaAPI: {
        depot,
        data: {
          pull: () => ({ ":block/uid": "setuid123", ":block/string": blockString }),
          async: { pull: async () => ({ ":block/uid": "setuid123", ":block/string": blockString }) },
          block: { update: async () => { writes += 1; } },
        },
        ui: {
          commandPalette: paletteApi,
          blockContextMenu: noopApi,
          msContextMenu: noopApi,
        },
      },
    };
    class FakeMutationObserver { observe() {} disconnect() {} }
    globalThis.window = windowLike;
    globalThis.document = document;
    globalThis.MutationObserver = FakeMutationObserver;

    const extensionAPI = {
      settings: { get: () => null, set: async () => {}, panel: { create: async () => {} } },
      ui: { commandPalette: paletteApi, slashCommand: noopApi },
    };
    const mod = await import(`../src/extension.js?depot=${Date.now()}-${Math.random()}`);
    await mod.onload({ extensionAPI, extension: { version: "0.15.0" } });

    const block = new FakeElement("div");
    block.setAttribute("data-uid", "setuid123");
    const pill = new FakeElement("span");
    pill.className = "rm-page-ref";
    pill.setAttribute("data-tag", "task-status/Active");
    block.append(pill);
    document.body.append(block);

    windowLike.dispatchEvent({
      type: "click",
      target: pill,
      shiftKey: false,
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {},
    });
    await new Promise((r) => setTimeout(r, 10));

    const chooser = document.querySelector(".ts-status-chooser");
    const choices = chooser ? chooser.querySelectorAll(".ts-status-choice") : [];
    const settingsItem = chooser?.querySelector(".ts-status-choice-settings") || null;

    return {
      mod,
      document,
      paletteCommands,
      choices,
      settingsItem,
      getWrites: () => writes,
    };
  }

  let activeMod = null;
  try {
    // 1. Depot available -> palette command registered and chooser Settings… is last after Watching now…
    const opened = [];
    const withDepot = await runScenario({
      getInstalledExtensions: () => ({
        "Svyk+Roam-Task-Status-Tags": { id: "Svyk+Roam-Task-Status-Tags", running: true },
      }),
      openSettings: async ({ id }) => { opened.push(id); },
    });
    activeMod = withDepot.mod;
    assert.ok(withDepot.paletteCommands.has("Task Status: Open settings"));
    assert.ok(withDepot.settingsItem, "Settings… item should be rendered");
    const lastTwo = withDepot.choices.slice(-2);
    assert.equal(lastTwo[0].classList.contains("ts-status-choice-view"), true);
    assert.equal(lastTwo[1].classList.contains("ts-status-choice-settings"), true);
    assert.equal(lastTwo[1].querySelector(".ts-status-choice-label")?.textContent, "Settings\u2026");

    // Clicking Settings… closes chooser, opens settings, makes zero graph writes
    const clickEvent = new Event("click");
    clickEvent.preventDefault = () => {};
    clickEvent.stopPropagation = () => {};
    clickEvent.stopImmediatePropagation = () => {};
    withDepot.settingsItem.dispatchEvent(clickEvent);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(withDepot.document.querySelector(".ts-status-chooser"), null);
    assert.deepEqual(opened, ["Svyk+Roam-Task-Status-Tags"]);
    assert.equal(withDepot.getWrites(), 0);

    // Palette command opens settings with zero graph writes and unregisters on unload
    withDepot.paletteCommands.get("Task Status: Open settings").callback();
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(opened, ["Svyk+Roam-Task-Status-Tags", "Svyk+Roam-Task-Status-Tags"]);
    assert.equal(withDepot.getWrites(), 0);
    await withDepot.mod.onunload();
    activeMod = null;
    assert.equal(withDepot.paletteCommands.has("Task Status: Open settings"), false);

    // 2. Depot missing -> neither chooser item nor palette command is shown
    const withoutDepot = await runScenario(undefined);
    activeMod = withoutDepot.mod;
    assert.equal(withoutDepot.paletteCommands.has("Task Status: Open settings"), false);
    assert.equal(withoutDepot.settingsItem, null);
    await withoutDepot.mod.onunload();
    activeMod = null;
  } finally {
    await activeMod?.onunload?.();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.MutationObserver = originalMutationObserver;
  }
});
