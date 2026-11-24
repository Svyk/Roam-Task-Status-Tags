// Adapted from BetterTask by imhalid (MIT). See THIRD_PARTY_NOTICES.md.

export const BURST_CANVAS_ATTRIBUTE = "data-ts-burst-canvas";
export const BURST_CANVAS_CLASS = "ts-burst-canvas";

const BURST_SPECS = Object.freeze({
  active: Object.freeze({ kind: "started", colors: Object.freeze(["#38bdf8", "#22d3ee", "#bae6fd"]) }),
  waiting: Object.freeze({ kind: "blocked", colors: Object.freeze(["#fbbf24", "#f59e0b", "#fde68a"]) }),
  billable: Object.freeze({ kind: "dollar", colors: Object.freeze(["#4ade80", "#a3e635", "#fde047"]) }),
  important: Object.freeze({ kind: "exclaim", colors: Object.freeze(["#fb7185", "#f43f5e", "#fecdd3"]) }),
  discuss: Object.freeze({ kind: "question", colors: Object.freeze(["#c084fc", "#a78bfa", "#ede9fe"]) }),
  alert: Object.freeze({ kind: "alert", colors: Object.freeze(["#ef4444", "#f97316", "#fde047"]) }),
  starred: Object.freeze({ kind: "starred", colors: Object.freeze(["#fde047", "#facc15", "#f59e0b"]) }),
  cancelled: Object.freeze({ kind: "canceled", colors: Object.freeze(["#94a3b8", "#cbd5e1", "#64748b"]) }),
  kawaii: Object.freeze({ kind: "kawaii", colors: Object.freeze(["#f9a8d4", "#f472b6", "#c4b5fd"]) }),
  bug: Object.freeze({ kind: "bug", colors: Object.freeze(["#a3e635", "#65a30d", "#d9f99d"]) }),
  draft: Object.freeze({ kind: "draft", colors: Object.freeze(["#93c5fd", "#3b82f6", "#dbeafe"]) }),
  deadline: Object.freeze({ kind: "deadline", colors: Object.freeze(["#fb923c", "#f97316", "#fed7aa"]) }),
  flower: Object.freeze({ kind: "flower", colors: Object.freeze(["#f0abfc", "#e879f9", "#fde68a"]) }),
  sun: Object.freeze({ kind: "sun", colors: Object.freeze(["#fde047", "#fb923c", "#fef3c7"]) }),
  moon: Object.freeze({ kind: "moon", colors: Object.freeze(["#c7d2fe", "#a5b4fc", "#e0e7ff"]) }),
});

export const MAPPED_BURST_SHAPES = Object.freeze(Object.keys(BURST_SPECS));

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function byteHex(n) {
  return clampByte(n).toString(16).padStart(2, "0");
}

function rgbToHex(r, g, b) {
  return `#${byteHex(r)}${byteHex(g)}${byteHex(b)}`;
}

