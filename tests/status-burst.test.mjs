import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createLifecycle } from "../src/lifecycle.js";
import {
  BURST_CANVAS_ATTRIBUTE,
  BURST_CANVAS_CLASS,
  MAPPED_BURST_SHAPES,
  buildGenericBurstColors,
  createStatusBurstSystem,
  isBurstBlockedByMedia,
  isBurstStyleActive,
  parseColorToHex,
} from "../src/status-burst.js";

function createFakeCanvasContext() {
  const ops = [];
  return {
    ops,
    setTransform(...args) { ops.push(["setTransform", ...args]); },
    clearRect(...args) { ops.push(["clearRect", ...args]); },
    save() { ops.push(["save"]); },
    restore() { ops.push(["restore"]); },
    translate(...args) { ops.push(["translate", ...args]); },
    rotate(...args) { ops.push(["rotate", ...args]); },
    beginPath() { ops.push(["beginPath"]); },
    closePath() { ops.push(["closePath"]); },
    moveTo(...args) { ops.push(["moveTo", ...args]); },
    lineTo(...args) { ops.push(["lineTo", ...args]); },
    bezierCurveTo(...args) { ops.push(["bezierCurveTo", ...args]); },
    arc(...args) { ops.push(["arc", ...args]); },
    ellipse(...args) { ops.push(["ellipse", ...args]); },
    setLineDash(...args) { ops.push(["setLineDash", ...args]); },
    stroke() { ops.push(["stroke"]); },
    fill() { ops.push(["fill"]); },
    fillRect(...args) { ops.push(["fillRect", ...args]); },
  };
}

function createFakeEnvironment({
  reducedMotion = false,
  forcedColors = false,
} = {}) {
  const bodyChildren = [];
  const createdCanvases = [];
  const windowListeners = new Map();
  let nextRafId = 1;
  const rafQueue = new Map();
  const cancelledRafIds = [];
  let now = 1000;

  const documentLike = {
    body: {
      children: bodyChildren,
      appendChild(node) {
        bodyChildren.push(node);
        node.isConnected = true;
        return node;
      },
    },
    createElement(tag) {
      const attrs = new Map();
      const ctx = tag === "canvas" ? createFakeCanvasContext() : null;
      const el = {
        tagName: tag.toUpperCase(),
        className: "",
        style: {},
        width: 0,
        height: 0,
        isConnected: false,
        setAttribute(k, v) { attrs.set(k, String(v)); },
        getAttribute(k) { return attrs.get(k) ?? null; },
        getContext(type) { return type === "2d" ? ctx : null; },
        remove() {
          const idx = bodyChildren.indexOf(el);
          if (idx >= 0) bodyChildren.splice(idx, 1);
          el.isConnected = false;
        },
        _ctx: ctx,
      };
      if (tag === "canvas") createdCanvases.push(el);
      return el;
    },
  };

  const windowLike = {
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 2,
    performance: { now: () => now },
    matchMedia(query) {
      if (query.includes("prefers-reduced-motion")) return { matches: reducedMotion };
      if (query.includes("forced-colors")) return { matches: forcedColors };
      return { matches: false };
    },
    requestAnimationFrame(cb) {
      const id = nextRafId++;
      rafQueue.set(id, cb);
      return id;
    },
    cancelAnimationFrame(id) {
      cancelledRafIds.push(id);
      rafQueue.delete(id);
    },
    addEventListener(type, fn) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      windowListeners.get(type)?.delete(fn);
    },
  };

  const makeCheckbox = ({ shape = "active", checked = false, rect = { left: 100, top: 80, width: 18, height: 18 } } = {}) => ({
    getAttribute(name) {
      if (name === "data-ts-checkbox-shape") return shape;
      return null;
    },
    querySelector(sel) {
      if (sel === 'input[type="checkbox"]') return { checked };
      if (sel === ".checkmark") return { getBoundingClientRect: () => rect };
      return null;
    },
  });

  const stepFrame = (deltaMs) => {
    now += deltaMs;
    const entries = [...rafQueue.entries()];
    rafQueue.clear();
    for (const [, cb] of entries) cb(now);
  };

  return {
    documentLike,
    windowLike,
    bodyChildren,
    createdCanvases,
    windowListeners,
    rafQueue,
    cancelledRafIds,
    makeCheckbox,
    stepFrame,
    setReducedMotion(val) { reducedMotion = val; },
    setForcedColors(val) { forcedColors = val; },
    getNow: () => now,
  };
}