export function parseColorToHex(color, fallback = "#38bdf8") {
  const raw = String(color || "").trim();
  const hex6 = raw.match(/^#([0-9a-f]{6})$/i);
  if (hex6) return `#${hex6[1].toLowerCase()}`;
  const hex3 = raw.match(/^#([0-9a-f]{3})$/i);
  if (hex3) {
    const [r, g, b] = hex3[1];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const rgb = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  }
  return fallback;
}

function mixHex(hexA, hexB, ratio) {
  const a = parseColorToHex(hexA).slice(1);
  const b = parseColorToHex(hexB).slice(1);
  const t = Math.max(0, Math.min(1, ratio));
  const ar = parseInt(a.slice(0, 2), 16);
  const ag = parseInt(a.slice(2, 4), 16);
  const ab = parseInt(a.slice(4, 6), 16);
  const br = parseInt(b.slice(0, 2), 16);
  const bg = parseInt(b.slice(2, 4), 16);
  const bb = parseInt(b.slice(4, 6), 16);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

function hexToRgba(hex, alpha) {
  const h = parseColorToHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

export function buildGenericBurstColors(color) {
  const base = parseColorToHex(color, "#38bdf8");
  return [base, mixHex(base, "#ffffff", 0.45), mixHex(base, "#0f172a", 0.22)];
}

export function isBurstBlockedByMedia(windowLike = typeof window !== "undefined" ? window : null) {
  try {
    if (!windowLike?.matchMedia) return false;
    return Boolean(
      windowLike.matchMedia("(prefers-reduced-motion: reduce)")?.matches ||
        windowLike.matchMedia("(forced-colors: active)")?.matches
    );
  } catch (_) {
    return false;
  }
}

export function isBurstStyleActive(styleValue) {
  const normalized = String(styleValue || "").trim().toLowerCase();
  return normalized === "glass" || normalized === "solid" || normalized === "minimal";
}

function readCheckboxRect(checkbox) {
  if (!checkbox) return null;
  const target =
    checkbox.querySelector?.(".checkmark") ||
    checkbox.querySelector?.(".check-container") ||
    checkbox;
  const rect = target?.getBoundingClientRect?.();
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  return rect;
}

export function createStatusBurstSystem({
  documentLike = typeof document !== "undefined" ? document : null,
  windowLike = typeof window !== "undefined" ? window : globalThis,
  lifecycle = null,
  getStyle = () => "Outline",
  isEnabled = () => true,
  nowFn = null,
  randomFn = Math.random,
} = {}) {
  let canvas = null;
  let ctx = null;
  let rings = [];
  let motes = [];
  let rafId = 0;
  let lastMs = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let disposed = false;
  let resizeBound = false;

  const getNow = () => {
    if (typeof nowFn === "function") return nowFn();
    if (typeof windowLike?.performance?.now === "function") return windowLike.performance.now();
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  };

  const requestFrame = (callback) =>
    (windowLike?.requestAnimationFrame || globalThis.requestAnimationFrame)?.(callback) || 0;
  const cancelFrame = (id) => {
    if (!id) return;
    (windowLike?.cancelAnimationFrame || globalThis.cancelAnimationFrame)?.(id);
  };

  function resize() {
    if (!canvas) return;
    dpr = Math.min(2, Number(windowLike?.devicePixelRatio) || 1);
    width = Number(windowLike?.innerWidth) || 1200;
    height = Number(windowLike?.innerHeight) || 800;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  const handleResize = () => resize();

  function mount() {
    if (disposed || canvas || !documentLike?.body) return false;
    const el = documentLike.createElement("canvas");
    el.className = BURST_CANVAS_CLASS;
    el.setAttribute(BURST_CANVAS_ATTRIBUTE, "true");
    el.setAttribute("aria-hidden", "true");
    if (el.style) {
      el.style.position = "fixed";
      el.style.inset = "0";
      el.style.width = "100vw";
      el.style.height = "100vh";
      el.style.pointerEvents = "none";
      el.style.zIndex = "9998";
    }
    const nextCtx = el.getContext?.("2d") || null;
    if (!nextCtx) return false;
    documentLike.body.appendChild(el);
    canvas = el;
    ctx = nextCtx;
    resize();
    if (!resizeBound && typeof windowLike?.addEventListener === "function") {
      windowLike.addEventListener("resize", handleResize);
      resizeBound = true;
    }
    return true;
  }

  function active() {
    return rings.length > 0 || motes.length > 0;
  }

  function clear() {
    if (rafId) {
      cancelFrame(rafId);
      rafId = 0;
    }
    lastMs = 0;
    rings = [];
    motes = [];
    if (ctx && canvas) {
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } catch (_) {}
    }
  }

  function frame(now) {
    rafId = 0;
    if (disposed || !ctx || !canvas) return;
    const dt = lastMs ? Math.min(0.05, Math.max(0.001, (now - lastMs) / 1000)) : 0.016;
    lastMs = now;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const nextRings = [];
    for (const r of rings) {
      const f = (now - r.t0) / r.dur;
      if (f < 0) {
        nextRings.push(r);
        continue;
      }
      if (f >= 1) continue;
      nextRings.push(r);
      const ease = 1 - (1 - f) * (1 - f) * (1 - f);
      const rad = r.r0 + (r.r1 - r.r0) * ease;
      const alpha = (1 - f) * 0.85;
      ctx.save();
      if (r.dashed && typeof ctx.setLineDash === "function") ctx.setLineDash([3.5, 3]);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(0.7, r.width * (1 - f * 0.7));
      ctx.strokeStyle = hexToRgba(r.col, alpha);
      ctx.stroke();
      ctx.restore();
    }
    rings = nextRings;

    const nextMotes = [];
    for (const m of motes) {
      const f = (now - m.t0) / m.life;
      if (f >= 1) continue;
      nextMotes.push(m);
      const drag = Math.exp(-(m.drag || 3) * dt);
      m.vx *= drag;
      m.vy *= drag;
      m.vy += (m.grav || 0) * dt;
      if (m.sway !== undefined) m.vx += Math.sin(now * 0.012 + m.sway) * 28 * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.vRot) m.rot = (m.rot || 0) + m.vRot * dt;

      let alpha = 1 - f * f;
      if (m.twinkle !== undefined) alpha *= 0.55 + 0.45 * Math.sin(now * 0.025 + m.twinkle);
      const s = m.size * (m.kind === "bubble" ? 0.65 + 0.55 * f : 1 - 0.35 * f);
      if (m.wiggle !== undefined) {
        m.rot = Math.atan2(m.vy, m.vx) + Math.PI / 2 + Math.sin(now * 0.05 + m.wiggle) * 0.35;
      }
      ctx.save();
      ctx.translate(m.x, m.y);
      if (m.rot) ctx.rotate(m.rot);
      if (m.kind === "star") {
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.28, -s * 0.28);
        ctx.lineTo(s, 0);
        ctx.lineTo(s * 0.28, s * 0.28);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.28, s * 0.28);
        ctx.lineTo(-s, 0);
        ctx.lineTo(-s * 0.28, -s * 0.28);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(m.col, alpha);
        ctx.fill();
      } else if (m.kind === "chevron") {
        ctx.beginPath();
        ctx.moveTo(-s * 0.45, -s * 0.65);
        ctx.lineTo(s * 0.55, 0);
        ctx.lineTo(-s * 0.45, s * 0.65);
        ctx.lineWidth = Math.max(1.2, s * 0.34);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = hexToRgba(m.col, alpha);
        ctx.stroke();
      } else if (m.kind === "bubble") {
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = hexToRgba(m.col, alpha * 0.9);
        ctx.fillStyle = hexToRgba(m.col, alpha * 0.22);
        ctx.fill();
        ctx.stroke();
      } else if (m.kind === "coin") {
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(m.col, alpha * 0.85);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = hexToRgba("#fef08a", alpha);
        ctx.stroke();
      } else if (m.kind === "spike" || m.kind === "slash") {
        ctx.beginPath();
        ctx.moveTo(-s * 0.65, 0);
        ctx.lineTo(s * 0.65, 0);
        ctx.lineWidth = Math.max(1.2, m.size * 0.32 * (1 - f * 0.6));
        ctx.lineCap = "round";
        ctx.strokeStyle = hexToRgba(m.col, alpha);
        ctx.stroke();
      } else if (m.kind === "heart") {
        ctx.beginPath();
        ctx.moveTo(0, s * 0.8);
        ctx.bezierCurveTo(-s * 1.25, 0, -s * 0.6, -s * 1.05, 0, -s * 0.35);
        ctx.bezierCurveTo(s * 0.6, -s * 1.05, s * 1.25, 0, 0, s * 0.8);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(m.col, alpha);
        ctx.fill();
      } else if (m.kind === "beetle") {
        ctx.fillStyle = hexToRgba(m.col, alpha);
        ctx.beginPath();
        if (typeof ctx.ellipse === "function") {
          ctx.ellipse(0, s * 0.15, s * 0.55, s * 0.75, 0, 0, Math.PI * 2);
        } else {
          ctx.arc(0, s * 0.15, s * 0.6, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -s * 0.78, s * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(m.col, alpha * 0.85);
        ctx.lineWidth = Math.max(0.6, s * 0.14);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-s * 0.15, -s * 1.0);
        ctx.lineTo(-s * 0.5, -s * 1.45);
        ctx.moveTo(s * 0.15, -s * 1.0);
        ctx.lineTo(s * 0.5, -s * 1.45);
        ctx.stroke();
      } else if (m.kind === "drop") {
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.bezierCurveTo(s * 0.6, -s * 0.2, s * 0.7, s * 0.6, 0, s * 0.65);
        ctx.bezierCurveTo(-s * 0.7, s * 0.6, -s * 0.6, -s * 0.2, 0, -s);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(m.col, alpha);
        ctx.fill();
      } else if (m.kind === "petal") {
        ctx.beginPath();
        if (typeof ctx.ellipse === "function") {
          ctx.ellipse(0, 0, s * 0.42, s * 0.9, 0, 0, Math.PI * 2);
        } else {
          ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2);
        }
        ctx.fillStyle = hexToRgba(m.col, alpha * 0.9);
        ctx.fill();
      } else if (m.kind === "bar") {
        ctx.fillStyle = hexToRgba(m.col, alpha);
        ctx.fillRect(-s * 0.35, -s * 0.8, s * 0.7, s * 1.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(m.col, alpha);
        ctx.fill();
      }
      ctx.restore();
    }
    motes = nextMotes;

    if (active()) {
      rafId = requestFrame(frame);
    } else {
      lastMs = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width * dpr, height * dpr);
    }
  }

  function kick() {
    if (!rafId && active()) {
      lastMs = 0;
      rafId = requestFrame(frame);
    }
  }

  function emitAt(shape, x, y, { size = 18, color = null, bypassChecks = false } = {}) {
    if (disposed || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (!bypassChecks) {
      if (!isEnabled() || !isBurstStyleActive(getStyle()) || isBurstBlockedByMedia(windowLike)) {
        return false;
      }
    }
    if (!canvas && !mount()) return false;
    else if (!active() && Math.min(2, Number(windowLike?.devicePixelRatio) || 1) !== dpr) {
      resize();
    }

    const shapeKey = String(shape || "").trim().toLowerCase();
    const spec = BURST_SPECS[shapeKey] || null;
    const status = spec ? spec.kind : "generic";
    const cols = spec ? spec.colors : buildGenericBurstColors(color);
    const u = Math.max(0.75, Math.min(1.6, (Number(size) || 18) / 18));
    const now = getNow();
    const rand = randomFn;

    const bigRing = status === "alert" || status === "sun" || status === "deadline";
    rings.push({
      x,
      y,
      t0: now,
      dur:
        status === "alert" || status === "sun"
          ? 520
          : status === "blocked" || status === "deadline" || status === "moon"
            ? 560
            : 380,
      r0: 5 * u,
      r1: (bigRing ? 28 : status === "starred" || status === "kawaii" ? 26 : 22) * u,
      width: (bigRing ? 2.4 : 2.0) * u,
      col: cols[0],
      dashed: status === "blocked" || status === "deadline",
    });

    if (
      status === "alert" ||
      status === "exclaim" ||
      status === "sun" ||
      status === "kawaii"
    ) {
      rings.push({
        x,
        y,
        t0: now + 70,
        dur: 420,
        r0: 4 * u,
        r1: (status === "alert" ? 34 : 20) * u,
        width: 1.4 * u,
        col: cols[1] || cols[0],
        dashed: false,
      });
    }

    const pushMote = (m) => {
      if (motes.length < 220) motes.push({ x, y, t0: now, ...m });
    };

    if (status === "started") {
      for (let i = 0; i < 8; i++) {
        const spread = (rand() - 0.5) * 0.8;
        const spd = (95 + rand() * 145) * u;
        pushMote({
          kind: i < 3 ? "chevron" : "spark",
          vx: Math.cos(spread) * spd,
          vy: Math.sin(spread) * spd,
          grav: 0,
          drag: 4.5,
          size: (i < 3 ? 4.2 : 2.1) * u,
          life: 320 + rand() * 140,
          col: cols[i % cols.length],
        });
      }
    } else if (status === "blocked") {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.25;
        const spd = (32 + rand() * 38) * u;
        pushMote({
          kind: "bar",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd + 15 * u,
          grav: 65 * u,
          drag: 3.5,
          size: (2.2 + rand() * 1.2) * u,
          rot: 0,
          vRot: 0,
          life: 440 + rand() * 140,
          col: cols[i % cols.length],
        });
      }
    } else if (status === "dollar") {
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 1.8;
        const spd = (75 + rand() * 115) * u;
        pushMote({
          kind: i % 3 === 0 ? "coin" : "star",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 230 * u,
          drag: 2.2,
          size: (i % 3 === 0 ? 3.2 : 3.6) * u,
          rot: rand() * Math.PI,
          vRot: (rand() - 0.5) * 7,
          life: 460 + rand() * 180,
          col: cols[i % cols.length],
        });
      }
    } else if (status === "exclaim") {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + (rand() - 0.5) * 0.2;
        const spd = (90 + rand() * 110) * u;
        pushMote({
          kind: "spike",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 0,
          drag: 5.2,
          size: (4.5 + rand() * 2.5) * u,
          rot: a,
          vRot: 0,
          life: 320 + rand() * 110,
          col: cols[i % cols.length],
        });
      }
    } else if (status === "question") {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 1.4;
        const spd = (45 + rand() * 70) * u;
        pushMote({
          kind: "bubble",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 20 * u,
          grav: -35 * u,
          drag: 2.5,
          size: (2.4 + rand() * 2.1) * u,
          sway: rand() * Math.PI * 2,
          life: 480 + rand() * 200,
          col: cols[i % cols.length],
        });
      }
    } else if (status === "alert") {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + rand() * 0.2;
        const spd = (80 + rand() * 130) * u;
        pushMote({
          kind: i % 2 === 0 ? "spike" : "spark",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 40 * u,
          drag: 4.0,
          size: (3.2 + rand() * 2.2) * u,
          rot: a,
          vRot: 0,
          life: 380 + rand() * 150,
          col: cols[i % cols.length],
        });
      }
    } else if (status === "starred") {
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + rand() * 0.3;
        const spd = (65 + rand() * 115) * u;
        pushMote({
          kind: "star",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 25 * u,
          grav: 110 * u,
          drag: 2.4,
          size: (3.0 + rand() * 2.6) * u,
          rot: rand() * Math.PI,
          vRot: (rand() - 0.5) * 8,
          life: 480 + rand() * 220,
          col: cols[i % cols.length],
        });
      }
    } else if (status === "canceled") {
      for (let i = 0; i < 8; i++) {
        const side = i % 2 === 0 ? -Math.PI * 0.25 : Math.PI * 0.75;
        const a = side + (rand() - 0.5) * 0.45;
        const spd = (55 + rand() * 75) * u;
        pushMote({
          kind: "slash",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 0,
          drag: 4.8,
          size: (4.2 + rand() * 2) * u,
          rot: -Math.PI * 0.25,
          vRot: 0,
          life: 310 + rand() * 110,
          col: cols[i % cols.length],
        });
      }
    } else if (status === "kawaii") {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 2.2;
        const spd = (60 + rand() * 90) * u;
        pushMote({
          kind: i % 2 === 0 ? "heart" : "star",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 15 * u,
          grav: 40 * u,
          drag: 2.6,
          size: (i % 2 === 0 ? 3.4 + rand() * 1.6 : 2.6 + rand() * 1.4) * u,
          rot: (rand() - 0.5) * 0.6,
          vRot: (rand() - 0.5) * 3,
          sway: rand() * Math.PI * 2,
          life: 560 + rand() * 220,
          col: cols[i % cols.length],
        });
      }
    } else if (status === "bug") {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rand() * 0.5;
        const spd = (70 + rand() * 70) * u;
        pushMote({
          kind: "beetle",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 0,
          drag: 3.2,
          size: (2.6 + rand() * 1.2) * u,
          rot: a + Math.PI / 2,
          vRot: 0,
          wiggle: rand() * Math.PI * 2,
          life: 460 + rand() * 160,
          col: cols[i % 2],
        });
      }
    } else if (status === "draft") {
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 1.6;
        const spd = (50 + rand() * 80) * u;
        pushMote({
          kind: i < 5 ? "drop" : "spark",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 260 * u,
          drag: 1.8,
          size: (i < 5 ? 2.6 + rand() * 1.2 : 1.6) * u,
          life: 480 + rand() * 160,
          col: cols[i % cols.length],
        });
      }
    } else if (status === "deadline") {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        pushMote({
          kind: "spike",
          vx: Math.cos(a) * 55 * u,
          vy: Math.sin(a) * 55 * u,
          grav: 0,
          drag: 6,
          size: (i % 3 === 0 ? 4.6 : 3.0) * u,
          rot: a,
          vRot: 0,
          life: 380 + (i % 3 === 0 ? 120 : 0),
          col: cols[i % 3 === 0 ? 0 : 2],
        });
      }
      for (let i = 0; i < 6; i++) {
        pushMote({
          kind: "spark",
          vx: (rand() - 0.5) * 40 * u,
          vy: (10 + rand() * 30) * u,
          grav: 220 * u,
          drag: 1.5,
          size: (1.1 + rand() * 0.8) * u,
          life: 520 + rand() * 160,
          col: cols[1],
        });
      }
    } else if (status === "flower") {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rand() * 0.4;
        const spd = (45 + rand() * 70) * u;
        pushMote({
          kind: i < 7 ? "petal" : "spark",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 10 * u,
          grav: 70 * u,
          drag: 2.4,
          size: (i < 7 ? 3.4 + rand() * 1.4 : 1.8) * u,
          rot: rand() * Math.PI,
          vRot: (rand() - 0.5) * 6,
          sway: rand() * Math.PI * 2,
          life: 620 + rand() * 240,
          col: i < 7 ? cols[i % 2] : cols[2],
        });
      }
    } else if (status === "sun") {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + rand() * 0.1;
        const spd = (110 + rand() * 60) * u;
        pushMote({
          kind: i % 2 === 0 ? "spike" : "spark",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 0,
          drag: 5.4,
          size: (i % 2 === 0 ? 5.2 : 2.0) * u,
          rot: a,
          vRot: 0,
          life: 380 + rand() * 120,
          col: cols[i % cols.length],
        });
      }
    } else if (status === "moon") {
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 2.6;
        const spd = (30 + rand() * 55) * u;
        pushMote({
          kind: i % 3 === 0 ? "star" : "spark",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 12 * u,
          grav: -18 * u,
          drag: 2.2,
          size: (i % 3 === 0 ? 3.0 + rand() * 1.4 : 1.2 + rand() * 0.8) * u,
          rot: rand() * Math.PI,
          vRot: (rand() - 0.5) * 2,
          twinkle: rand() * Math.PI * 2,
          life: 700 + rand() * 260,
          col: cols[i % cols.length],
        });
      }
    } else {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rand() * 0.25;
        const spd = (65 + rand() * 85) * u;
        pushMote({
          kind: i % 3 === 0 ? "star" : "spark",
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          grav: 70 * u,
          drag: 3.8,
          size: (i % 3 === 0 ? 3.0 : 2.0 + rand() * 0.9) * u,
          rot: rand() * Math.PI,
          vRot: (rand() - 0.5) * 5,
          life: 360 + rand() * 150,
          col: cols[i % cols.length],
        });
      }
    }

    kick();
    return true;
  }

  function emitForCheckbox(checkbox, { shape = null, color = null } = {}) {
    if (
      disposed ||
      !checkbox ||
      !isEnabled() ||
      !isBurstStyleActive(getStyle()) ||
      isBurstBlockedByMedia(windowLike)
    ) {
      return false;
    }
    const input = checkbox.querySelector?.('input[type="checkbox"]');
    if (input?.checked === true) return false;
    const rect = readCheckboxRect(checkbox);
    if (!rect) return false;
    const resolvedShape = shape || checkbox.getAttribute?.("data-ts-checkbox-shape") || "custom";
    return emitAt(resolvedShape, rect.left + rect.width / 2, rect.top + rect.height / 2, {
      size: Math.max(rect.width, rect.height),
      color,
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clear();
    if (resizeBound && typeof windowLike?.removeEventListener === "function") {
      windowLike.removeEventListener("resize", handleResize);
      resizeBound = false;
    }
    canvas?.remove?.();
    canvas = null;
    ctx = null;
  }

  lifecycle?.add?.(dispose);

  return {
    get canvas() {
      return canvas;
    },
    get activeCount() {
      return rings.length + motes.length;
    },
    get hasFrameScheduled() {
      return Boolean(rafId);
    },
    emitForCheckbox,
    emitAt,
    resize,
    clear,
    dispose,
  };
}