test("burst canvas is lazy, never created in Outline, when disabled, under reduced motion/forced colors, or for checked tasks", () => {
  const env = createFakeEnvironment();
  let style = "Outline";
  let enabled = true;
  const burst = createStatusBurstSystem({
    documentLike: env.documentLike,
    windowLike: env.windowLike,
    getStyle: () => style,
    isEnabled: () => enabled,
  });

  assert.equal(burst.canvas, null);
  assert.equal(env.createdCanvases.length, 0);

  // Outline: no burst, no canvas
  assert.equal(burst.emitForCheckbox(env.makeCheckbox({ shape: "active" })), false);
  assert.equal(env.createdCanvases.length, 0);

  // Disabled: no burst, no canvas
  style = "Glass";
  enabled = false;
  assert.equal(burst.emitForCheckbox(env.makeCheckbox({ shape: "active" })), false);
  assert.equal(env.createdCanvases.length, 0);

  // Reduced motion: no burst, no canvas
  enabled = true;
  env.setReducedMotion(true);
  assert.equal(isBurstBlockedByMedia(env.windowLike), true);
  assert.equal(burst.emitForCheckbox(env.makeCheckbox({ shape: "active" })), false);
  assert.equal(env.createdCanvases.length, 0);

  // Forced colors: no burst, no canvas
  env.setReducedMotion(false);
  env.setForcedColors(true);
  assert.equal(isBurstBlockedByMedia(env.windowLike), true);
  assert.equal(burst.emitForCheckbox(env.makeCheckbox({ shape: "active" })), false);
  assert.equal(env.createdCanvases.length, 0);

  // Checked task: no burst, no canvas
  env.setForcedColors(false);
  assert.equal(burst.emitForCheckbox(env.makeCheckbox({ shape: "active", checked: true })), false);
  assert.equal(env.createdCanvases.length, 0);

  burst.dispose();
});

test("burst lazily creates one owned canvas, runs all mapped & generic bursts, stops RAF when done, and cleans up via lifecycle", () => {
  const env = createFakeEnvironment();
  const lifecycle = createLifecycle();
  const burst = createStatusBurstSystem({
    documentLike: env.documentLike,
    windowLike: env.windowLike,
    lifecycle,
    getStyle: () => "Glass",
    isEnabled: () => true,
  });

  assert.equal(env.createdCanvases.length, 0);
  const played = burst.emitForCheckbox(env.makeCheckbox({ shape: "starred" }));
  assert.equal(played, true);
  assert.equal(env.createdCanvases.length, 1);
  assert.equal(env.bodyChildren.length, 1);
  const canvas = env.createdCanvases[0];
  assert.equal(canvas.className, BURST_CANVAS_CLASS);
  assert.equal(canvas.getAttribute(BURST_CANVAS_ATTRIBUTE), "true");
  assert.equal(canvas.getAttribute("aria-hidden"), "true");
  assert.equal(canvas.style.position, "fixed");
  assert.equal(canvas.style.pointerEvents, "none");
  assert.equal(burst.hasFrameScheduled, true);
  assert.ok(burst.activeCount > 0);
  assert.equal(env.windowListeners.get("resize")?.size, 1);

  // Step frames until all particles expire; RAF stops itself automatically
  env.stepFrame(16);
  assert.ok(canvas._ctx.ops.some((op) => op[0] === "fill" || op[0] === "stroke"));
  for (let i = 0; i < 40; i += 1) env.stepFrame(50);
  assert.equal(burst.activeCount, 0);
  assert.equal(burst.hasFrameScheduled, false);
  assert.equal(env.rafQueue.size, 0);

  // Every mapped shape + generic unmapped shapes reuse the SAME single canvas
  for (const shape of [...MAPPED_BURST_SHAPES, "in-review", "watching", "custom"]) {
    assert.equal(
      burst.emitForCheckbox(env.makeCheckbox({ shape }), { shape, color: "rgb(14, 165, 233)" }),
      true,
      `burst should emit for ${shape}`
    );
    env.stepFrame(16);
  }
  assert.equal(env.createdCanvases.length, 1, "must reuse one canvas");
  assert.equal(burst.hasFrameScheduled, true);

  // Lifecycle cleanup cancels active RAF, removes resize listener, removes canvas
  lifecycle.dispose();
  assert.equal(burst.canvas, null);
  assert.equal(env.bodyChildren.length, 0);
  assert.equal(burst.hasFrameScheduled, false);
  assert.ok(env.cancelledRafIds.length > 0);
  assert.equal(env.windowListeners.get("resize")?.size, 0);
});

test("burst color helpers and module attribution / boundary guards", async () => {
  assert.equal(parseColorToHex("#abc"), "#aabbcc");
  assert.equal(parseColorToHex("rgb(14, 165, 233)"), "#0ea5e9");
  assert.equal(parseColorToHex("not-a-color", "#14b8a6"), "#14b8a6");
  const generic = buildGenericBurstColors("#0ea5e9");
  assert.equal(generic.length, 3);
  assert.equal(generic[0], "#0ea5e9");
  assert.equal(isBurstStyleActive("Outline"), false);
  assert.equal(isBurstStyleActive("Glass"), true);
  assert.equal(isBurstStyleActive("Solid"), true);
  assert.equal(isBurstStyleActive("Minimal"), true);

  const burstSource = await readFile(new URL("../src/status-burst.js", import.meta.url), "utf8");
  assert.match(
    burstSource,
    /^\/\/ Adapted from BetterTask by imhalid \(MIT\)\. See THIRD_PARTY_NOTICES\.md\./
  );
  assert.doesNotMatch(burstSource, /roamAlphaAPI|data\.pull|data\.q|data\.block|betterTasks/);
  assert.doesNotMatch(burstSource, /\bbt-/);
});
