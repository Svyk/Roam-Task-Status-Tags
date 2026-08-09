/* Roam Task Status Tags v0.6.2 | generated; edit src/ */

// src/better-tasks-bridge.js
function callable(value, name) {
  return value && typeof value[name] === "function";
}
function resolveBetterTasksProvider(windowLike) {
  const namespace = windowLike?.betterTasks;
  const v2 = namespace?.v2;
  if (callable(v2, "classifyBlock") && callable(v2, "requestStatusTag")) {
    return { kind: "v2", capability: v2 };
  }
  const v1 = namespace?.v1;
  if (callable(v1, "classifyBlock")) {
    return { kind: "v1", capability: v1 };
  }
  const legacy = windowLike?.RoamExtensionTools?.["better-tasks"];
  if (namespace != null || legacy != null) return { kind: "legacy", capability: null };
  return { kind: "absent", capability: null };
}
function routed(status, fields = {}) {
  return { status, didWrite: status === "updated", ...fields };
}
function createBetterTasksStatusRouter({ windowLike, directWriter }) {
  if (!directWriter || typeof directWriter.apply !== "function") {
    throw new TypeError("directWriter.apply is required");
  }
  return Object.freeze({
    async apply({
      uid,
      expectedString,
      nextString,
      statusTagTitle,
      expectedLiveEditorString,
      editorString
    }) {
      const editorOptions = expectedLiveEditorString === void 0 && editorString === void 0 ? {} : { expectedLiveEditorString, editorString };
      const provider = resolveBetterTasksProvider(windowLike);
      if (provider.kind === "absent") {
        return directWriter.apply({
          uid,
          expectedString,
          nextString,
          ...editorOptions
        });
      }
      if (provider.kind === "legacy") {
        return routed("rejected", { reason: "better-tasks-capability-unavailable" });
      }
      let classification;
      try {
        classification = await provider.capability.classifyBlock(uid);
        if (classification?.kind === "ordinary") {
          classification = await provider.capability.classifyBlock(uid, {
            includeDescendants: true
          });
        }
      } catch (error) {
        return routed("unknown", { reason: "better-tasks-classification-failed", error });
      }
      if (!classification || classification.kind === "unknown") {
        return routed("unknown", {
          reason: classification?.reason || "better-tasks-classification-unknown",
          classification
        });
      }
      if (classification.kind === "task-owned") {
        return routed("rejected", { reason: "better-tasks-owned-child", classification });
      }
      if (classification.kind === "ordinary") {
        if (classification.containsManagedTasks) {
          return routed("rejected", {
            reason: "contains-better-tasks-descendants",
            classification
          });
        }
        return directWriter.apply({
          uid,
          expectedString,
          nextString,
          ...editorOptions
        });
      }
      if (classification.kind !== "task") {
        return routed("unknown", { reason: "unsupported-classification", classification });
      }
      if (provider.kind !== "v2") {
        return routed("rejected", {
          reason: "better-tasks-v2-required",
          classification
        });
      }
      try {
        return await provider.capability.requestStatusTag(uid, {
          expectedString,
          statusTagTitle,
          source: "task-status-tags",
          ...editorOptions
        });
      } catch (error) {
        return routed("unknown", { reason: "better-tasks-status-request-failed", error });
      }
    }
  });
}

// src/lifecycle.js
function isPromiseLike(value) {
  return value != null && typeof value.then === "function";
}
async function callSafely(disposer) {
  const result2 = disposer();
  if (isPromiseLike(result2)) await result2;
}
function createLifecycle() {
  let disposed = false;
  const disposers = [];
  const add = (disposer) => {
    if (typeof disposer !== "function") throw new TypeError("A disposer must be a function");
    if (disposed) {
      void callSafely(disposer).catch((error) => console.error("[TaskStatus] Late cleanup failed", error));
      return disposer;
    }
    disposers.push(disposer);
    return disposer;
  };
  return {
    get disposed() {
      return disposed;
    },
    add,
    async command(commandApi, config) {
      if (!commandApi?.addCommand || !commandApi?.removeCommand) {
        throw new TypeError("A command API with addCommand/removeCommand is required");
      }
      await commandApi.addCommand(config);
      add(() => commandApi.removeCommand({ label: config.label }));
    },
    event(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      add(() => target.removeEventListener(type, listener, options));
      return listener;
    },
    interval(callback, delay, ...args) {
      const id = globalThis.setInterval(callback, delay, ...args);
      add(() => globalThis.clearInterval(id));
      return id;
    },
    timeout(callback, delay, ...args) {
      const id = globalThis.setTimeout(callback, delay, ...args);
      add(() => globalThis.clearTimeout(id));
      return id;
    },
    observer(observer, target, options) {
      observer.observe(target, options);
      add(() => observer.disconnect());
      return observer;
    },
    node(node, parent = globalThis.document?.body) {
      if (!parent) throw new Error("A parent node is required outside the browser");
      parent.append(node);
      add(() => node.remove());
      return node;
    },
    pullWatch(dataApi, pattern, entity, callback) {
      if (!dataApi?.addPullWatch || !dataApi?.removePullWatch) {
        throw new TypeError("A Roam data API with addPullWatch/removePullWatch is required");
      }
      dataApi.addPullWatch(pattern, entity, callback);
      add(() => dataApi.removePullWatch(pattern, entity, callback));
      return callback;
    },
    async settingsPanel(extensionAPI, config) {
      await extensionAPI.settings.panel.create(config);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      const errors = [];
      for (const disposer of disposers.splice(0).reverse()) {
        try {
          await callSafely(disposer);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "One or more extension cleanups failed");
    }
  };
}

// src/status-write.js
var BLOCK_STRING_PULL_PATTERN = "[:block/uid :block/string]";
function valueAt(value, keyword, fallback = null) {
  if (!value || typeof value !== "object") return fallback;
  const plain = keyword.replace(/^:/, "");
  return value[keyword] ?? value[plain] ?? value[plain.replace(/^block\//, "")] ?? fallback;
}
function createFreshBlockStringReader(roamAlphaAPI) {
  const pull = roamAlphaAPI?.data?.async?.pull;
  if (typeof pull !== "function") {
    throw new TypeError("roamAlphaAPI.data.async.pull is required");
  }
  return async (uid) => {
    const value = await pull.call(
      roamAlphaAPI.data.async,
      BLOCK_STRING_PULL_PATTERN,
      [":block/uid", uid]
    );
    const pulledUid = valueAt(value, ":block/uid", null);
    const string = valueAt(value, ":block/string", null);
    if (pulledUid !== uid || typeof string !== "string") return null;
    return string;
  };
}
function result(status, fields = {}) {
  return { status, didWrite: status === "updated", ...fields };
}
async function certify({ uid, expectedString, nextString, readFresh, writeError = null }) {
  let observed;
  try {
    observed = await readFresh(uid);
  } catch (error) {
    return result("unknown", {
      reason: "post-write-read-failed",
      error: writeError || error
    });
  }
  if (observed === nextString) {
    return result("updated", {
      reason: writeError ? "write-threw-after-commit" : "certified",
      string: observed
    });
  }
  if (observed === expectedString) {
    return result("not-updated", {
      reason: writeError ? "write-failed-before-commit" : "write-not-observed",
      error: writeError || void 0,
      string: observed
    });
  }
  return result("conflict", {
    reason: observed == null ? "block-missing-after-write" : "third-state-after-write",
    error: writeError || void 0,
    string: observed
  });
}
function createCertifiedBlockStringWriter({
  readFresh,
  updateBlock,
  getLiveEditorString = () => null
}) {
  if (typeof readFresh !== "function") throw new TypeError("readFresh must be a function");
  if (typeof updateBlock !== "function") throw new TypeError("updateBlock must be a function");
  if (typeof getLiveEditorString !== "function") {
    throw new TypeError("getLiveEditorString must be a function");
  }
  return Object.freeze({
    async apply({
      uid,
      expectedString,
      nextString,
      expectedLiveEditorString,
      editorString
    }) {
      if (typeof uid !== "string" || !uid.trim()) {
        return result("rejected", { reason: "invalid-uid" });
      }
      if (typeof expectedString !== "string" || typeof nextString !== "string") {
        return result("rejected", { reason: "invalid-string" });
      }
      let before;
      try {
        before = await readFresh(uid);
      } catch (error) {
        return result("unknown", { reason: "pre-write-read-failed", error });
      }
      if (before == null) return result("rejected", { reason: "block-not-found" });
      if (before !== expectedString) {
        return result("conflict", { reason: "stale-expected-string", string: before });
      }
      const hasEditorHandoff = expectedLiveEditorString !== void 0 || editorString !== void 0;
      if (hasEditorHandoff && (typeof expectedLiveEditorString !== "string" || typeof editorString !== "string")) {
        return result("rejected", { reason: "invalid-editor-handoff" });
      }
      if (hasEditorHandoff) {
        const live = getLiveEditorString(uid);
        if (live !== expectedLiveEditorString && live !== editorString) {
          return result("conflict", {
            reason: "active-editor-diverged",
            string: typeof live === "string" ? live : null
          });
        }
      }
      if (nextString === expectedString) {
        return result("unchanged", { reason: "already-current", string: before });
      }
      try {
        await updateBlock(uid, nextString);
      } catch (error) {
        return certify({ uid, expectedString, nextString, readFresh, writeError: error });
      }
      return certify({ uid, expectedString, nextString, readFresh });
    }
  });
}

// src/status-checkbox.js
var CHECKBOX_STATUS_ATTRIBUTE = "data-ts-checkbox-status";
var CHECKBOX_SHAPE_ATTRIBUTE = "data-ts-checkbox-shape";
var CHECKBOX_UID_ATTRIBUTE = "data-ts-checkbox-block-uid";
var ALERT_BEACON_ATTRIBUTE = "data-ts-alert-beacon";
var OWNED_CHECKBOX_SELECTOR = `.rm-checkbox[${CHECKBOX_STATUS_ATTRIBUTE}]`;
var MANAGED_STATUS_PILL_ATTRIBUTE = "data-ts-managed-status-pill";
var HIDDEN_STATUS_PILL_ATTRIBUTE = "data-ts-status-pill-hidden";
var OWNED_STATUS_PILL_SELECTOR = `[${MANAGED_STATUS_PILL_ATTRIBUTE}]`;
var DEFAULT_LIGHT_SURFACE = Object.freeze({ r: 245, g: 248, b: 250 });
var DEFAULT_DARK_SURFACE = Object.freeze({ r: 32, g: 43, b: 51 });
var BLACK = Object.freeze({ r: 0, g: 0, b: 0 });
var WHITE = Object.freeze({ r: 255, g: 255, b: 255 });
var BUILTIN_SHAPES = Object.freeze({
  ACTIVE: "active",
  WAITING: "waiting",
  HOLDING: "holding",
  INCUBATING: "incubating",
  ALERT: "alert",
  CANCELLED: "cancelled"
});
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
function channel(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 255) : 0;
}
function normalizeRgb(value, fallback = BLACK) {
  if (!value || typeof value !== "object") return { ...fallback };
  return {
    r: channel(value.r),
    g: channel(value.g),
    b: channel(value.b)
  };
}
function linearizedChannel(value) {
  const normalized = channel(value) / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}
function relativeLuminance(rgb) {
  const value = normalizeRgb(rgb);
  return 0.2126 * linearizedChannel(value.r) + 0.7152 * linearizedChannel(value.g) + 0.0722 * linearizedChannel(value.b);
}
function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}
function mixRgb(from, to, amount) {
  const start = normalizeRgb(from);
  const end = normalizeRgb(to);
  const ratio = clamp(Number(amount) || 0, 0, 1);
  return {
    r: start.r + (end.r - start.r) * ratio,
    g: start.g + (end.g - start.g) * ratio,
    b: start.b + (end.b - start.b) * ratio
  };
}
function compositeRgb(foreground, background, alpha) {
  const front = normalizeRgb(foreground);
  const back = normalizeRgb(background);
  const opacity = clamp(Number(alpha) || 0, 0, 1);
  return {
    r: front.r * opacity + back.r * (1 - opacity),
    g: front.g * opacity + back.g * (1 - opacity),
    b: front.b * opacity + back.b * (1 - opacity)
  };
}
function nearestPassingMix(base, surface, target, minimumContrast) {
  if (contrastRatio(target, surface) < minimumContrast) return null;
  let low = 0;
  let high = 1;
  for (let index = 0; index < 28; index += 1) {
    const middle = (low + high) / 2;
    const candidate = mixRgb(base, target, middle);
    if (contrastRatio(candidate, surface) >= minimumContrast) high = middle;
    else low = middle;
  }
  return {
    amount: high,
    color: mixRgb(base, target, high)
  };
}
function deriveAccessibleAccent(baseRgb, surfaceRgb, minimumContrast = 3.2) {
  const base = normalizeRgb(baseRgb);
  const surface = normalizeRgb(surfaceRgb, DEFAULT_LIGHT_SURFACE);
  const required = Math.max(1, Number(minimumContrast) || 3.2);
  if (contrastRatio(base, surface) >= required) return base;
  const candidates = [
    nearestPassingMix(base, surface, BLACK, required),
    nearestPassingMix(base, surface, WHITE, required)
  ].filter(Boolean);
  candidates.sort((a, b) => a.amount - b.amount);
  return candidates[0]?.color || (relativeLuminance(surface) > 0.5 ? { ...BLACK } : { ...WHITE });
}
function roundedRgb(rgb) {
  const value = normalizeRgb(rgb);
  return {
    r: Math.round(value.r),
    g: Math.round(value.g),
    b: Math.round(value.b)
  };
}
function rgbCss(rgb) {
  const value = roundedRgb(rgb);
  return `rgb(${value.r}, ${value.g}, ${value.b})`;
}
function rgbaCss(rgb, alpha) {
  const value = roundedRgb(rgb);
  const opacity = clamp(Number(alpha) || 0, 0, 1);
  return `rgba(${value.r}, ${value.g}, ${value.b}, ${opacity})`;
}
function buildStatusCheckboxColors({
  baseRgb,
  lightSurfaceRgb = DEFAULT_LIGHT_SURFACE,
  darkSurfaceRgb = DEFAULT_DARK_SURFACE,
  minimumContrast = 3.2
} = {}) {
  const base = normalizeRgb(baseRgb, { r: 100, g: 116, b: 139 });
  const lightSurface = normalizeRgb(lightSurfaceRgb, DEFAULT_LIGHT_SURFACE);
  const darkSurface = normalizeRgb(darkSurfaceRgb, DEFAULT_DARK_SURFACE);
  const certificationContrast = Math.max(1, Number(minimumContrast) || 3.2) + 0.05;
  const lightAccent = deriveAccessibleAccent(base, lightSurface, certificationContrast);
  const darkAccent = deriveAccessibleAccent(base, darkSurface, certificationContrast);
  return Object.freeze({
    base: roundedRgb(base),
    lightSurface: roundedRgb(lightSurface),
    darkSurface: roundedRgb(darkSurface),
    lightAccent: roundedRgb(lightAccent),
    darkAccent: roundedRgb(darkAccent),
    lightAccentCss: rgbCss(lightAccent),
    darkAccentCss: rgbCss(darkAccent),
    lightWashCss: rgbaCss(base, 0.09),
    darkWashCss: rgbaCss(base, 0.16),
    lightBeaconCss: rgbaCss(lightAccent, 0.52),
    darkBeaconCss: rgbaCss(darkAccent, 0.68)
  });
}
function buildStatusPillColors({
  baseRgb,
  preferredTextRgb,
  lightSurfaceRgb = DEFAULT_LIGHT_SURFACE,
  darkSurfaceRgb = DEFAULT_DARK_SURFACE,
  minimumTextContrast = 4.8,
  lightBackgroundAlpha = 0.1,
  darkBackgroundAlpha = 0.2
} = {}) {
  const base = normalizeRgb(baseRgb, { r: 100, g: 116, b: 139 });
  const preferredText = normalizeRgb(preferredTextRgb, base);
  const lightSurface = normalizeRgb(lightSurfaceRgb, DEFAULT_LIGHT_SURFACE);
  const darkSurface = normalizeRgb(darkSurfaceRgb, DEFAULT_DARK_SURFACE);
  const lightBackground = compositeRgb(base, lightSurface, lightBackgroundAlpha);
  const darkBackground = compositeRgb(base, darkSurface, darkBackgroundAlpha);
  const certificationContrast = Math.max(1, Number(minimumTextContrast) || 4.8) + 0.08;
  const lightText = deriveAccessibleAccent(
    preferredText,
    lightBackground,
    certificationContrast
  );
  const darkText = deriveAccessibleAccent(
    preferredText,
    darkBackground,
    certificationContrast
  );
  const lightBorder = deriveAccessibleAccent(base, lightSurface, 3.25);
  const darkBorder = deriveAccessibleAccent(base, darkSurface, 3.25);
  return Object.freeze({
    base: roundedRgb(base),
    lightSurface: roundedRgb(lightSurface),
    darkSurface: roundedRgb(darkSurface),
    lightBackground: roundedRgb(lightBackground),
    darkBackground: roundedRgb(darkBackground),
    lightText: roundedRgb(lightText),
    darkText: roundedRgb(darkText),
    lightBackgroundCss: rgbaCss(base, lightBackgroundAlpha),
    darkBackgroundCss: rgbaCss(base, darkBackgroundAlpha),
    lightTextCss: rgbCss(lightText),
    darkTextCss: rgbCss(darkText),
    lightBorderCss: rgbaCss(lightBorder, 0.48),
    darkBorderCss: rgbaCss(darkBorder, 0.62)
  });
}
function getStatusCheckboxShape(statusKey) {
  const key = String(statusKey || "").trim().toUpperCase();
  return BUILTIN_SHAPES[key] || "custom";
}
function lookupStatusKey(statusTagToKey, tagTitle) {
  if (!tagTitle) return null;
  if (statusTagToKey instanceof Map) return statusTagToKey.get(tagTitle) || null;
  return statusTagToKey?.[tagTitle] || null;
}
function decideStatusCheckboxAnnotation({
  enabled = true,
  tagTitle,
  statusTagToKey,
  blockString,
  textHelpers
} = {}) {
  if (!enabled || typeof blockString !== "string" || !textHelpers?.parseManagedPrefix) {
    return null;
  }
  const statusKey = lookupStatusKey(statusTagToKey, tagTitle);
  if (!statusKey) return null;
  const parsed = textHelpers.parseManagedPrefix(blockString);
  if (!parsed?.managed || !parsed?.hadStatus || parsed.currentStatus !== statusKey || parsed.taskKind !== "todo" && parsed.taskKind !== "done") {
    return null;
  }
  return Object.freeze({
    statusKey,
    shape: getStatusCheckboxShape(statusKey)
  });
}
function hasClass(element, className) {
  return Boolean(element?.classList?.contains?.(className));
}
function findSiblingTaskCheckbox(statusPill) {
  const parent = statusPill?.parentElement;
  if (!parent) return null;
  const children = Array.from(parent.children || []);
  const candidates = children.filter((child) => hasClass(child, "rm-checkbox"));
  if (candidates.length !== 1) return null;
  const checkbox = candidates[0];
  const input = checkbox.querySelector?.('input[type="checkbox"]');
  const checkmark = checkbox.querySelector?.(".checkmark");
  return input && checkmark ? checkbox : null;
}
function clearStatusCheckboxAnnotation(checkbox) {
  if (!checkbox?.removeAttribute) return;
  checkbox.removeAttribute(CHECKBOX_STATUS_ATTRIBUTE);
  checkbox.removeAttribute(CHECKBOX_SHAPE_ATTRIBUTE);
  checkbox.removeAttribute(CHECKBOX_UID_ATTRIBUTE);
  checkbox.removeAttribute(ALERT_BEACON_ATTRIBUTE);
}
function applyStatusCheckboxAnnotation(checkbox, decision, blockUid = null) {
  if (!checkbox?.setAttribute || !decision?.statusKey) {
    clearStatusCheckboxAnnotation(checkbox);
    return false;
  }
  checkbox.setAttribute(CHECKBOX_STATUS_ATTRIBUTE, decision.statusKey);
  checkbox.setAttribute(
    CHECKBOX_SHAPE_ATTRIBUTE,
    decision.shape || getStatusCheckboxShape(decision.statusKey)
  );
  const certifiedUid = String(blockUid || "").trim();
  if (certifiedUid) checkbox.setAttribute(CHECKBOX_UID_ATTRIBUTE, certifiedUid);
  else checkbox.removeAttribute(CHECKBOX_UID_ATTRIBUTE);
  return true;
}
function syncStatusCheckboxForPill({
  statusPill,
  enabled = true,
  tagTitle,
  statusTagToKey,
  blockString,
  blockUid,
  textHelpers
} = {}) {
  const checkbox = findSiblingTaskCheckbox(statusPill);
  if (!checkbox) return Object.freeze({ annotated: false, reason: "missing-exact-checkbox" });
  clearStatusCheckboxAnnotation(checkbox);
  const decision = decideStatusCheckboxAnnotation({
    enabled,
    tagTitle,
    statusTagToKey,
    blockString,
    textHelpers
  });
  if (!decision) return Object.freeze({ annotated: false, reason: "not-managed" });
  applyStatusCheckboxAnnotation(checkbox, decision, blockUid);
  return Object.freeze({
    annotated: true,
    checkbox,
    statusKey: decision.statusKey,
    shape: decision.shape
  });
}
function clearStatusPillPresentation(statusPill) {
  if (!statusPill?.removeAttribute) return;
  statusPill.removeAttribute(MANAGED_STATUS_PILL_ATTRIBUTE);
  statusPill.removeAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE);
  statusPill.removeAttribute(ALERT_BEACON_ATTRIBUTE);
}
function applyManagedStatusPillPresentation(statusPill, { hidden = false } = {}) {
  if (!statusPill?.setAttribute) {
    clearStatusPillPresentation(statusPill);
    return false;
  }
  statusPill.setAttribute(MANAGED_STATUS_PILL_ATTRIBUTE, "true");
  if (hidden) statusPill.setAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE, "true");
  else statusPill.removeAttribute(HIDDEN_STATUS_PILL_ATTRIBUTE);
  return true;
}
function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function countExactStatusTagOccurrences(blockString, tagTitle) {
  if (typeof blockString !== "string" || !tagTitle) return 0;
  const title = escapeRegex(tagTitle);
  const matcher = new RegExp(
    `#\\[\\[${title}\\]\\]|#${title}(?=$|\\s|[\\.,;:!\\?\\)\\]\\}])`,
    "g"
  );
  return Array.from(blockString.matchAll(matcher)).length;
}
function isExactManagedStatusPill({
  statusPill,
  tagTitle,
  blockString
} = {}) {
  const parent = statusPill?.parentElement;
  if (!parent || statusPill.getAttribute?.("data-tag") !== tagTitle) return false;
  const checkbox = findSiblingTaskCheckbox(statusPill);
  if (!checkbox) return false;
  const children = Array.from(parent.children || []);
  if (children.indexOf(checkbox) >= children.indexOf(statusPill)) return false;
  const renderedMatches = children.filter(
    (child) => child?.classList?.contains?.("rm-page-ref") && child.getAttribute?.("data-tag") === tagTitle
  );
  const textOccurrences = countExactStatusTagOccurrences(blockString, tagTitle);
  return renderedMatches.length > 0 && renderedMatches.length === textOccurrences && renderedMatches[0] === statusPill;
}
function syncStatusPresentationForPill({
  statusPill,
  hideManagedPill = false,
  alertBeaconEnabled = false,
  ...checkboxOptions
} = {}) {
  clearStatusPillPresentation(statusPill);
  if (!findSiblingTaskCheckbox(statusPill)) {
    return Object.freeze({ annotated: false, reason: "missing-exact-checkbox" });
  }
  if (!isExactManagedStatusPill({
    statusPill,
    tagTitle: checkboxOptions.tagTitle,
    blockString: checkboxOptions.blockString
  })) {
    return Object.freeze({
      annotated: false,
      managed: false,
      hidden: false,
      reason: "not-exact-managed-pill"
    });
  }
  const checkboxResult = syncStatusCheckboxForPill({
    statusPill,
    ...checkboxOptions
  });
  if (!checkboxResult.annotated) return checkboxResult;
  applyManagedStatusPillPresentation(statusPill, { hidden: hideManagedPill });
  const input = checkboxResult.checkbox?.querySelector?.('input[type="checkbox"]');
  const shouldBeacon = Boolean(alertBeaconEnabled) && checkboxResult.statusKey === "ALERT" && input?.checked === false;
  if (shouldBeacon) {
    checkboxResult.checkbox.setAttribute(ALERT_BEACON_ATTRIBUTE, "true");
    statusPill.setAttribute(ALERT_BEACON_ATTRIBUTE, "true");
  }
  return Object.freeze({
    ...checkboxResult,
    managed: true,
    hidden: Boolean(hideManagedPill),
    alertBeacon: shouldBeacon
  });
}
function includingRoot(root, selector) {
  const nodes = [];
  if (root?.matches?.(selector)) nodes.push(root);
  if (root?.querySelectorAll) nodes.push(...root.querySelectorAll(selector));
  return nodes;
}
function clearOwnedStatusCheckboxes(root) {
  const checkboxes = includingRoot(root, OWNED_CHECKBOX_SELECTOR);
  checkboxes.forEach(clearStatusCheckboxAnnotation);
  return checkboxes.length;
}
function clearOwnedStatusPillPresentations(root) {
  const statusPills = includingRoot(root, OWNED_STATUS_PILL_SELECTOR);
  statusPills.forEach(clearStatusPillPresentation);
  return statusPills.length;
}

// src/status-peek.js
var STATUS_PEEK_CLASS = "ts-status-peek";
var STATUS_PEEK_HELP_ID = "ts-status-checkbox-help";
function contains(container, target) {
  if (!container || !target) return false;
  if (typeof container.contains === "function") return container.contains(target);
  let current = target;
  while (current) {
    if (current === container) return true;
    current = current.parentElement || current.parentNode || null;
  }
  return false;
}
function attributeTokens(element, name) {
  return String(element?.getAttribute?.(name) || "").split(/\s+/).map((token) => token.trim()).filter(Boolean);
}
function appendAttributeToken(element, name, token) {
  const ownedToken = String(token || "").trim();
  if (!element?.setAttribute || !ownedToken) return false;
  const next = [.../* @__PURE__ */ new Set([...attributeTokens(element, name), ownedToken])];
  element.setAttribute(name, next.join(" "));
  return true;
}
function removeAttributeToken(element, name, token) {
  const ownedToken = String(token || "").trim();
  if (!element?.removeAttribute || !ownedToken) return false;
  const next = attributeTokens(element, name).filter((item) => item !== ownedToken);
  if (next.length) element.setAttribute(name, next.join(" "));
  else element.removeAttribute(name);
  return true;
}
function resolveOwnedStatusCheckbox(target) {
  const checkbox = target?.closest?.(OWNED_CHECKBOX_SELECTOR) || null;
  if (!checkbox) return null;
  if (checkbox.isConnected === false) return null;
  const statusKey = checkbox.getAttribute?.(CHECKBOX_STATUS_ATTRIBUTE);
  const input = checkbox.querySelector?.('input[type="checkbox"]') || null;
  const checkmark = checkbox.querySelector?.(".checkmark") || null;
  if (!statusKey || !input || !checkmark) return null;
  return Object.freeze({ checkbox, input, checkmark, statusKey });
}
function isStatusChooserKey(event) {
  if (!event || event.ctrlKey || event.metaKey) return false;
  if (event.key === "Enter" && !event.altKey && !event.shiftKey) {
    return true;
  }
  return event.key === "ArrowDown" && Boolean(event.altKey) && !event.shiftKey;
}
function stopIntentEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}
function setButtonText(button, label) {
  const text = button?.querySelector?.(".ts-status-peek-label");
  if (text) text.textContent = label;
}
function createStatusPeekController({
  document: documentLike,
  window: windowLike,
  portalRoot,
  resolveContext,
  onOpen,
  onRemove,
  onAnchorInvalid = () => {
  },
  onError = () => {
  },
  showDelay = 210,
  hideDelay = 120
} = {}) {
  if (!documentLike?.createElement || !portalRoot?.appendChild) {
    throw new TypeError("Status peek requires a document and portal root");
  }
  const eventRoot = documentLike;
  const setTimer = windowLike?.setTimeout?.bind(windowLike) || setTimeout;
  const clearTimer = windowLike?.clearTimeout?.bind(windowLike) || clearTimeout;
  const requestFrame = windowLike?.requestAnimationFrame?.bind(windowLike) || ((callback) => setTimer(callback, 0));
  let enabled = false;
  let started = false;
  let activeContext = null;
  let peekButton = null;
  let describedInput = null;
  let showTimer = null;
  let hideTimer = null;
  let helperEl = null;
  let chooserOpen = false;
  let activationRevision = 0;
  function report(error) {
    try {
      onError(error);
    } catch (_) {
    }
  }
  function reportInvalidAnchor() {
    try {
      onAnchorInvalid();
    } catch (error) {
      report(error);
    }
  }
  function clearShowTimer() {
    if (showTimer !== null) clearTimer(showTimer);
    showTimer = null;
  }
  function clearHideTimer() {
    if (hideTimer !== null) clearTimer(hideTimer);
    hideTimer = null;
  }
  function ensureHelper() {
    if (helperEl) return helperEl;
    helperEl = documentLike.createElement("span");
    helperEl.id = STATUS_PEEK_HELP_ID;
    helperEl.className = "ts-status-sr-only";
    helperEl.textContent = "Workflow status. Press Enter or Alt plus Down Arrow to choose a status. Press Space to complete or reopen the task.";
    portalRoot.appendChild(helperEl);
    return helperEl;
  }
  function detachDescription() {
    if (describedInput) {
      removeAttributeToken(describedInput, "aria-describedby", STATUS_PEEK_HELP_ID);
    }
    describedInput = null;
  }
  function attachDescription(input, label) {
    if (!input) return;
    if (describedInput !== input) detachDescription();
    ensureHelper().textContent = `${label} workflow status. Press Enter or Alt plus Down Arrow to choose a status. Press Space to complete or reopen the task.`;
    appendAttributeToken(input, "aria-describedby", STATUS_PEEK_HELP_ID);
    describedInput = input;
  }
  function removePeekButton() {
    if (peekButton?.remove) peekButton.remove();
    peekButton = null;
  }
  function hide() {
    activationRevision += 1;
    clearShowTimer();
    clearHideTimer();
    detachDescription();
    removePeekButton();
    activeContext = null;
    chooserOpen = false;
  }
  function resolveFreshContext(owned) {
    if (!owned || typeof resolveContext !== "function") return null;
    const freshOwned = resolveOwnedStatusCheckbox(owned.checkbox);
    if (!freshOwned) return null;
    const resolved = resolveContext(freshOwned);
    if (!resolved?.blockUid || !resolved?.statusKey) return null;
    return Object.freeze({
      ...resolved,
      ...freshOwned,
      label: String(resolved.label || resolved.statusKey),
      anchorEl: freshOwned.checkbox,
      returnFocusEl: freshOwned.input
    });
  }
  function positionPeek(button, context) {
    if (!button?.style || !context?.checkbox?.getBoundingClientRect) return;
    const anchorRect = context.checkbox.getBoundingClientRect();
    const viewportWidth = windowLike?.innerWidth || documentLike.documentElement?.clientWidth || 0;
    const viewportHeight = windowLike?.innerHeight || documentLike.documentElement?.clientHeight || 0;
    const margin = 8;
    const gap = 7;
    button.style.visibility = "hidden";
    button.style.left = "0px";
    button.style.top = "0px";
    const applyPosition = () => {
      if (!peekButton || peekButton !== button || !button.isConnected) return;
      if (activeContext?.checkbox !== context.checkbox) return;
      if (context.checkbox.isConnected === false) {
        hide();
        reportInvalidAnchor();
        return;
      }
      const rect = button.getBoundingClientRect?.() || { width: 0, height: 0 };
      const width = Number(button.offsetWidth) || Number(rect.width) || 0;
      const height = Number(button.offsetHeight) || Number(rect.height) || 0;
      const centered = anchorRect.left + anchorRect.width / 2 - width / 2;
      const left = Math.max(margin, Math.min(centered, viewportWidth - width - margin));
      const above = anchorRect.top - height - gap;
      const opensBelow = above < margin;
      const below = anchorRect.bottom + gap;
      const top = opensBelow ? Math.min(below, Math.max(margin, viewportHeight - height - margin)) : above;
      button.classList?.toggle?.("ts-status-peek-below", opensBelow);
      button.style.left = `${Math.round(left)}px`;
      button.style.top = `${Math.round(top)}px`;
      button.style.visibility = "visible";
    };
    applyPosition();
    requestFrame(applyPosition);
  }
  async function activate(context, event, remove = false) {
    stopIntentEvent(event);
    if (!remove && chooserOpen) return false;
    const fresh = resolveFreshContext(context);
    if (!fresh) {
      hide();
      return false;
    }
    let intentContext = fresh;
    if (remove) hide();
    else {
      const activationId = ++activationRevision;
      clearShowTimer();
      clearHideTimer();
      detachDescription();
      activeContext = fresh;
      if (!peekButton) {
        peekButton = makePeekButton(fresh);
        portalRoot.appendChild(peekButton);
        positionPeek(peekButton, fresh);
      }
      chooserOpen = true;
      peekButton?.setAttribute("aria-expanded", "true");
      peekButton?.classList?.toggle?.("ts-status-peek-expanded", true);
      intentContext = Object.freeze({
        ...fresh,
        isIntentCurrent: () => chooserOpen && activationRevision === activationId && activeContext?.checkbox === fresh.checkbox && activeContext?.statusKey === fresh.statusKey && activeContext?.blockUid === fresh.blockUid
      });
    }
    try {
      const result2 = remove ? await onRemove?.(intentContext) : await onOpen?.(intentContext);
      if (!remove && result2 === false) hide();
      return true;
    } catch (error) {
      hide();
      report(error);
      return false;
    }
  }
  function makePeekButton(context) {
    const button = documentLike.createElement("button");
    button.type = "button";
    button.className = STATUS_PEEK_CLASS;
    button.setAttribute("data-task-status-peek", "true");
    button.setAttribute("data-task-status-key", context.statusKey);
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute(
      "aria-label",
      `Change task status from ${context.label}. Shift-click to remove.`
    );
    const label = documentLike.createElement("span");
    label.className = "ts-status-peek-label";
    label.textContent = context.label;
    const chevron = documentLike.createElement("span");
    chevron.className = "ts-status-peek-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌄";
    button.append(label, chevron);
    button.addEventListener("mousedown", stopIntentEvent);
    button.addEventListener("click", (event) => {
      if (activeContext) void activate(activeContext, event, Boolean(event.shiftKey));
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        stopIntentEvent(event);
        const focusTarget = activeContext?.returnFocusEl;
        hide();
        focusTarget?.focus?.({ preventScroll: true });
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        if (activeContext) void activate(activeContext, event, Boolean(event.shiftKey));
      }
    });
    return button;
  }
  function show(owned, { describe = false } = {}) {
    clearShowTimer();
    if (!enabled) return false;
    if (chooserOpen) return true;
    const context = resolveFreshContext(owned);
    if (!context) {
      hide();
      return false;
    }
    clearHideTimer();
    activeContext = context;
    if (describe) attachDescription(context.input, context.label);
    else if (describedInput && describedInput !== context.input) detachDescription();
    if (!peekButton) {
      peekButton = makePeekButton(context);
      portalRoot.appendChild(peekButton);
    } else {
      peekButton.setAttribute("data-task-status-key", context.statusKey);
      peekButton.setAttribute(
        "aria-label",
        `Change task status from ${context.label}. Shift-click to remove.`
      );
      setButtonText(peekButton, context.label);
    }
    positionPeek(peekButton, context);
    return true;
  }
  function scheduleShow(owned, describe = false) {
    clearShowTimer();
    clearHideTimer();
    const delay = Math.max(0, Number(showDelay) || 0);
    if (delay === 0) {
      show(owned, { describe });
      return;
    }
    showTimer = setTimer(() => {
      showTimer = null;
      show(owned, { describe });
    }, delay);
  }
  function scheduleHide() {
    if (chooserOpen) return;
    clearShowTimer();
    clearHideTimer();
    const delay = Math.max(0, Number(hideDelay) || 0);
    if (delay === 0) {
      hide();
      return;
    }
    hideTimer = setTimer(() => {
      hideTimer = null;
      hide();
    }, delay);
  }
  function relatedStaysInside(event, owned) {
    const related = event?.relatedTarget;
    return contains(owned?.checkbox, related) || contains(peekButton, related);
  }
  function handlePointerOver(event) {
    if (!enabled) return;
    if (event.pointerType === "touch") return;
    if (contains(peekButton, event.target)) {
      clearHideTimer();
      return;
    }
    const owned = resolveOwnedStatusCheckbox(event.target);
    if (!owned) return;
    if (contains(owned.checkbox, event.relatedTarget)) return;
    scheduleShow(owned, false);
  }
  function handlePointerOut(event) {
    if (!enabled) return;
    if (event.pointerType === "touch") return;
    if (contains(peekButton, event.target)) {
      if (contains(peekButton, event.relatedTarget)) return;
      if (contains(activeContext?.checkbox, event.relatedTarget)) return;
      scheduleHide();
      return;
    }
    const owned = resolveOwnedStatusCheckbox(event.target);
    if (!owned || relatedStaysInside(event, owned)) return;
    scheduleHide();
  }
  function handleFocusIn(event) {
    if (!enabled) return;
    if (contains(peekButton, event.target)) {
      clearHideTimer();
      return;
    }
    const owned = resolveOwnedStatusCheckbox(event.target);
    if (owned) show(owned, { describe: true });
  }
  function handleFocusOut(event) {
    if (!enabled) return;
    if (contains(peekButton, event.target)) {
      if (contains(peekButton, event.relatedTarget)) return;
      if (contains(activeContext?.checkbox, event.relatedTarget)) return;
      scheduleHide();
      return;
    }
    const owned = resolveOwnedStatusCheckbox(event.target);
    if (!owned || relatedStaysInside(event, owned)) return;
    scheduleHide();
  }
  function handleKeyDown(event) {
    if (!enabled) return;
    const owned = resolveOwnedStatusCheckbox(event.target);
    if (event.key === "Escape" && owned && activeContext) {
      stopIntentEvent(event);
      hide();
      return;
    }
    if (!owned || !isStatusChooserKey(event)) return;
    void activate(owned, event, false);
  }
  function handleOutsideMouseDown(event) {
    if (!enabled || !activeContext || chooserOpen) return;
    if (contains(activeContext.checkbox, event.target) || contains(peekButton, event.target)) {
      return;
    }
    hide();
  }
  function handleViewportChange() {
    if (activeContext) hide();
  }
  const delegatedListeners = [
    ["pointerover", handlePointerOver],
    ["pointerout", handlePointerOut],
    ["focusin", handleFocusIn],
    ["focusout", handleFocusOut],
    ["keydown", handleKeyDown],
    ["mousedown", handleOutsideMouseDown]
  ];
  const viewportListeners = [
    ["resize", handleViewportChange],
    ["scroll", handleViewportChange]
  ];
  function start() {
    if (started) return;
    started = true;
    ensureHelper();
    delegatedListeners.forEach(([type, handler]) => {
      eventRoot.addEventListener(type, handler, true);
    });
    viewportListeners.forEach(([type, handler]) => {
      windowLike?.addEventListener?.(type, handler, true);
    });
  }
  function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
    if (!enabled) hide();
  }
  function refresh() {
    if (!activeContext) return;
    if (!enabled) {
      hide();
      return;
    }
    if (chooserOpen) {
      const fresh = resolveFreshContext(activeContext);
      if (!fresh || fresh.statusKey !== activeContext.statusKey || fresh.blockUid !== activeContext.blockUid) {
        hide();
        reportInvalidAnchor();
        return false;
      }
      activeContext = fresh;
      return true;
    }
    const describe = describedInput === activeContext.input;
    return show(activeContext, { describe });
  }
  function chooserClosed() {
    if (!chooserOpen) return;
    hide();
  }
  function destroy() {
    if (started) {
      delegatedListeners.forEach(([type, handler]) => {
        eventRoot.removeEventListener(type, handler, true);
      });
      viewportListeners.forEach(([type, handler]) => {
        windowLike?.removeEventListener?.(type, handler, true);
      });
    }
    started = false;
    enabled = false;
    hide();
    if (helperEl?.remove) helperEl.remove();
    helperEl = null;
  }
  return Object.freeze({
    start,
    destroy,
    hide,
    refresh,
    chooserClosed,
    setEnabled,
    isEnabled: () => enabled,
    isVisible: () => Boolean(peekButton?.isConnected)
  });
}

// src/extension.js
var GLOBAL_KEY = "__svyk_roamTaskStatusTags";
var BUNDLED_VERSION = true ? "0.6.2" : "development";
function resolveTaskStatusRuntimeVersion(extensionVersion) {
  const reported = typeof extensionVersion === "string" ? extensionVersion.trim() : "";
  return reported && reported.toUpperCase() !== "DEV" ? reported : BUNDLED_VERSION;
}
var TEXT_HELPER_DEFAULTS = {
  cycleOrder: ["ACTIVE", "WAITING", "HOLDING", "INCUBATING", "ALERT", "CANCELLED"],
  todoPatterns: ["{{[[TODO]]}}", "{{TODO}}"],
  donePatterns: ["{{[[DONE]]}}", "{{DONE}}"],
  todoCanonical: "{{[[TODO]]}}",
  statusTagPrefix: "task-status/",
  statusNames: {
    ACTIVE: "Active",
    WAITING: "Waiting",
    HOLDING: "Holding",
    INCUBATING: "Incubating",
    ALERT: "Alert",
    CANCELLED: "Cancelled"
  }
};
function buildDefaultTextStatuses() {
  const statuses = {};
  TEXT_HELPER_DEFAULTS.cycleOrder.forEach((key) => {
    const name = TEXT_HELPER_DEFAULTS.statusNames[key] || key;
    const tagTitle = `${TEXT_HELPER_DEFAULTS.statusTagPrefix}${name}`;
    statuses[key] = {
      name,
      label: name,
      tagTitle,
      tagTitles: [tagTitle]
    };
  });
  return statuses;
}
function createTaskStatusTextHelpers(options = {}) {
  const cycleOrder = options.cycleOrder || TEXT_HELPER_DEFAULTS.cycleOrder;
  const statusKeys = uniqueTextHelperStrings([
    ...cycleOrder,
    ...Object.keys(options.statuses || {}),
    ...options.statusKeys || []
  ]);
  const todoPatterns = options.todoPatterns || TEXT_HELPER_DEFAULTS.todoPatterns;
  const donePatterns = options.donePatterns || TEXT_HELPER_DEFAULTS.donePatterns;
  const todoCanonical = options.todoCanonical || TEXT_HELPER_DEFAULTS.todoCanonical;
  const statuses = options.statuses || buildDefaultTextStatuses();
  function uniqueTextHelperStrings(list) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    (list || []).forEach((v) => {
      const s = String(v || "").trim();
      if (!s) return;
      if (seen.has(s)) return;
      seen.add(s);
      out.push(s);
    });
    return out;
  }
  function escapeRegex2(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function containsAny(text, patterns) {
    if (!text || typeof text !== "string") return false;
    return patterns.some((p) => text.includes(p));
  }
  function isBoundaryChar(ch) {
    return !ch || /\s|[\.,;:!\?\)\]\}]/.test(ch);
  }
  function getStatusTagTitles(statusKey) {
    const status = statuses?.[statusKey];
    if (!status) return [];
    if (Array.isArray(status.tagTitles)) return status.tagTitles;
    return status.tagTitle ? [status.tagTitle] : [];
  }
  function hasPlainHashtagToken(text, tagTitle) {
    if (!text || typeof text !== "string") return false;
    const t = escapeRegex2(tagTitle);
    const re = new RegExp(`(^|\\s)#${t}(?=\\s|$|[\\.,;:!\\?\\)\\]\\}])`, "g");
    return re.test(text);
  }
  function matchAnyPatternAt(text, index, patterns) {
    for (const token of patterns || []) {
      if (text.startsWith(token, index)) {
        return { token, start: index, end: index + token.length };
      }
    }
    return null;
  }
  function skipHorizontalWhitespace(text, index) {
    let i = index;
    while (text[i] === " " || text[i] === "	") i += 1;
    return i;
  }
  function stripPrefixSeparator(text) {
    return String(text || "").replace(/^[ \t]+/, "");
  }
  function matchStatusTagAt(text, index) {
    for (const statusKey of statusKeys) {
      for (const tagTitle of getStatusTagTitles(statusKey)) {
        const bracket = `#[[${tagTitle}]]`;
        if (text.startsWith(bracket, index)) {
          return {
            token: bracket,
            statusKey,
            start: index,
            end: index + bracket.length,
            kind: "tag"
          };
        }
        const plain = `#${tagTitle}`;
        if (text.startsWith(plain, index) && isBoundaryChar(text[index + plain.length])) {
          return {
            token: plain,
            statusKey,
            start: index,
            end: index + plain.length,
            kind: "tag"
          };
        }
      }
    }
    return null;
  }
  function matchManagedStatusAt(text, index) {
    return matchStatusTagAt(text, index);
  }
  function parseManagedPrefix(text) {
    const original = String(text || "");
    const leadingMatch = original.match(/^[ \t]*/);
    const leading = leadingMatch ? leadingMatch[0] : "";
    let index = leading.length;
    const todo = matchAnyPatternAt(original, index, todoPatterns);
    const done = matchAnyPatternAt(original, index, donePatterns);
    const task = todo ? { ...todo, kind: "todo" } : done ? { ...done, kind: "done" } : null;
    if (!task) {
      return {
        managed: false,
        original,
        leading: "",
        body: original,
        taskKind: null,
        taskToken: null,
        currentStatus: null,
        hadStatus: false,
        hadTaskToken: false
      };
    }
    const afterTask = task.end;
    const statusStart = skipHorizontalWhitespace(original, afterTask);
    const status = matchManagedStatusAt(original, statusStart);
    const bodyStart = status ? status.end : afterTask;
    return {
      managed: true,
      original,
      leading,
      body: stripPrefixSeparator(original.slice(bodyStart)),
      taskKind: task.kind,
      taskToken: task.token,
      currentStatus: status?.statusKey || null,
      hadStatus: Boolean(status),
      hadTaskToken: true
    };
  }
  function joinManagedPrefix({ leading = "", taskToken, statusTag, body }) {
    const prefix = [taskToken, statusTag].filter(Boolean).join(" ");
    const bodyText = String(body || "");
    if (!bodyText) return `${leading}${prefix}`;
    if (/^[\r\n]/.test(bodyText)) return `${leading}${prefix}${bodyText}`;
    return `${leading}${prefix} ${bodyText}`;
  }
  function hasStatusTagAnywhere(text, statusKey) {
    const s = String(text || "");
    for (const tagTitle of getStatusTagTitles(statusKey)) {
      if (s.includes(`#[[${tagTitle}]]`) || hasPlainHashtagToken(s, tagTitle)) {
        return true;
      }
    }
    return parseManagedPrefix(s).currentStatus === statusKey;
  }
  function hasManagedStatusTag(text, statusKey) {
    const parsed = parseManagedPrefix(text);
    return parsed.hadStatus && parsed.currentStatus === statusKey;
  }
  function hasAnyManagedStatusTag(text) {
    return parseManagedPrefix(text).hadStatus;
  }
  function getCurrentStatus(text) {
    return parseManagedPrefix(text).currentStatus;
  }
  function getNextStatus(currentStatus) {
    if (!currentStatus) return cycleOrder[0] || null;
    const idx = cycleOrder.indexOf(currentStatus);
    if (idx === -1) return cycleOrder[0] || null;
    const next = idx + 1;
    return next >= cycleOrder.length ? null : cycleOrder[next];
  }
  function isDoneTask(text) {
    return containsAny(text, donePatterns);
  }
  function isTaskLike(text) {
    const s = String(text || "");
    const parsed = parseManagedPrefix(s);
    return parsed.managed || containsAny(s, todoPatterns) || containsAny(s, donePatterns);
  }
  function applyStatusToText(text, statusKey) {
    const original = String(text || "");
    const parsed = parseManagedPrefix(original);
    const status = statuses?.[statusKey];
    const statusTag = status ? `#[[${status.tagTitle}]]` : "";
    const body = parsed.managed ? parsed.body : original;
    const leading = parsed.managed ? parsed.leading : "";
    return joinManagedPrefix({
      leading,
      taskToken: parsed.managed && parsed.taskToken ? parsed.taskToken : todoCanonical,
      statusTag,
      body
    });
  }
  function applyStatusToTexts(texts, statusKey) {
    return (Array.isArray(texts) ? texts : []).map(
      (text) => applyStatusToText(text, statusKey)
    );
  }
  function removeStatusFromText(text) {
    const original = String(text || "");
    const parsed = parseManagedPrefix(original);
    if (!parsed.managed || !parsed.hadStatus) return original;
    const taskToken = parsed.taskKind === "done" && parsed.taskToken ? parsed.taskToken : todoCanonical;
    return joinManagedPrefix({
      leading: parsed.leading,
      taskToken,
      statusTag: "",
      body: parsed.body
    });
  }
  function removeSlashCommandFragment(blockString, indexes) {
    let text = String(blockString || "");
    if (!Array.isArray(indexes) || indexes.length !== 2) return text;
    const [start, end] = indexes;
    if (typeof start !== "number" || typeof end !== "number" || start < 0 || end < start || end > text.length) {
      return text;
    }
    let removeStart = start;
    if (removeStart > 0 && text[removeStart - 1] === "/") {
      removeStart -= 1;
    }
    return text.slice(0, removeStart) + text.slice(end);
  }
  return {
    applyStatusToText,
    applyStatusToTexts,
    getCurrentStatus,
    getNextStatus,
    hasAnyManagedStatusTag,
    hasManagedStatusTag,
    hasStatusTagAnywhere,
    isDoneTask,
    isTaskLike,
    parseManagedPrefix,
    removeSlashCommandFragment,
    removeStatusFromText
  };
}
function uniqueUidStrings(list) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  (list || []).forEach((v) => {
    const s = String(v || "").trim();
    if (!s) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}
function normalizeTargetUid(entry) {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return null;
  return entry["block-uid"] || entry.uid || entry["uid"] || null;
}
async function resolveTaskStatusTargetUids({
  roamAlphaAPI,
  context = null,
  primaryUid = null,
  fallbackToFocused = true
} = {}) {
  const contextBlocks = Array.isArray(context?.blocks) ? context.blocks : [];
  const contextBlockUids = uniqueUidStrings(contextBlocks.map(normalizeTargetUid));
  if (contextBlockUids.length) return contextBlockUids;
  const ui = roamAlphaAPI?.ui;
  try {
    const individual = await ui?.individualMultiselect?.getSelectedUids?.();
    const individualUids = uniqueUidStrings(
      (Array.isArray(individual) ? individual : []).map(normalizeTargetUid)
    );
    if (individualUids.length) return individualUids;
  } catch (_) {
  }
  try {
    const dragSelected = await ui?.multiselect?.getSelected?.();
    const dragUids = uniqueUidStrings(
      (Array.isArray(dragSelected) ? dragSelected : []).map(normalizeTargetUid)
    );
    if (dragUids.length) return dragUids;
  } catch (_) {
  }
  const explicitUid = primaryUid || context?.["block-uid"] || context?.uid || null;
  if (explicitUid) return uniqueUidStrings([explicitUid]);
  if (!fallbackToFocused) return [];
  try {
    const focused = await ui?.getFocusedBlock?.();
    return uniqueUidStrings([normalizeTargetUid(focused)]);
  } catch (_) {
    return [];
  }
}
function createTaskStatusExtension({ extensionAPI }) {
  const TOUCH_LISTENER_OPTIONS = { capture: true, passive: false };
  const STATUS_PILL_SELECTOR = [
    'span.rm-page-ref[data-tag^="task-status/"]',
    'a.rm-page-ref[data-tag^="task-status/"]',
    "span.rm-page-ref[data-task-status-key]",
    "a.rm-page-ref[data-task-status-key]"
  ].join(", ");
  const RENDER_SCOPE_SELECTOR = ".rm-block__input, .rm-block-ref";
  const EXTENSION_UI_SELECTOR = ".ts-status-portal, .ts-status-names-panel";
  const STATUS_MUTATION_SELECTOR = `${STATUS_PILL_SELECTOR}, .rm-checkbox`;
  const CONFIG = {
    // Active status order. This is replaced by persisted settings during startup.
    cycleOrder: ["ACTIVE", "WAITING", "HOLDING", "INCUBATING", "ALERT", "CANCELLED"],
    shiftClickRemoves: true,
    debug: false
  };
  const TODO_PATTERNS = ["{{[[TODO]]}}", "{{TODO}}"];
  const DONE_PATTERNS = ["{{[[DONE]]}}", "{{DONE}}"];
  const TODO_CANONICAL = "{{[[TODO]]}}";
  const STATUS_TAG_PREFIX = "task-status/";
  const SETTINGS_KEYS = {
    statusList: "status-list",
    statusColorOverrides: "status-color-overrides",
    styleNativeCheckboxes: "task-status-style-native-checkboxes",
    statusLabelDisplay: "task-status-label-display",
    alertBeacon: "task-status-alert-beacon"
  };
  const STATUS_LABEL_DISPLAY = Object.freeze({
    CHECKBOX_ONLY: "Checkbox only — reveal on intent",
    CHECKBOX_AND_PILL: "Checkbox + status pill"
  });
  const DEFAULT_STATUS_NAMES = {
    ACTIVE: "Active",
    WAITING: "Waiting",
    HOLDING: "Holding",
    INCUBATING: "Incubating",
    ALERT: "Alert",
    CANCELLED: "Cancelled"
  };
  const DEFAULT_STATUS_LIST = [
    { key: "ACTIVE", name: "Active" },
    { key: "WAITING", name: "Waiting" },
    { key: "HOLDING", name: "Holding" },
    { key: "INCUBATING", name: "Incubating" },
    { key: "ALERT", name: "Alert" },
    { key: "CANCELLED", name: "Cancelled" }
  ];
  const DEFAULT_STATUS_BASE_COLORS = {
    ACTIVE: "#14b8a6",
    WAITING: "#eab308",
    HOLDING: "#94a3b8",
    INCUBATING: "#6366f1",
    ALERT: "#f43f5e",
    CANCELLED: "#1e293b"
  };
  const DEFAULT_CUSTOM_STATUS_BASE_COLOR = "#64748b";
  const STATUS_COLOR_PRESETS = [
    { name: "Teal", value: "#14b8a6" },
    { name: "Rose", value: "#f43f5e" },
    { name: "Amber", value: "#eab308" },
    { name: "Blue", value: "#3b82f6" },
    { name: "Indigo", value: "#6366f1" },
    { name: "Violet", value: "#8b5cf6" },
    { name: "Slate", value: "#64748b" },
    { name: "Dark", value: "#1e293b" }
  ];
  let statusColorOverrides = loadObjectSetting(SETTINGS_KEYS.statusColorOverrides, {});
  let checkboxStylingEnabled = loadBooleanSetting(
    SETTINGS_KEYS.styleNativeCheckboxes,
    true
  );
  let alertBeaconEnabled = loadBooleanSetting(SETTINGS_KEYS.alertBeacon, true);
  let statusLabelDisplay = loadStatusLabelDisplaySetting();
  let colorProbeEl = null;
  let statusColorStyleEl = null;
  let portalRoot = null;
  function ensureColorProbeElement() {
    if (colorProbeEl && colorProbeEl.isConnected) return colorProbeEl;
    try {
      const el = document.createElement("span");
      el.id = "ts-color-probe";
      el.style.position = "fixed";
      el.style.left = "-10000px";
      el.style.top = "-10000px";
      el.style.width = "0";
      el.style.height = "0";
      el.style.padding = "0";
      el.style.margin = "0";
      el.style.border = "0";
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      (portalRoot || document.body).appendChild(el);
      colorProbeEl = el;
      return el;
    } catch (_) {
      return null;
    }
  }
  function normalizeCssColorValue(value) {
    const v = String(value || "").trim();
    return v;
  }
  function cssColorIsSupported(value) {
    const v = normalizeCssColorValue(value);
    if (!v) return false;
    try {
      if (window.CSS?.supports) return window.CSS.supports("color", v);
    } catch (_) {
    }
    const probe = ensureColorProbeElement();
    if (!probe) return false;
    try {
      probe.style.color = "";
      probe.style.color = v;
      return Boolean(probe.style.color);
    } catch (_) {
      return false;
    }
  }
  function parseCssColorToRgb(value) {
    const v = normalizeCssColorValue(value);
    if (!v) return null;
    const probe = ensureColorProbeElement();
    if (!probe) return null;
    try {
      probe.style.color = "";
      probe.style.color = v;
      if (!probe.style.color) return null;
      const computed = window.getComputedStyle(probe).color;
      const match = computed.match(
        /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/
      );
      if (!match) return null;
      const r = Number(match[1]);
      const g = Number(match[2]);
      const b = Number(match[3]);
      const a = typeof match[4] === "string" ? Number(match[4]) : 1;
      if (![r, g, b, a].every((n) => Number.isFinite(n))) return null;
      return { r, g, b, a };
    } catch (_) {
      return null;
    }
  }
  function readComputedCssColor(element, propertyName) {
    if (!element || !window.getComputedStyle) return null;
    try {
      const styles = window.getComputedStyle(element);
      const raw = propertyName.startsWith("--") ? styles?.getPropertyValue?.(propertyName) : styles?.[propertyName];
      const parsed = parseCssColorToRgb(raw);
      return parsed && parsed.a !== 0 ? parsed : null;
    } catch (_) {
      return null;
    }
  }
  function resolveStatusSurfaces() {
    const lightFallback = { r: 245, g: 248, b: 250 };
    const darkFallback = { r: 32, g: 43, b: 51 };
    let lightSurface = lightFallback;
    let darkSurface = darkFallback;
    const candidates = [];
    const nativeCheckmark = document.querySelector?.(
      ".rm-checkbox.rm-todo:not([data-ts-checkbox-status]) .checkmark"
    );
    const nativeSurface = readComputedCssColor(nativeCheckmark, "backgroundColor");
    if (nativeSurface) candidates.push(nativeSurface);
    const roots = [document.documentElement, document.body].filter(Boolean);
    const tokenNames = ["--svy-surface", "--bp3-surface", "--svy-canvas"];
    tokenNames.forEach((token) => {
      roots.forEach((root) => {
        const color = readComputedCssColor(root, token);
        if (color) candidates.push(color);
      });
    });
    const bodySurface = readComputedCssColor(document.body, "backgroundColor");
    if (bodySurface) candidates.push(bodySurface);
    lightSurface = candidates.find((candidate) => relativeLuminance(candidate) >= 0.45) || lightSurface;
    darkSurface = candidates.find((candidate) => relativeLuminance(candidate) < 0.45) || darkSurface;
    return { lightSurface, darkSurface };
  }
  function cssString(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }
  function cssStatusKeySelector(statusKey) {
    return cssString(statusKey);
  }
  function getRenderableStatusKeys() {
    return uniqueStrings(Object.keys(STATUSES || {}));
  }
  function getDefaultStatusColor(statusKey) {
    return DEFAULT_STATUS_BASE_COLORS[statusKey] || DEFAULT_CUSTOM_STATUS_BASE_COLOR;
  }
  function deriveStatusPillColorValues(statusKey, entry, surfaces) {
    const base = normalizeCssColorValue(entry?.base) || getDefaultStatusColor(statusKey);
    const text = normalizeCssColorValue(entry?.text);
    const defaultBase = getDefaultStatusColor(statusKey);
    const parsedBase = parseCssColorToRgb(base) || parseCssColorToRgb(defaultBase);
    const parsedText = parseCssColorToRgb(text) || parsedBase;
    return buildStatusPillColors({
      baseRgb: parsedBase || { r: 100, g: 116, b: 139 },
      preferredTextRgb: parsedText || parsedBase,
      lightSurfaceRgb: surfaces?.lightSurface,
      darkSurfaceRgb: surfaces?.darkSurface,
      minimumTextContrast: 4.8
    });
  }
  function deriveStatusCheckboxColorValues(statusKey, entry, surfaces) {
    const base = normalizeCssColorValue(entry?.base) || getDefaultStatusColor(statusKey);
    const parsedBase = parseCssColorToRgb(base) || parseCssColorToRgb(
      getDefaultStatusColor(statusKey)
    );
    return buildStatusCheckboxColors({
      baseRgb: parsedBase || { r: 100, g: 116, b: 139 },
      lightSurfaceRgb: surfaces?.lightSurface,
      darkSurfaceRgb: surfaces?.darkSurface,
      minimumContrast: 3.2
    });
  }
  function ensureStatusColorStyleElement() {
    if (statusColorStyleEl && statusColorStyleEl.isConnected) return statusColorStyleEl;
    try {
      const el = document.createElement("style");
      el.id = "ts-dynamic-status-colors";
      (portalRoot || document.body).appendChild(el);
      statusColorStyleEl = el;
      return el;
    } catch (_) {
      return null;
    }
  }
  function clearStatusColorOverrides() {
    if (colorProbeEl?.remove) {
      try {
        colorProbeEl.remove();
      } catch (_) {
      }
    }
    colorProbeEl = null;
    if (statusColorStyleEl?.remove) {
      try {
        statusColorStyleEl.remove();
      } catch (_) {
      }
    }
    statusColorStyleEl = null;
  }
  function applyStatusColorOverrides(overrides) {
    clearStatusColorOverrides();
    const dynamicRules = [];
    const statusSurfaces = resolveStatusSurfaces();
    getRenderableStatusKeys().forEach((statusKey) => {
      const entry = overrides?.[statusKey];
      const pillValues = deriveStatusPillColorValues(statusKey, entry, statusSurfaces);
      const checkboxValues = deriveStatusCheckboxColorValues(
        statusKey,
        entry,
        statusSurfaces
      );
      const keySelector = cssStatusKeySelector(statusKey);
      dynamicRules.push(`
span.rm-page-ref[data-task-status-key="${keySelector}"],
a.rm-page-ref[data-task-status-key="${keySelector}"],
.bt-pill[data-task-status-title="task-status/${cssString(STATUSES[statusKey]?.name || "")}"],
.ts-status-pill-preview[data-task-status-key="${keySelector}"],
.ts-status-peek[data-task-status-key="${keySelector}"],
.ts-status-choice-dot[data-task-status-key="${keySelector}"] {
  --ts-status-bg-light: ${pillValues.lightBackgroundCss};
  --ts-status-fg-light: ${pillValues.lightTextCss};
  --ts-status-border-light: ${pillValues.lightBorderCss};
  --ts-status-bg-dark: ${pillValues.darkBackgroundCss};
  --ts-status-fg-dark: ${pillValues.darkTextCss};
  --ts-status-border-dark: ${pillValues.darkBorderCss};
  background-color: var(--ts-status-bg) !important;
  color: var(--ts-status-fg) !important;
  border-color: var(--ts-status-border) !important;
}

.rm-checkbox[data-ts-checkbox-status="${keySelector}"] {
  --ts-checkbox-accent-light: ${checkboxValues.lightAccentCss};
  --ts-checkbox-accent-dark: ${checkboxValues.darkAccentCss};
  --ts-checkbox-wash-light: ${checkboxValues.lightWashCss};
  --ts-checkbox-wash-dark: ${checkboxValues.darkWashCss};
  --ts-checkbox-beacon-light: ${checkboxValues.lightBeaconCss};
  --ts-checkbox-beacon-dark: ${checkboxValues.darkBeaconCss};
}`);
    });
    const styleEl = ensureStatusColorStyleElement();
    if (styleEl) styleEl.textContent = dynamicRules.join("\n");
  }
  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function parseMaybeJson(value) {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch (_) {
      return value;
    }
  }
  function loadObjectSetting(key, fallback) {
    if (!extensionAPI?.settings?.get) return fallback;
    const raw = extensionAPI.settings.get(key);
    if (raw === null || typeof raw === "undefined") return fallback;
    const parsed = parseMaybeJson(raw);
    return isPlainObject(parsed) ? parsed : fallback;
  }
  function normalizeBooleanSetting(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (value && typeof value === "object") {
      if (typeof value.target?.checked === "boolean") return value.target.checked;
      if (typeof value.currentTarget?.checked === "boolean") {
        return value.currentTarget.checked;
      }
    }
    if (value === "true" || value === 1 || value === "1") return true;
    if (value === "false" || value === 0 || value === "0") return false;
    return fallback;
  }
  function loadBooleanSetting(key, fallback = false) {
    if (!extensionAPI?.settings?.get) return fallback;
    const raw = extensionAPI.settings.get(key);
    if (raw === null || typeof raw === "undefined") {
      saveSetting(key, fallback);
      return fallback;
    }
    return normalizeBooleanSetting(parseMaybeJson(raw), fallback);
  }
  function normalizeStatusLabelDisplay(value, fallback = STATUS_LABEL_DISPLAY.CHECKBOX_ONLY) {
    const candidate = value && typeof value === "object" ? value.target?.value ?? value.currentTarget?.value ?? value.value : value;
    const normalized = String(candidate || "").trim();
    return Object.values(STATUS_LABEL_DISPLAY).includes(normalized) ? normalized : fallback;
  }
  function loadStatusLabelDisplaySetting() {
    const fallback = STATUS_LABEL_DISPLAY.CHECKBOX_ONLY;
    if (!extensionAPI?.settings?.get) return fallback;
    const raw = extensionAPI.settings.get(SETTINGS_KEYS.statusLabelDisplay);
    if (raw === null || typeof raw === "undefined") {
      saveSetting(SETTINGS_KEYS.statusLabelDisplay, fallback);
      return fallback;
    }
    return normalizeStatusLabelDisplay(parseMaybeJson(raw), fallback);
  }
  function saveSetting(key, value) {
    if (!extensionAPI?.settings?.set) return;
    try {
      extensionAPI.settings.set(key, value);
    } catch (err) {
      log("Failed saving setting", key, err);
    }
  }
  function isThenable(value) {
    return Boolean(value) && typeof value.then === "function";
  }
  async function saveSettingAsync(key, value) {
    if (!extensionAPI?.settings?.set) return;
    try {
      const res = extensionAPI.settings.set(key, value);
      if (isThenable(res)) await res;
    } catch (err) {
      log("Failed saving setting", key, err);
    }
  }
  function normalizeStatusName(name) {
    return String(name || "").replace(/\s{2,}/g, " ").trim();
  }
  function validateStatusName(name) {
    const normalized = normalizeStatusName(name);
    if (!normalized) return "Name cannot be empty";
    if (normalized.includes("/")) return "Name cannot include '/'";
    if (/[\n\r\t]/.test(normalized)) return "Name cannot include newlines";
    if (normalized.includes("[[") || normalized.includes("]]")) {
      return "Name cannot include '[[', ']]'";
    }
    if (normalized.includes("#")) return "Name cannot include '#'.";
    return null;
  }
  function uniqueStrings(list) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    (list || []).forEach((v) => {
      const s = String(v || "").trim();
      if (!s) return;
      if (seen.has(s)) return;
      seen.add(s);
      out.push(s);
    });
    return out;
  }
  function normalizeStatusKey(key) {
    return String(key || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  }
  function normalizeStatusEntry(entry, fallback = {}) {
    const key = normalizeStatusKey(entry?.key ?? fallback.key);
    const fallbackName = fallback.name || DEFAULT_STATUS_NAMES[key] || key;
    const name = normalizeStatusName(entry?.name ?? fallbackName) || fallbackName;
    if (!key || !name) return null;
    return { key, name };
  }
  function normalizeStatusList(list, fallbackList = DEFAULT_STATUS_LIST) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const source = Array.isArray(list) && list.length ? list : fallbackList;
    (source || []).forEach((entry, index) => {
      const fallback = fallbackList?.[index] || {};
      const normalized = normalizeStatusEntry(entry, fallback);
      if (!normalized || seen.has(normalized.key)) return;
      seen.add(normalized.key);
      out.push(normalized);
    });
    return out.length ? out : DEFAULT_STATUS_LIST.map((entry) => ({ ...entry }));
  }
  function loadStatusList() {
    const stored = parseMaybeJson(extensionAPI?.settings?.get?.(SETTINGS_KEYS.statusList));
    if (Array.isArray(stored) && stored.length) {
      return normalizeStatusList(stored);
    }
    const defaults = normalizeStatusList(DEFAULT_STATUS_LIST);
    saveSetting(SETTINGS_KEYS.statusList, defaults);
    return defaults;
  }
  function generateStatusKey(name) {
    const base = normalizeStatusKey(name).replace(/^CUSTOM_/, "").slice(0, 30) || "STATUS";
    const existing = /* @__PURE__ */ new Set([
      ...statusList.map((entry) => entry.key),
      ...Object.keys(DEFAULT_STATUS_NAMES)
    ]);
    let key = `CUSTOM_${base}`;
    let i = 2;
    while (existing.has(key)) {
      key = `CUSTOM_${base}_${i}`;
      i += 1;
    }
    return key;
  }
  function syncCycleOrderFromStatusList() {
    CONFIG.cycleOrder = statusList.map((entry) => entry.key);
  }
  function getActiveStatusEntry(statusKey) {
    return statusList.find((entry) => entry.key === statusKey) || null;
  }
  function buildStatuses({ list }) {
    const statuses = {};
    (list || []).forEach((entry) => {
      const key = entry.key;
      const fallback = DEFAULT_STATUS_NAMES[key] || entry.name || key;
      const name = normalizeStatusName(entry.name ?? fallback) || fallback;
      const tagTitle = `${STATUS_TAG_PREFIX}${name}`;
      statuses[key] = {
        active: true,
        name,
        label: name,
        tagTitle,
        tagTitles: [tagTitle]
      };
    });
    return statuses;
  }
  function buildTagTitleIndex(statuses) {
    const idx = /* @__PURE__ */ new Map();
    Object.entries(statuses || {}).forEach(([statusKey, status]) => {
      (status.tagTitles || []).forEach((t) => idx.set(t, statusKey));
    });
    return idx;
  }
  let statusList = loadStatusList();
  syncCycleOrderFromStatusList();
  let STATUSES = buildStatuses({
    list: statusList
  });
  let statusTagToKey = buildTagTitleIndex(STATUSES);
  function rebuildStatusIndexes() {
    statusList = loadStatusList();
    syncCycleOrderFromStatusList();
    STATUSES = buildStatuses({
      list: statusList
    });
    statusTagToKey = buildTagTitleIndex(STATUSES);
    applyStatusColorOverrides(statusColorOverrides);
    refreshStatusVisuals(document);
  }
  function rebuildStatusIndexesFromMemory() {
    syncCycleOrderFromStatusList();
    STATUSES = buildStatuses({
      list: statusList
    });
    statusTagToKey = buildTagTitleIndex(STATUSES);
    applyStatusColorOverrides(statusColorOverrides);
    refreshStatusVisuals(document);
  }
  function escapeDatalogString(text) {
    return String(text || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }
  function getPageUidByTitle(title) {
    try {
      const t = escapeDatalogString(title);
      return window.roamAlphaAPI.q(`
        [:find ?uid .
         :where
         [?p :node/title "${t}"]
         [?p :block/uid ?uid]]
      `);
    } catch (err) {
      log("Failed to query page uid:", err);
      return null;
    }
  }
  async function renamePageTitle(oldTitle, newTitle) {
    const oldUid = getPageUidByTitle(oldTitle);
    if (!oldUid) return { renamed: false, reason: "missing-old" };
    const newUid = getPageUidByTitle(newTitle);
    if (newUid && newUid !== oldUid) {
      throw new Error(`Page already exists: ${newTitle}`);
    }
    await window.roamAlphaAPI.data.page.update({
      page: { uid: oldUid, title: newTitle }
    });
    return { renamed: true };
  }
  async function setStatusName(statusKey, nextName, { renameExisting } = {}) {
    if (!getActiveStatusEntry(statusKey)) {
      throw new Error(`Unknown status key: ${statusKey}`);
    }
    const error = validateStatusName(nextName);
    if (error) throw new Error(error);
    const desired = normalizeStatusName(nextName);
    const current = STATUSES[statusKey].name;
    if (desired === current) return { changed: false };
    const oldTagTitle = `${STATUS_TAG_PREFIX}${current}`;
    const newTagTitle = `${STATUS_TAG_PREFIX}${desired}`;
    const owner = statusTagToKey.get(newTagTitle);
    if (owner && owner !== statusKey) {
      throw new Error(`Conflicts with existing status: ${newTagTitle}`);
    }
    if (renameExisting) {
      await renamePageTitle(oldTagTitle, newTagTitle);
    }
    statusList = statusList.map(
      (entry) => entry.key === statusKey ? { ...entry, name: desired } : entry
    );
    await saveSettingAsync(SETTINGS_KEYS.statusList, statusList);
    await unregisterAllCommands();
    rebuildStatusIndexesFromMemory();
    await registerAllCommands();
    return { changed: true, oldTagTitle, newTagTitle };
  }
  function validateNewStatusName(name, currentStatusKey = null) {
    const error = validateStatusName(name);
    if (error) return error;
    const desired = normalizeStatusName(name);
    const tagTitle = `${STATUS_TAG_PREFIX}${desired}`;
    const owner = statusTagToKey.get(tagTitle);
    if (owner && owner !== currentStatusKey) {
      return `Conflicts with existing status: ${tagTitle}`;
    }
    return null;
  }
  async function addStatus(nextName) {
    const error = validateNewStatusName(nextName);
    if (error) throw new Error(error);
    const name = normalizeStatusName(nextName);
    const key = generateStatusKey(name);
    statusList = [...statusList, { key, name }];
    await saveSettingAsync(SETTINGS_KEYS.statusList, statusList);
    await unregisterAllCommands();
    rebuildStatusIndexesFromMemory();
    await registerAllCommands();
    return { key, name };
  }
  async function reorderStatus(statusKey, targetKey, placement = "before") {
    const idx = statusList.findIndex((entry2) => entry2.key === statusKey);
    if (idx === -1) throw new Error(`Unknown status key: ${statusKey}`);
    const targetIdx = statusList.findIndex((entry2) => entry2.key === targetKey);
    if (targetIdx === -1) throw new Error(`Unknown target status key: ${targetKey}`);
    if (statusKey === targetKey) return { changed: false };
    const next = [...statusList];
    const [entry] = next.splice(idx, 1);
    const remainingTargetIdx = next.findIndex((candidate) => candidate.key === targetKey);
    const insertIdx = placement === "after" ? remainingTargetIdx + 1 : remainingTargetIdx;
    next.splice(insertIdx, 0, entry);
    const changed = next.some((candidate, index) => candidate.key !== statusList[index]?.key);
    if (!changed) return { changed: false };
    statusList = next;
    await saveSettingAsync(SETTINGS_KEYS.statusList, statusList);
    await unregisterAllCommands();
    rebuildStatusIndexesFromMemory();
    await registerAllCommands();
    return { changed: true };
  }
  async function deleteStatus(statusKey) {
    if (statusList.length <= 1) {
      throw new Error("At least one status is required.");
    }
    const activeEntry = getActiveStatusEntry(statusKey);
    if (!activeEntry) throw new Error(`Unknown status key: ${statusKey}`);
    statusList = statusList.filter((entry) => entry.key !== statusKey);
    await saveSettingAsync(SETTINGS_KEYS.statusList, statusList);
    await unregisterAllCommands();
    rebuildStatusIndexesFromMemory();
    await registerAllCommands();
    return { deleted: true };
  }
  const registeredCommands = {
    slash: [],
    contextMenu: [],
    msContextMenu: [],
    palette: []
  };
  const pendingOperations = /* @__PURE__ */ new Set();
  let pillObserver = null;
  let themeObserver = null;
  let themeMediaQuery = null;
  let themeMediaListener = null;
  let themeRefreshFrame = null;
  let statusChooserEl = null;
  let statusChooserTeardown = null;
  let statusChooserReturnFocusEl = null;
  let statusPeekController = null;
  function log(...args) {
    if (CONFIG.debug) console.log("[TaskStatus]", ...args);
  }
  function getTextHelpers() {
    return createTaskStatusTextHelpers({
      statuses: STATUSES,
      cycleOrder: CONFIG.cycleOrder,
      todoPatterns: TODO_PATTERNS,
      donePatterns: DONE_PATTERNS,
      todoCanonical: TODO_CANONICAL
    });
  }
  function containsAny(text, patterns) {
    if (!text || typeof text !== "string") return false;
    return patterns.some((p) => text.includes(p));
  }
  function hasStatusTag(text, statusKey) {
    return getTextHelpers().hasStatusTagAnywhere(text, statusKey);
  }
  function hasManagedStatusTag(text, statusKey) {
    return getTextHelpers().hasManagedStatusTag(text, statusKey);
  }
  function hasAnyStatusTag(text) {
    return getTextHelpers().hasAnyManagedStatusTag(text);
  }
  function getStatusDisplayLabelFromTagTitle(tagTitle) {
    if (!tagTitle || typeof tagTitle !== "string") return "";
    if (tagTitle.startsWith(STATUS_TAG_PREFIX)) {
      return tagTitle.slice(STATUS_TAG_PREFIX.length);
    }
    return tagTitle;
  }
  function annotateStatusPillElement(el) {
    if (!el?.getAttribute) return;
    const tagTitle = el.getAttribute("data-tag");
    const statusKey = tagTitle ? statusTagToKey.get(tagTitle) : null;
    if (statusKey) {
      el.setAttribute("data-task-status-key", statusKey);
      el.setAttribute("data-task-status-label", getStatusDisplayLabelFromTagTitle(tagTitle));
    } else {
      el.removeAttribute("data-task-status-key");
      el.removeAttribute("data-task-status-label");
    }
  }
  function elementsIncludingRoot(root, selector) {
    const nodes = [];
    if (root?.matches?.(selector)) nodes.push(root);
    if (root?.querySelectorAll) nodes.push(...root.querySelectorAll(selector));
    return nodes;
  }
  function resolveRefreshScope(root) {
    if (!root || root === document || root === document.body) return root || document;
    if (root.nodeType !== 1) return root.parentElement || document;
    return root.closest?.(RENDER_SCOPE_SELECTOR) || root;
  }
  function clearStatusPillAnnotations(root = document) {
    elementsIncludingRoot(
      root,
      "span.rm-page-ref[data-task-status-key], a.rm-page-ref[data-task-status-key]"
    ).forEach((pill) => {
      clearStatusPillPresentation(pill);
      pill.removeAttribute("data-task-status-key");
      pill.removeAttribute("data-task-status-label");
    });
  }
  function refreshStatusVisuals(root = document) {
    const scope = resolveRefreshScope(root);
    if (!scope?.querySelectorAll && !scope?.matches) return;
    clearOwnedStatusPillPresentations(scope);
    clearOwnedStatusCheckboxes(scope);
    const pills = elementsIncludingRoot(scope, STATUS_PILL_SELECTOR);
    pills.forEach(annotateStatusPillElement);
    if (!checkboxStylingEnabled) {
      statusPeekController?.refresh?.();
      return;
    }
    const blockStringsByUid = /* @__PURE__ */ new Map();
    const textHelpers = getTextHelpers();
    pills.forEach((pill) => {
      const tagTitle = pill.getAttribute?.("data-tag");
      const statusKey = pill.getAttribute?.("data-task-status-key");
      if (!tagTitle || !statusKey) return;
      const blockUid = getBlockUidFromElement(pill);
      if (!blockUid) return;
      if (!blockStringsByUid.has(blockUid)) {
        const liveValue = getLiveBlockInputValue(blockUid);
        blockStringsByUid.set(
          blockUid,
          typeof liveValue === "string" ? liveValue : getBlockString(blockUid)
        );
      }
      syncStatusPresentationForPill({
        statusPill: pill,
        enabled: checkboxStylingEnabled,
        alertBeaconEnabled,
        hideManagedPill: statusLabelDisplay === STATUS_LABEL_DISPLAY.CHECKBOX_ONLY,
        tagTitle,
        statusTagToKey,
        blockUid,
        blockString: blockStringsByUid.get(blockUid),
        textHelpers
      });
    });
    statusPeekController?.refresh?.();
  }
  function isStatusPeekEnabled() {
    return checkboxStylingEnabled && statusLabelDisplay === STATUS_LABEL_DISPLAY.CHECKBOX_ONLY;
  }
  function setCheckboxStylingEnabled(nextValue) {
    checkboxStylingEnabled = normalizeBooleanSetting(nextValue, checkboxStylingEnabled);
    if (checkboxStylingEnabled) {
      refreshStatusVisuals(document);
      statusPeekController?.setEnabled?.(isStatusPeekEnabled());
    } else {
      clearOwnedStatusPillPresentations(document);
      statusPeekController?.setEnabled?.(false);
      clearOwnedStatusCheckboxes(document);
    }
  }
  function setStatusLabelDisplay(nextValue) {
    statusLabelDisplay = normalizeStatusLabelDisplay(nextValue, statusLabelDisplay);
    if (statusLabelDisplay === STATUS_LABEL_DISPLAY.CHECKBOX_AND_PILL) {
      clearOwnedStatusPillPresentations(document);
      statusPeekController?.setEnabled?.(false);
      refreshStatusVisuals(document);
    } else {
      refreshStatusVisuals(document);
      statusPeekController?.setEnabled?.(isStatusPeekEnabled());
    }
  }
  function setAlertBeaconEnabled(nextValue) {
    alertBeaconEnabled = normalizeBooleanSetting(nextValue, alertBeaconEnabled);
    refreshStatusVisuals(document);
  }
  function refreshMutationScopes(mutations) {
    const refreshed = /* @__PURE__ */ new Set();
    const isInsideExtensionUi = (node) => Boolean(
      node?.nodeType === 1 && (node.matches?.(EXTENSION_UI_SELECTOR) || node.closest?.(EXTENSION_UI_SELECTOR))
    );
    const containsStatusVisual = (node) => Boolean(
      node?.nodeType === 1 && !isInsideExtensionUi(node) && (node.matches?.(STATUS_MUTATION_SELECTOR) || node.querySelector?.(STATUS_MUTATION_SELECTOR))
    );
    const refreshOnce = (node) => {
      if (!node) return;
      const scope = resolveRefreshScope(node);
      if (!scope || refreshed.has(scope)) return;
      refreshed.add(scope);
      refreshStatusVisuals(scope);
    };
    for (const mutation of mutations || []) {
      if (isInsideExtensionUi(mutation.target)) continue;
      if (mutation.type === "attributes") {
        if (mutation.attributeName === "data-tag" && containsStatusVisual(mutation.target)) {
          refreshOnce(mutation.target);
        }
        continue;
      }
      for (const node of mutation.addedNodes || []) {
        if (containsStatusVisual(node)) refreshOnce(node);
      }
      const removedStatusVisual = Array.from(mutation.removedNodes || []).some(
        containsStatusVisual
      );
      if (removedStatusVisual) {
        refreshOnce(mutation.target);
      }
    }
  }
  function startStatusPillObserver() {
    if (pillObserver) return;
    if (!document?.body) return;
    pillObserver = new MutationObserver((mutations) => refreshMutationScopes(mutations));
    pillObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tag"]
    });
    refreshStatusVisuals(document);
  }
  function stopStatusPillObserver() {
    if (pillObserver) {
      try {
        pillObserver.disconnect();
      } catch (_) {
      }
    }
    pillObserver = null;
    clearOwnedStatusPillPresentations(document);
    clearOwnedStatusCheckboxes(document);
    clearStatusPillAnnotations(document);
  }
  function scheduleThemeColorRefresh() {
    if (themeRefreshFrame != null) return;
    const requestFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));
    themeRefreshFrame = requestFrame(() => {
      themeRefreshFrame = null;
      applyStatusColorOverrides(statusColorOverrides);
    });
  }
  function startThemeObserver() {
    if (themeObserver) return;
    themeObserver = new MutationObserver(() => scheduleThemeColorRefresh());
    [document.documentElement, document.body].filter(Boolean).forEach((target) => {
      themeObserver.observe(target, {
        attributes: true,
        attributeFilter: ["class", "style"]
      });
    });
    try {
      themeMediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)") || null;
      themeMediaListener = () => scheduleThemeColorRefresh();
      if (themeMediaQuery?.addEventListener) {
        themeMediaQuery.addEventListener("change", themeMediaListener);
      } else if (themeMediaQuery?.addListener) {
        themeMediaQuery.addListener(themeMediaListener);
      }
    } catch (_) {
      themeMediaQuery = null;
      themeMediaListener = null;
    }
  }
  function stopThemeObserver() {
    if (themeObserver) {
      try {
        themeObserver.disconnect();
      } catch (_) {
      }
    }
    themeObserver = null;
    if (themeMediaQuery && themeMediaListener) {
      try {
        if (themeMediaQuery.removeEventListener) {
          themeMediaQuery.removeEventListener("change", themeMediaListener);
        } else if (themeMediaQuery.removeListener) {
          themeMediaQuery.removeListener(themeMediaListener);
        }
      } catch (_) {
      }
    }
    themeMediaQuery = null;
    themeMediaListener = null;
    if (themeRefreshFrame != null) {
      const cancelFrame = window.cancelAnimationFrame || window.clearTimeout;
      cancelFrame?.(themeRefreshFrame);
    }
    themeRefreshFrame = null;
  }
  function getBlockString(blockUid) {
    try {
      const blockData = window.roamAlphaAPI.data.pull(
        "[:block/string]",
        [":block/uid", blockUid]
      );
      return blockData?.[":block/string"] ?? null;
    } catch (err) {
      log("Error getting block string:", err);
      return null;
    }
  }
  function getLiveBlockInputValue(blockUid) {
    try {
      const active = document.activeElement;
      if (active && typeof active.value === "string") {
        const id = active.id || "";
        if (id.endsWith(blockUid)) return active.value;
      }
      const byId = document.getElementById(`block-input-${blockUid}`);
      if (byId && typeof byId.value === "string") return byId.value;
      const bySuffix = document.querySelector(`textarea[id$="${blockUid}"]`);
      if (bySuffix && typeof bySuffix.value === "string") return bySuffix.value;
    } catch (_) {
    }
    return null;
  }
  async function updateBlock(blockUid, newText) {
    await window.roamAlphaAPI.data.block.update({
      block: { uid: blockUid, string: newText }
    });
  }
  const readBlockStringFresh = createFreshBlockStringReader(window.roamAlphaAPI);
  const certifiedBlockWriter = createCertifiedBlockStringWriter({
    readFresh: readBlockStringFresh,
    updateBlock,
    getLiveEditorString: getLiveBlockInputValue
  });
  const statusWriteRouter = createBetterTasksStatusRouter({
    windowLike: window,
    directWriter: certifiedBlockWriter
  });
  function getCurrentStatus(text) {
    return getTextHelpers().getCurrentStatus(text);
  }
  function getNextStatus(currentStatus) {
    return getTextHelpers().getNextStatus(currentStatus);
  }
  function isDoneTask(text) {
    return getTextHelpers().isDoneTask(text);
  }
  function isTaskLike(text) {
    return getTextHelpers().isTaskLike(text);
  }
  function applyStatusToText(text, statusKey) {
    return getTextHelpers().applyStatusToText(text, statusKey);
  }
  function removeStatusFromText(text) {
    return getTextHelpers().removeStatusFromText(text);
  }
  async function getOperationTargetUids({ primaryUid = null, context = null } = {}) {
    return await resolveTaskStatusTargetUids({
      roamAlphaAPI: window.roamAlphaAPI,
      context,
      primaryUid
    });
  }
  async function setBlockStatus(blockUid, statusKey, { editorString, expectedLiveEditorString } = {}) {
    if (!blockUid) return { status: "rejected", didWrite: false, reason: "missing-uid" };
    if (statusKey != null && !STATUSES[statusKey]?.active) {
      return { status: "rejected", didWrite: false, reason: "inactive-status" };
    }
    if (pendingOperations.has(blockUid)) {
      return { status: "rejected", didWrite: false, reason: "operation-pending" };
    }
    let expectedString;
    try {
      expectedString = await readBlockStringFresh(blockUid);
    } catch (error) {
      return { status: "unknown", didWrite: false, reason: "fresh-read-failed", error };
    }
    if (expectedString === null) {
      return { status: "rejected", didWrite: false, reason: "block-not-found" };
    }
    const hasEditorHandoff = editorString !== void 0 || expectedLiveEditorString !== void 0;
    if (hasEditorHandoff && (typeof editorString !== "string" || typeof expectedLiveEditorString !== "string")) {
      return { status: "rejected", didWrite: false, reason: "invalid-editor-handoff" };
    }
    const sourceString = hasEditorHandoff ? editorString : expectedString;
    const newText = statusKey === null ? removeStatusFromText(sourceString) : applyStatusToText(sourceString, statusKey);
    if (newText === expectedString) {
      return { status: "unchanged", didWrite: false, reason: "already-current", string: expectedString };
    }
    pendingOperations.add(blockUid);
    try {
      const outcome = await statusWriteRouter.apply({
        uid: blockUid,
        expectedString,
        nextString: newText,
        statusTagTitle: statusKey === null ? null : STATUSES[statusKey].tagTitle,
        expectedLiveEditorString,
        editorString
      });
      if (!["updated", "unchanged"].includes(outcome?.status)) {
        console.warn("[TaskStatus] Status edit refused", {
          uid: blockUid,
          reason: outcome?.reason || "unknown"
        });
      }
      return outcome;
    } finally {
      pendingOperations.delete(blockUid);
    }
  }
  async function setStatusForTargets(primaryUid, statusKey, context = null) {
    const targets = await getOperationTargetUids({ primaryUid, context });
    await setStatusForBlockUids(targets, statusKey);
  }
  async function setStatusForBlockUids(targets, statusKey) {
    const blockUids = uniqueStrings(targets || []);
    for (const blockUid of blockUids) {
      await setBlockStatus(blockUid, statusKey);
    }
  }
  async function cycleBlockStatus(blockUid) {
    try {
      const blockString = await readBlockStringFresh(blockUid);
      if (blockString === null) return { status: "rejected", didWrite: false, reason: "block-not-found" };
      if (isDoneTask(blockString)) return;
      const current = getCurrentStatus(blockString);
      const next = getNextStatus(current);
      return await setBlockStatus(blockUid, next);
    } catch (error) {
      return { status: "unknown", didWrite: false, reason: "fresh-read-failed", error };
    }
  }
  async function cycleStatusForTargets(primaryUid, context = null) {
    const targets = await getOperationTargetUids({ primaryUid, context });
    for (const blockUid of targets) {
      await cycleBlockStatus(blockUid);
    }
  }
  function extractUid(idString) {
    if (!idString) return null;
    const match = idString.match(/([A-Za-z0-9_-]{9})$/);
    return match ? match[1] : null;
  }
  function getBlockUidFromDomElement(element) {
    if (!element) return null;
    const withDataUid = element.closest?.("[data-uid]");
    if (withDataUid) {
      const uid = withDataUid.getAttribute("data-uid");
      if (uid) return uid;
    }
    const blockInput = element.closest?.("[id^='block-input-']") || element.closest?.(".roam-block-container")?.querySelector("[id^='block-input-']");
    if (blockInput) {
      const uid = extractUid(blockInput.id);
      if (uid) return uid;
    }
    const roamBlock = element.closest?.(".roam-block");
    if (roamBlock) {
      return roamBlock.getAttribute("data-uid") || roamBlock.dataset?.uid || null;
    }
    return null;
  }
  function getBlockUidFromElement(element) {
    if (!element) return null;
    const domUtil = window.roamAlphaAPI?.util?.dom;
    if (domUtil?.blockUidFromTarget) {
      try {
        const uid = domUtil.blockUidFromTarget(element);
        if (uid) return uid;
      } catch (_) {
      }
    }
    return getBlockUidFromDomElement(element);
  }
  function getStatusKeyFromElement(target) {
    if (!target) return null;
    const tagEl = getStatusPillElement(target);
    if (tagEl) {
      const tagTitle = tagEl.getAttribute("data-tag");
      if (tagTitle && statusTagToKey.has(tagTitle)) {
        return statusTagToKey.get(tagTitle);
      }
      const annotatedKey = tagEl.getAttribute("data-task-status-key");
      if (annotatedKey && STATUSES[annotatedKey]) return annotatedKey;
    }
    return null;
  }
  function getStatusPillElement(target) {
    if (!target?.closest) return null;
    return target.closest("span.rm-page-ref[data-tag]") || target.closest("a.rm-page-ref[data-tag]") || target.closest("span.rm-page-ref[data-task-status-key]") || target.closest("a.rm-page-ref[data-task-status-key]");
  }
  function stopRoamNavigation(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }
  function getStatusEventContext(event) {
    const target = event.target;
    const statusKey = getStatusKeyFromElement(target);
    if (!statusKey) return null;
    const anchorEl = getStatusPillElement(target);
    const blockUid = getBlockUidFromElement(target);
    if (!blockUid) return null;
    const blockString = getBlockString(blockUid);
    if (blockString === null) return null;
    const isManagedStatus = hasManagedStatusTag(blockString, statusKey);
    if (!isManagedStatus) return null;
    const hasTodo = containsAny(blockString, TODO_PATTERNS);
    if (!hasTodo && !isTaskLike(blockString)) return null;
    return { statusKey, blockUid, anchorEl, returnFocusEl: anchorEl };
  }
  function resolveStatusPeekContext({ checkbox, input, statusKey }) {
    if (!checkbox || !input || !statusKey || !STATUSES[statusKey]?.active) return null;
    const blockUid = getBlockUidFromDomElement(checkbox);
    if (!blockUid) return null;
    const certifiedUid = checkbox.getAttribute?.(CHECKBOX_UID_ATTRIBUTE);
    if (!certifiedUid || certifiedUid !== blockUid) return null;
    return {
      blockUid,
      statusKey,
      label: STATUSES[statusKey].label || statusKey,
      anchorEl: checkbox,
      returnFocusEl: input
    };
  }
  function closeStatusChooser({ restoreFocus = false } = {}) {
    const hadChooser = Boolean(statusChooserEl || statusChooserTeardown);
    const returnFocusEl = statusChooserReturnFocusEl;
    if (statusChooserTeardown) {
      try {
        statusChooserTeardown();
      } catch (_) {
      }
    }
    statusChooserTeardown = null;
    if (statusChooserEl?.remove) {
      try {
        statusChooserEl.remove();
      } catch (_) {
      }
    }
    statusChooserEl = null;
    statusChooserReturnFocusEl = null;
    if (hadChooser) statusPeekController?.chooserClosed?.();
    if (restoreFocus && returnFocusEl?.isConnected) {
      try {
        returnFocusEl.focus?.({ preventScroll: true });
      } catch (_) {
      }
    }
  }
  function positionStatusChooser(el, anchorEl) {
    if (!el || !anchorEl?.getBoundingClientRect) return;
    const rect = anchorEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const margin = 8;
    const arrow = el.querySelector(".bp3-popover-arrow");
    const arrowSvg = arrow?.querySelector("svg");
    el.style.visibility = "hidden";
    el.style.left = "0px";
    el.style.top = "0px";
    window.requestAnimationFrame(() => {
      if (!el.isConnected) return;
      const chooserRect = el.getBoundingClientRect();
      const left = Math.max(
        margin,
        Math.min(rect.left, viewportWidth - chooserRect.width - margin)
      );
      const below = rect.bottom + 8;
      const above = rect.top - chooserRect.height - 8;
      const opensBelow = below + chooserRect.height <= viewportHeight - margin || above < margin;
      const top = opensBelow ? below : Math.max(margin, above);
      const arrowLeft = Math.max(
        4,
        Math.min(rect.left + rect.width / 2 - left - 15, chooserRect.width - 34)
      );
      el.style.left = `${Math.round(left)}px`;
      el.style.top = `${Math.round(top)}px`;
      el.style.transformOrigin = `${Math.round(arrowLeft + 15)}px ${opensBelow ? "top" : "bottom"}`;
      el.classList.toggle("ts-status-chooser-above", !opensBelow);
      if (arrow) {
        arrow.style.left = `${Math.round(arrowLeft)}px`;
        arrow.style.top = opensBelow ? "-11px" : "";
        arrow.style.bottom = opensBelow ? "" : "-11px";
      }
      if (arrowSvg) arrowSvg.style.transform = opensBelow ? "rotate(90deg)" : "rotate(270deg)";
      el.style.visibility = "visible";
    });
  }
  function makeBlueprintPopoverArrow() {
    const arrow = document.createElement("div");
    arrow.className = "bp3-popover-arrow";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 30 30");
    svg.style.transform = "rotate(90deg)";
    const border = document.createElementNS("http://www.w3.org/2000/svg", "path");
    border.setAttribute("class", "bp3-popover-arrow-border");
    border.setAttribute(
      "d",
      "M8.11 6.302c1.015-.936 1.887-2.922 1.887-4.297v26c0-1.378-.868-3.357-1.888-4.297L.925 17.09c-1.237-1.14-1.233-3.034 0-4.17L8.11 6.302z"
    );
    const fill = document.createElementNS("http://www.w3.org/2000/svg", "path");
    fill.setAttribute("class", "bp3-popover-arrow-fill");
    fill.setAttribute(
      "d",
      "M8.787 7.036c1.22-1.125 2.21-3.376 2.21-5.03V0v30-2.005c0-1.654-.983-3.9-2.21-5.03l-7.183-6.616c-.81-.746-.802-1.96 0-2.7l7.183-6.614z"
    );
    svg.append(border, fill);
    arrow.append(svg);
    return arrow;
  }
  function makeStatusMenuItem({ label, className = "", ariaCurrent = false, onChoose }) {
    const li = document.createElement("li");
    const item = document.createElement("a");
    item.className = `ts-status-choice bp3-menu-item bp3-popover-dismiss ${className}`.trim();
    item.setAttribute("role", "menuitem");
    item.setAttribute("tabindex", "0");
    if (ariaCurrent) {
      item.setAttribute("aria-current", "true");
      item.classList.add("bp3-active", "bp3-intent-primary");
    }
    const text = document.createElement("div");
    text.className = "ts-status-choice-label bp3-fill bp3-text-overflow-ellipsis";
    text.textContent = label;
    item.append(text);
    item.addEventListener("mousedown", stopRoamNavigation);
    item.addEventListener("click", (event) => {
      stopRoamNavigation(event);
      onChoose();
    });
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      stopRoamNavigation(event);
      onChoose();
    });
    li.append(item);
    return li;
  }
  function makeStatusChoiceButton({ statusKey, currentStatusKey, targetUids }) {
    const status = STATUSES[statusKey];
    const item = makeStatusMenuItem({
      label: status?.label || statusKey,
      ariaCurrent: statusKey === currentStatusKey,
      onChoose: () => {
        void setStatusForBlockUids(targetUids, statusKey).catch((err) => log("Status chooser set error:", err)).finally(closeStatusChooser);
      }
    });
    const choice = item.querySelector(".ts-status-choice");
    if (choice) choice.setAttribute("data-task-status-choice", statusKey);
    return item;
  }
  async function openStatusChooser({
    blockUid,
    statusKey,
    anchorEl,
    returnFocusEl = null,
    isIntentCurrent = null
  }) {
    closeStatusChooser();
    const targetUids = await getOperationTargetUids({ primaryUid: blockUid });
    if (typeof isIntentCurrent === "function" && !isIntentCurrent()) return false;
    if (!targetUids.length) return false;
    const chooser = document.createElement("div");
    chooser.className = "ts-status-chooser bp3-popover";
    const content = document.createElement("div");
    content.className = "bp3-popover-content";
    const choices = document.createElement("ul");
    choices.className = "ts-status-choice-list bp3-menu";
    choices.setAttribute("role", "menu");
    if (targetUids.length > 1) {
      const count = document.createElement("li");
      count.className = "ts-status-chooser-count bp3-menu-header";
      const countText = document.createElement("h6");
      countText.textContent = `${targetUids.length} selected blocks`;
      count.append(countText);
      choices.append(count);
    }
    CONFIG.cycleOrder.forEach((key) => {
      if (!STATUSES[key]?.active) return;
      choices.append(
        makeStatusChoiceButton({
          statusKey: key,
          currentStatusKey: statusKey,
          targetUids
        })
      );
    });
    choices.append(
      makeStatusMenuItem({
        label: "Remove status",
        className: "ts-status-choice-remove",
        onChoose: () => {
          void setStatusForBlockUids(targetUids, null).catch((err) => log("Status chooser remove error:", err)).finally(closeStatusChooser);
        }
      })
    );
    content.append(choices);
    chooser.append(makeBlueprintPopoverArrow(), content);
    (portalRoot || document.body).appendChild(chooser);
    statusChooserEl = chooser;
    statusChooserReturnFocusEl = returnFocusEl || anchorEl || null;
    positionStatusChooser(chooser, anchorEl);
    chooser.querySelector(".ts-status-choice[aria-current='true']")?.focus?.({
      preventScroll: true
    });
    const closeOnOutsideMouseDown = (event) => {
      if (statusChooserEl?.contains(event.target)) return;
      closeStatusChooser();
    };
    const closeOnKeyDown = (event) => {
      if (event.key === "Escape") {
        stopRoamNavigation(event);
        closeStatusChooser({ restoreFocus: true });
      }
    };
    const closeOnViewportChange = () => closeStatusChooser();
    document.addEventListener("mousedown", closeOnOutsideMouseDown, true);
    document.addEventListener("keydown", closeOnKeyDown, true);
    window.addEventListener("resize", closeOnViewportChange, true);
    window.addEventListener("scroll", closeOnViewportChange, true);
    statusChooserTeardown = () => {
      document.removeEventListener("mousedown", closeOnOutsideMouseDown, true);
      document.removeEventListener("keydown", closeOnKeyDown, true);
      window.removeEventListener("resize", closeOnViewportChange, true);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
    return true;
  }
  function handleStatusMouseDown(event) {
    if (typeof event.button === "number" && event.button !== 0) return;
    const ctx = getStatusEventContext(event);
    if (!ctx) return;
    stopRoamNavigation(event);
  }
  function handleStatusTouchStart(event) {
    const ctx = getStatusEventContext(event);
    if (!ctx) return;
    stopRoamNavigation(event);
  }
  async function handleStatusClick(event) {
    const ctx = getStatusEventContext(event);
    if (!ctx) return;
    stopRoamNavigation(event);
    if (CONFIG.shiftClickRemoves && event.shiftKey) {
      await setStatusForTargets(ctx.blockUid, null);
      return;
    }
    await openStatusChooser(ctx);
  }
  async function registerSlashCommand(statusKey) {
    const status = STATUSES[statusKey];
    const label = `task status: ${status.label}`;
    const slashCommandApi = extensionAPI?.ui?.slashCommand;
    if (!slashCommandApi?.addCommand || !slashCommandApi?.removeCommand) {
      throw new Error("Roam did not provide extensionAPI.ui.slashCommand");
    }
    await slashCommandApi.addCommand({
      label,
      callback: (context) => {
        void (async () => {
          const blockUid = context["block-uid"];
          const indexes = context["indexes"];
          const liveEditorString = getLiveBlockInputValue(blockUid);
          let blockString = liveEditorString ?? getBlockString(blockUid);
          if (blockString === null) return;
          blockString = getTextHelpers().removeSlashCommandFragment(blockString, indexes);
          await setBlockStatus(blockUid, statusKey, {
            editorString: liveEditorString === null ? void 0 : blockString,
            expectedLiveEditorString: liveEditorString === null ? void 0 : liveEditorString
          });
        })().catch((err) => log("Slash command error:", err));
        return null;
      }
    });
    registeredCommands.slash.push({ label, api: slashCommandApi });
  }
  function registerContextMenu(statusKey) {
    const status = STATUSES[statusKey];
    const label = `Task Status: Set ${status.label}`;
    window.roamAlphaAPI.ui.blockContextMenu.addCommand({
      label,
      "display-conditional": (context) => {
        if (context?.["read-only?"]) return false;
        const text = context?.["block-string"];
        if (!text || typeof text !== "string") return false;
        if (!isTaskLike(text)) return false;
        return true;
      },
      callback: async (context) => {
        const blockUid = context?.["block-uid"];
        if (!blockUid) return;
        await setStatusForTargets(blockUid, statusKey, context);
      }
    });
    registeredCommands.contextMenu.push(label);
  }
  function registerMultiSelectContextMenu(statusKey) {
    const api = window.roamAlphaAPI?.ui?.msContextMenu;
    if (!api?.addCommand) return;
    const status = STATUSES[statusKey];
    const label = `Task Status: Set ${status.label}`;
    api.addCommand({
      label,
      callback: async (context) => {
        await setStatusForTargets(null, statusKey, context);
      }
    });
    registeredCommands.msContextMenu.push({ label, api });
  }
  async function registerPaletteCommand(statusKey) {
    const status = STATUSES[statusKey];
    const label = `Task Status: Set ${status.label}`;
    const api = extensionAPI?.ui?.commandPalette || window.roamAlphaAPI.ui.commandPalette;
    try {
      const res = api.addCommand({
        label,
        "disable-hotkey": false,
        callback: async () => {
          await setStatusForTargets(null, statusKey);
        }
      });
      if (isThenable(res)) await res;
    } catch (err) {
      log("Failed to add palette command:", label, err);
    }
    registeredCommands.palette.push({ label, api });
  }
  async function registerUtilityPaletteCommands() {
    const api = extensionAPI?.ui?.commandPalette || window.roamAlphaAPI.ui.commandPalette;
    const cycleLabel = "Task Status: Cycle";
    try {
      const res = api.addCommand({
        label: cycleLabel,
        "disable-hotkey": false,
        callback: async () => {
          await cycleStatusForTargets(null);
        }
      });
      if (isThenable(res)) await res;
    } catch (err) {
      log("Failed to add palette command:", cycleLabel, err);
    }
    registeredCommands.palette.push({ label: cycleLabel, api });
    const msApi = window.roamAlphaAPI?.ui?.msContextMenu;
    if (msApi?.addCommand) {
      try {
        msApi.addCommand({
          label: cycleLabel,
          callback: async (context) => {
            await cycleStatusForTargets(null, context);
          }
        });
        registeredCommands.msContextMenu.push({ label: cycleLabel, api: msApi });
      } catch (err) {
        log("Failed to add multiselect context menu command:", cycleLabel, err);
      }
    }
    const removeLabel = "Task Status: Remove";
    try {
      const res = api.addCommand({
        label: removeLabel,
        "disable-hotkey": false,
        callback: async () => {
          await setStatusForTargets(null, null);
        }
      });
      if (isThenable(res)) await res;
    } catch (err) {
      log("Failed to add palette command:", removeLabel, err);
    }
    registeredCommands.palette.push({ label: removeLabel, api });
    if (msApi?.addCommand) {
      try {
        msApi.addCommand({
          label: removeLabel,
          callback: async (context) => {
            await setStatusForTargets(null, null, context);
          }
        });
        registeredCommands.msContextMenu.push({ label: removeLabel, api: msApi });
      } catch (err) {
        log("Failed to add multiselect context menu command:", removeLabel, err);
      }
    }
  }
  async function registerAllCommands() {
    for (const statusKey of CONFIG.cycleOrder) {
      await registerSlashCommand(statusKey);
      registerContextMenu(statusKey);
      registerMultiSelectContextMenu(statusKey);
      await registerPaletteCommand(statusKey);
    }
    await registerUtilityPaletteCommands();
  }
  async function unregisterAllCommands() {
    for (const entry of registeredCommands.slash) {
      try {
        await entry.api.removeCommand({ label: entry.label });
      } catch (_) {
      }
    }
    registeredCommands.contextMenu.forEach((label) => {
      try {
        window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label });
      } catch (_) {
      }
    });
    registeredCommands.msContextMenu.forEach((entry) => {
      try {
        entry.api.removeCommand({ label: entry.label });
      } catch (_) {
      }
    });
    for (const entry of registeredCommands.palette) {
      try {
        const res = entry.api.removeCommand({ label: entry.label });
        if (isThenable(res)) await res;
      } catch (_) {
      }
    }
    registeredCommands.slash = [];
    registeredCommands.contextMenu = [];
    registeredCommands.msContextMenu = [];
    registeredCommands.palette = [];
  }
  async function registerSettingsPanel() {
    if (!extensionAPI?.settings?.panel?.create) return;
    const React = window.React;
    const StatusNamesPanel = () => {
      if (!React?.useState || !React?.useEffect || !React?.useRef) {
        return React?.createElement ? React.createElement(
          "div",
          { className: "bp3-text-small" },
          "React not available."
        ) : null;
      }
      const rootRef = React.useRef(null);
      React.useEffect(() => {
        try {
          const root = rootRef.current;
          if (!root?.closest) return;
          const formGroup = root.closest(".bp3-form-group") || root.closest(".bp4-form-group") || root.closest(".bp5-form-group") || root.parentElement;
          if (!formGroup?.querySelector) return;
          const label = formGroup.querySelector("label.bp3-label") || formGroup.querySelector(".bp3-label") || formGroup.querySelector("label.bp4-label") || formGroup.querySelector(".bp4-label") || formGroup.querySelector("label.bp5-label") || formGroup.querySelector(".bp5-label");
          const labelWidth = label ? label.getBoundingClientRect().width : 0;
          if (label) label.style.display = "none";
          const content = formGroup.querySelector(".bp3-form-content") || formGroup.querySelector(".bp4-form-content") || formGroup.querySelector(".bp5-form-content");
          if (content) {
            content.style.marginLeft = "0";
            content.style.width = "100%";
          }
          if (labelWidth > 0) {
            root.style.position = "relative";
            root.style.left = `-${Math.round(labelWidth)}px`;
            root.style.width = `calc(100% + ${Math.round(labelWidth)}px)`;
          }
        } catch (_) {
        }
      }, []);
      const readStatusRows = () => statusList.map((entry) => ({
        key: entry.key,
        name: STATUSES?.[entry.key]?.name ?? entry.name
      }));
      const rowsToNameMap = (rows) => {
        const out = {};
        (rows || []).forEach((row) => {
          out[row.key] = row.name;
        });
        return out;
      };
      const [statusRows, setStatusRows] = React.useState(() => readStatusRows());
      const order = statusRows.map((row) => row.key);
      const readSaved = () => rowsToNameMap(readStatusRows());
      const [savedByKey, setSavedByKey] = React.useState(
        () => rowsToNameMap(statusRows)
      );
      const [draftByKey, setDraftByKey] = React.useState(
        () => rowsToNameMap(statusRows)
      );
      const [workingKey, setWorkingKey] = React.useState(null);
      const [errorByKey, setErrorByKey] = React.useState({});
      const [infoByKey, setInfoByKey] = React.useState({});
      const [newStatusName, setNewStatusName] = React.useState("");
      const [newStatusError, setNewStatusError] = React.useState(null);
      const [newStatusInfo, setNewStatusInfo] = React.useState(null);
      const [openStatusMenuKey, setOpenStatusMenuKey] = React.useState(null);
      const [dragState, setDragState] = React.useState({
        key: null,
        targetKey: null,
        placement: null
      });
      const [openColorPopover, setOpenColorPopover] = React.useState(null);
      React.useEffect(() => {
        const closePanels = (event) => {
          const root = rootRef.current;
          const target = event.target;
          if (root?.contains?.(target)) {
            const keepOpen = target?.closest?.(
              ".ts-status-row-menu, .ts-status-row-menu-button, .ts-status-color-popover, .ts-status-color-swatch-button"
            );
            if (keepOpen) return;
          }
          setOpenStatusMenuKey(null);
          setOpenColorPopover(null);
        };
        const closeOnEscape = (event) => {
          if (event.key !== "Escape") return;
          setOpenStatusMenuKey(null);
          setOpenColorPopover(null);
        };
        document.addEventListener("mousedown", closePanels, true);
        document.addEventListener("keydown", closeOnEscape, true);
        return () => {
          document.removeEventListener("mousedown", closePanels, true);
          document.removeEventListener("keydown", closeOnEscape, true);
        };
      }, []);
      const refreshStatusRows = () => {
        const rows = readStatusRows();
        const names = rowsToNameMap(rows);
        setStatusRows(rows);
        setSavedByKey(names);
        setDraftByKey(names);
        return { rows, names };
      };
      const setDraft = (k, v) => {
        setDraftByKey((prev) => ({ ...prev, [k]: v }));
      };
      const clearMessages = (k) => {
        setErrorByKey((prev) => ({ ...prev, [k]: null }));
        setInfoByKey((prev) => ({ ...prev, [k]: null }));
      };
      const apply = async (k, renameExisting) => {
        clearMessages(k);
        setWorkingKey(k);
        try {
          const res = await setStatusName(k, draftByKey[k], { renameExisting });
          if (!res?.changed) {
            setInfoByKey((prev) => ({ ...prev, [k]: "No change." }));
            return;
          }
          refreshStatusRows();
          setInfoByKey((prev) => ({
            ...prev,
            [k]: renameExisting ? "Renamed tag page." : "Updated name."
          }));
        } catch (e) {
          const msg = e?.message || String(e);
          setErrorByKey((prev) => ({ ...prev, [k]: msg }));
        } finally {
          setWorkingKey(null);
        }
      };
      const addStatusFromDraft = async () => {
        const error = validateNewStatusName(newStatusName);
        setNewStatusError(error);
        setNewStatusInfo(null);
        if (error) return;
        setWorkingKey("__ADD__");
        try {
          const added = await addStatus(newStatusName);
          refreshStatusRows();
          setNewStatusName("");
          setInfoByKey((prev) => ({ ...prev, [added.key]: "Added." }));
          setNewStatusInfo(null);
        } catch (e) {
          setNewStatusError(e?.message || String(e));
        } finally {
          setWorkingKey(null);
        }
      };
      const reorderStatusRow = async (k, targetKey, placement) => {
        if (!k || !targetKey || k === targetKey) return;
        clearMessages(k);
        setOpenStatusMenuKey(null);
        setWorkingKey(k);
        try {
          await reorderStatus(k, targetKey, placement);
          refreshStatusRows();
        } catch (e) {
          setErrorByKey((prev) => ({ ...prev, [k]: e?.message || String(e) }));
        } finally {
          setWorkingKey(null);
          setDragState({ key: null, targetKey: null, placement: null });
        }
      };
      const deleteStatusRow = async (k) => {
        setOpenStatusMenuKey(null);
        const label = savedByKey[k] || STATUSES?.[k]?.label || k;
        const ok = window.confirm(
          `Delete "${label}" from active statuses? Existing tags will remain in the graph but will no longer be managed by this extension.`
        );
        if (!ok) return;
        clearMessages(k);
        setWorkingKey(k);
        try {
          await deleteStatus(k);
          refreshStatusRows();
          setNewStatusInfo(`Deleted "${label}".`);
        } catch (e) {
          setErrorByKey((prev) => ({ ...prev, [k]: e?.message || String(e) }));
        } finally {
          setWorkingKey(null);
        }
      };
      const onStatusDragStart = (event, k) => {
        if (workingKey) {
          event.preventDefault();
          return;
        }
        setOpenStatusMenuKey(null);
        setDragState({ key: k, targetKey: null, placement: null });
        try {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", k);
        } catch (_) {
        }
      };
      const onStatusDragOver = (event, k) => {
        const draggedKey = dragState.key;
        if (!draggedKey || draggedKey === k || workingKey) return;
        event.preventDefault();
        try {
          event.dataTransfer.dropEffect = "move";
        } catch (_) {
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const placement = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
        if (dragState.targetKey !== k || dragState.placement !== placement) {
          setDragState((prev) => ({ ...prev, targetKey: k, placement }));
        }
      };
      const onStatusDrop = (event, targetKey) => {
        event.preventDefault();
        const draggedKey = dragState.key || (() => {
          try {
            return event.dataTransfer.getData("text/plain");
          } catch (_) {
            return null;
          }
        })();
        const placement = dragState.targetKey === targetKey && dragState.placement ? dragState.placement : "before";
        void reorderStatusRow(draggedKey, targetKey, placement);
      };
      const onStatusDragEnd = () => {
        setDragState({ key: null, targetKey: null, placement: null });
      };
      const normalizeColorEntry = (entry) => {
        return {
          base: normalizeCssColorValue(entry?.base),
          text: normalizeCssColorValue(entry?.text)
        };
      };
      const normalizeColorsState = (overrides) => {
        const out = {};
        order.forEach((k) => {
          out[k] = normalizeColorEntry(overrides?.[k]);
        });
        return out;
      };
      const readSavedColors = () => {
        const stored = loadObjectSetting(SETTINGS_KEYS.statusColorOverrides, {});
        return normalizeColorsState(stored);
      };
      const [savedColorsByKey, setSavedColorsByKey] = React.useState(() => readSavedColors());
      const [draftColorsByKey, setDraftColorsByKey] = React.useState(() => readSavedColors());
      const [workingColorKey, setWorkingColorKey] = React.useState(null);
      const [colorErrorByKey, setColorErrorByKey] = React.useState({});
      const [colorInfoByKey, setColorInfoByKey] = React.useState({});
      const setDraftColors = (k, patch) => {
        setDraftColorsByKey((prev) => ({
          ...prev,
          [k]: { ...prev[k] || {}, ...patch || {} }
        }));
      };
      const clearColorMessages = (k) => {
        setColorErrorByKey((prev) => ({ ...prev, [k]: null }));
        setColorInfoByKey((prev) => ({ ...prev, [k]: null }));
      };
      const validateColorEntry = (entry) => {
        const base = normalizeCssColorValue(entry?.base);
        const text = normalizeCssColorValue(entry?.text);
        if (base && !cssColorIsSupported(base)) {
          return "Base color must be a valid CSS color (e.g. #14b8a6, rgb(20,184,166)).";
        }
        if (text && !cssColorIsSupported(text)) {
          return "Text override must be a valid CSS color.";
        }
        if (base && !parseCssColorToRgb(base)) {
          return "Could not derive background/border from the base color.";
        }
        return null;
      };
      const applyColors = async (k, nextEntry) => {
        clearColorMessages(k);
        setWorkingColorKey(k);
        try {
          const normalized = normalizeColorEntry(nextEntry);
          const validation = validateColorEntry(normalized);
          if (validation) {
            setColorErrorByKey((prev) => ({ ...prev, [k]: validation }));
            return;
          }
          const base = normalized.base;
          const text = normalized.text;
          const current = loadObjectSetting(SETTINGS_KEYS.statusColorOverrides, {});
          const nextOverrides = { ...current || {} };
          if (!base && !text) {
            delete nextOverrides[k];
          } else {
            nextOverrides[k] = { base, text };
          }
          await saveSettingAsync(SETTINGS_KEYS.statusColorOverrides, nextOverrides);
          statusColorOverrides = nextOverrides;
          clearStatusColorOverrides();
          applyStatusColorOverrides(statusColorOverrides);
          const refreshed = normalizeColorsState(nextOverrides);
          setSavedColorsByKey(refreshed);
          setDraftColorsByKey(refreshed);
          setColorInfoByKey((prev) => ({ ...prev, [k]: "Saved." }));
        } catch (e) {
          const msg = e?.message || String(e);
          setColorErrorByKey((prev) => ({ ...prev, [k]: msg }));
        } finally {
          setWorkingColorKey(null);
        }
      };
      const resetAllColors = async () => {
        const key = "__ALL__";
        clearColorMessages(key);
        setWorkingColorKey(key);
        try {
          const nextOverrides = {};
          await saveSettingAsync(SETTINGS_KEYS.statusColorOverrides, nextOverrides);
          statusColorOverrides = nextOverrides;
          applyStatusColorOverrides(statusColorOverrides);
          const refreshed = normalizeColorsState(nextOverrides);
          setSavedColorsByKey(refreshed);
          setDraftColorsByKey(refreshed);
          setColorInfoByKey((prev) => ({ ...prev, [key]: "Reset." }));
        } catch (e) {
          const msg = e?.message || String(e);
          setColorErrorByKey((prev) => ({ ...prev, [key]: msg }));
        } finally {
          setWorkingColorKey(null);
        }
      };
      const clamp8 = (n) => {
        const v = Math.round(Number(n));
        if (!Number.isFinite(v)) return 0;
        if (v < 0) return 0;
        if (v > 255) return 255;
        return v;
      };
      const rgbToHex = (rgb) => {
        const r = clamp8(rgb?.r);
        const g = clamp8(rgb?.g);
        const b = clamp8(rgb?.b);
        const to2 = (x) => x.toString(16).padStart(2, "0");
        return `#${to2(r)}${to2(g)}${to2(b)}`;
      };
      const colorToHex = (value, fallback) => {
        const rgb = parseCssColorToRgb(value) || parseCssColorToRgb(fallback);
        return rgb ? rgbToHex(rgb) : "#000000";
      };
      const makeRowMenuButton = ({ label, icon, disabled, intent, onClick }) => React.createElement(
        "li",
        null,
        React.createElement(
          "button",
          {
            type: "button",
            className: `bp3-menu-item ${icon ? `bp3-icon-${icon}` : ""} ${intent ? `bp3-intent-${intent}` : ""}`.trim(),
            disabled: Boolean(disabled),
            role: "menuitem",
            onClick
          },
          React.createElement("div", { className: "bp3-fill" }, label)
        )
      );
      const renderStatusRowMenu = (k, label) => React.createElement(
        "div",
        { className: "ts-status-row-menu-wrap" },
        React.createElement("button", {
          type: "button",
          className: "bp3-button bp3-small bp3-minimal bp3-icon-more ts-status-row-menu-button",
          disabled: Boolean(workingKey),
          title: `Actions for ${label}`,
          "aria-label": `Actions for ${label}`,
          "aria-haspopup": "menu",
          "aria-expanded": openStatusMenuKey === k ? "true" : "false",
          onClick: (event) => {
            event.preventDefault();
            setOpenColorPopover(null);
            setOpenStatusMenuKey((prev) => prev === k ? null : k);
          }
        }),
        openStatusMenuKey === k ? React.createElement(
          "div",
          { className: "ts-status-row-menu bp3-popover" },
          React.createElement(
            "div",
            { className: "bp3-popover-content" },
            React.createElement(
              "ul",
              { className: "bp3-menu", role: "menu" },
              makeRowMenuButton({
                label: "Delete",
                icon: "trash",
                intent: "danger",
                disabled: order.length <= 1,
                onClick: () => void deleteStatusRow(k)
              })
            )
          )
        ) : null
      );
      const setColorDraftValue = (k, channel2, value) => {
        clearColorMessages(k);
        setDraftColors(k, { [channel2]: value });
      };
      const renderColorPopover = ({
        k,
        channel: channel2,
        label,
        draftValue,
        hexValue,
        fallbackValue,
        disabled
      }) => {
        const popoverKey = `${k}:${channel2}`;
        const isText = channel2 === "text";
        const isOpen = openColorPopover === popoverKey;
        return React.createElement(
          "div",
          { className: "ts-status-color-picker-wrap" },
          React.createElement(
            "button",
            {
              type: "button",
              className: "bp3-button bp3-small ts-status-color-swatch-button",
              disabled,
              title: label,
              "aria-label": label,
              "aria-haspopup": "dialog",
              "aria-expanded": isOpen ? "true" : "false",
              onClick: (event) => {
                event.preventDefault();
                setOpenStatusMenuKey(null);
                setOpenColorPopover((prev) => prev === popoverKey ? null : popoverKey);
              }
            },
            React.createElement("span", {
              className: "ts-status-color-swatch-dot",
              style: { backgroundColor: hexValue }
            }),
            React.createElement(
              "span",
              { className: "ts-status-color-swatch-label" },
              label
            )
          ),
          isOpen ? React.createElement(
            "div",
            { className: "ts-status-color-popover bp3-popover", role: "dialog" },
            React.createElement(
              "div",
              { className: "bp3-popover-content" },
              React.createElement(
                "div",
                { className: "ts-status-color-popover-inner" },
                React.createElement(
                  "div",
                  { className: "ts-status-color-popover-title" },
                  label
                ),
                React.createElement(
                  "div",
                  { className: "ts-status-color-preset-grid" },
                  ...STATUS_COLOR_PRESETS.map(
                    (preset) => React.createElement("button", {
                      key: preset.value,
                      type: "button",
                      className: "ts-status-color-preset",
                      style: { backgroundColor: preset.value },
                      title: preset.name,
                      "aria-label": `Use ${preset.name}`,
                      onClick: () => setColorDraftValue(k, channel2, preset.value)
                    })
                  )
                ),
                React.createElement(
                  "div",
                  { className: "ts-status-color-custom-row" },
                  React.createElement("input", {
                    type: "color",
                    className: "ts-status-native-color-input",
                    value: hexValue,
                    disabled,
                    onChange: (e) => setColorDraftValue(k, channel2, e.target.value),
                    "aria-label": `${label} native color picker`
                  }),
                  React.createElement("input", {
                    className: "bp3-input bp3-small ts-status-color-input",
                    value: draftValue,
                    disabled,
                    placeholder: isText ? "Optional text color" : fallbackValue || "#14b8a6",
                    onChange: (e) => setColorDraftValue(k, channel2, e.target.value),
                    "aria-label": `${label} color value`
                  })
                ),
                React.createElement(
                  "div",
                  { className: "ts-status-color-popover-actions" },
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      className: "bp3-button bp3-small bp3-minimal",
                      disabled,
                      onClick: () => setColorDraftValue(k, channel2, "")
                    },
                    isText ? "Clear Text" : "Clear Base"
                  )
                )
              )
            )
          ) : null
        );
      };
      const getColorControlState = (k) => {
        const saved = savedColorsByKey[k] || { base: "", text: "" };
        const draft = draftColorsByKey[k] || { base: "", text: "" };
        const savedBase = normalizeCssColorValue(saved.base);
        const savedText = normalizeCssColorValue(saved.text);
        const draftBase = normalizeCssColorValue(draft.base);
        const draftText = normalizeCssColorValue(draft.text);
        const dirty = savedBase !== draftBase || savedText !== draftText;
        const validation = dirty ? validateColorEntry({ base: draftBase, text: draftText }) : null;
        const effectiveDefault = getDefaultStatusColor(k);
        const baseSwatchSource = draftBase || effectiveDefault;
        const textSwatchSource = draftText || draftBase || effectiveDefault;
        const previewValues = deriveStatusPillColorValues(
          k,
          { base: draftBase, text: draftText },
          resolveStatusSurfaces()
        );
        const previewStyle = {
          "--ts-status-bg-light": previewValues.lightBackgroundCss,
          "--ts-status-fg-light": previewValues.lightTextCss,
          "--ts-status-border-light": previewValues.lightBorderCss,
          "--ts-status-bg-dark": previewValues.darkBackgroundCss,
          "--ts-status-fg-dark": previewValues.darkTextCss,
          "--ts-status-border-dark": previewValues.darkBorderCss
        };
        return {
          savedBase,
          savedText,
          draftBase,
          draftText,
          dirty,
          validation,
          error: validation || colorErrorByKey[k],
          info: colorInfoByKey[k],
          isWorking: workingColorKey === k || workingColorKey === "__ALL__",
          hasSavedOverride: Boolean(savedBase || savedText),
          baseSwatchSource,
          baseHex: colorToHex(baseSwatchSource, "#000000"),
          textHex: colorToHex(textSwatchSource, baseSwatchSource || "#000000"),
          previewStyle
        };
      };
      const renderInlineColorControls = (k, state) => React.createElement(
        React.Fragment,
        null,
        React.createElement(
          "div",
          { className: "ts-status-inline-colors" },
          renderColorPopover({
            k,
            channel: "base",
            label: "Base",
            draftValue: state.draftBase,
            hexValue: state.baseHex,
            fallbackValue: "#14b8a6",
            disabled: state.isWorking
          }),
          renderColorPopover({
            k,
            channel: "text",
            label: "Text",
            draftValue: state.draftText,
            hexValue: state.textHex,
            fallbackValue: state.baseSwatchSource || "#000000",
            disabled: state.isWorking
          })
        ),
        state.dirty ? React.createElement(
          "div",
          { className: "bp3-button-group ts-status-inline-color-actions" },
          React.createElement(
            "button",
            {
              type: "button",
              className: "bp3-button bp3-small bp3-intent-primary bp3-icon-tick ts-status-color-commit-button",
              disabled: state.isWorking || Boolean(state.validation),
              title: "Apply color changes",
              "aria-label": "Apply color changes",
              onClick: () => applyColors(k, {
                base: state.draftBase,
                text: state.draftText
              })
            }
          ),
          React.createElement(
            "button",
            {
              type: "button",
              className: "bp3-button bp3-small bp3-minimal bp3-icon-cross ts-status-color-commit-button",
              disabled: state.isWorking,
              title: "Revert color changes",
              "aria-label": "Revert color changes",
              onClick: () => {
                clearColorMessages(k);
                setDraftColorsByKey((prev) => ({
                  ...prev,
                  [k]: { base: state.savedBase, text: state.savedText }
                }));
              }
            }
          )
        ) : state.hasSavedOverride ? React.createElement(
          "button",
          {
            type: "button",
            className: "bp3-button bp3-small bp3-minimal ts-status-inline-color-actions",
            disabled: state.isWorking,
            onClick: () => applyColors(k, { base: "", text: "" })
          },
          "Clear"
        ) : null,
        state.isWorking && workingColorKey === k ? React.createElement(
          "span",
          { className: "bp3-text-small", style: { opacity: 0.7 } },
          "Working..."
        ) : null
      );
      const addStatusRow = React.createElement(
        "div",
        { className: "ts-status-add-row", key: "add-status" },
        React.createElement(
          "div",
          { className: "ts-status-row-main" },
          React.createElement("span", {
            className: "ts-status-add-spacer",
            "aria-hidden": "true"
          }),
          React.createElement("input", {
            className: "bp3-input bp3-small ts-status-name-input",
            value: newStatusName,
            disabled: Boolean(workingKey),
            placeholder: "New status name",
            onChange: (e) => {
              setNewStatusName(e.target.value);
              setNewStatusError(null);
              setNewStatusInfo(null);
            },
            onKeyDown: (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addStatusFromDraft();
              }
            },
            "aria-label": "New status name"
          }),
          React.createElement(
            "button",
            {
              type: "button",
              className: "bp3-button bp3-small bp3-intent-primary",
              disabled: Boolean(workingKey) || !normalizeStatusName(newStatusName),
              onClick: () => addStatusFromDraft()
            },
            "Add Status"
          ),
          newStatusError ? React.createElement(
            "span",
            { className: "bp3-text-small ts-status-row-error" },
            newStatusError
          ) : null,
          !newStatusError && newStatusInfo ? React.createElement(
            "span",
            { className: "bp3-text-small ts-status-row-info" },
            newStatusInfo
          ) : null
        )
      );
      return React.createElement(
        "div",
        { className: "ts-status-names-panel", ref: rootRef },
        React.createElement(
          "div",
          { className: "bp3-card ts-status-names-card" },
          React.createElement(
            "div",
            { className: "ts-status-names-header" },
            React.createElement(
              "h3",
              { className: "bp3-heading ts-status-names-title" },
              "Statuses"
            ),
            React.createElement(
              "div",
              { className: "bp3-text-small ts-status-names-subtitle" },
              "Drag to reorder. Rename inline."
            ),
            React.createElement(
              "div",
              { className: "ts-status-colors-toolbar ts-status-inline-colors-toolbar" },
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "bp3-button bp3-small bp3-minimal",
                  disabled: workingColorKey != null,
                  onClick: () => resetAllColors()
                },
                "Reset colors"
              ),
              colorErrorByKey["__ALL__"] ? React.createElement(
                "span",
                { className: "bp3-text-small ts-status-colors-toolbar-error" },
                colorErrorByKey["__ALL__"]
              ) : null,
              !colorErrorByKey["__ALL__"] && colorInfoByKey["__ALL__"] ? React.createElement(
                "span",
                { className: "bp3-text-small ts-status-colors-toolbar-info" },
                colorInfoByKey["__ALL__"]
              ) : null
            )
          ),
          React.createElement(
            "div",
            { className: "ts-status-names-list" },
            ...order.flatMap((k) => {
              const saved = savedByKey[k] ?? "";
              const draft = draftByKey[k] ?? "";
              const dirty = normalizeStatusName(draft) !== normalizeStatusName(saved);
              const validation = dirty ? validateNewStatusName(draft, k) : null;
              const showPrompt = dirty && !validation && !workingKey;
              const prompt = showPrompt ? React.createElement(
                "div",
                { className: "ts-rename-prompt" },
                React.createElement(
                  "span",
                  { className: "bp3-text-small ts-rename-prompt-label" },
                  "Rename tag page?"
                ),
                React.createElement(
                  "div",
                  { className: "bp3-button-group" },
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      className: "bp3-button bp3-small bp3-intent-primary",
                      onClick: () => apply(k, true)
                    },
                    "Yes"
                  ),
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      className: "bp3-button bp3-small",
                      onClick: () => apply(k, false)
                    },
                    "No"
                  )
                )
              ) : null;
              const error = validation || errorByKey[k];
              const info = infoByKey[k];
              const colorState = getColorControlState(k);
              const rowError = error || colorState.error;
              const rowInfo = info || colorState.info;
              const rowLabel = saved || STATUSES?.[k]?.label || k;
              const rowClasses = [
                "ts-status-row",
                "ts-status-edit-row",
                dragState.key === k ? "ts-status-row-dragging" : "",
                dragState.targetKey === k && dragState.placement ? `ts-status-row-drop-${dragState.placement}` : ""
              ].filter(Boolean).join(" ");
              const row = React.createElement(
                "div",
                {
                  key: `row-${k}`,
                  className: rowClasses,
                  onDragOver: (event) => onStatusDragOver(event, k),
                  onDrop: (event) => onStatusDrop(event, k),
                  onDragLeave: () => {
                    if (dragState.targetKey === k) {
                      setDragState((prev) => ({
                        ...prev,
                        targetKey: null,
                        placement: null
                      }));
                    }
                  }
                },
                React.createElement(
                  "div",
                  { className: "ts-status-row-main" },
                  React.createElement("button", {
                    type: "button",
                    className: "bp3-button bp3-small bp3-minimal bp3-icon-drag-handle-vertical ts-status-drag-handle",
                    disabled: Boolean(workingKey),
                    draggable: !workingKey,
                    title: `Drag ${rowLabel} to reorder`,
                    "aria-label": `Drag ${rowLabel} to reorder`,
                    onDragStart: (event) => onStatusDragStart(event, k),
                    onDragEnd: onStatusDragEnd
                  }),
                  React.createElement("input", {
                    className: "bp3-input bp3-small ts-status-name-input",
                    value: draft,
                    disabled: Boolean(workingKey),
                    onChange: (e) => {
                      clearMessages(k);
                      setDraft(k, e.target.value);
                    },
                    "aria-label": `Status name for ${k}`
                  }),
                  React.createElement(
                    "span",
                    { className: "ts-status-pill-surface ts-status-row-preview" },
                    React.createElement(
                      "span",
                      {
                        className: "ts-status-pill-preview",
                        title: k,
                        "data-task-status-key": k,
                        style: colorState.previewStyle
                      },
                      draft || rowLabel
                    )
                  ),
                  renderInlineColorControls(k, colorState),
                  renderStatusRowMenu(k, rowLabel),
                  prompt,
                  workingKey === k ? React.createElement(
                    "span",
                    { className: "bp3-text-small", style: { opacity: 0.7 } },
                    "Working..."
                  ) : null
                ),
                rowError ? React.createElement(
                  "div",
                  { className: "bp3-text-small ts-status-row-error" },
                  rowError
                ) : null,
                !rowError && rowInfo ? React.createElement(
                  "div",
                  { className: "bp3-text-small ts-status-row-info" },
                  rowInfo
                ) : null
              );
              return [row];
            }),
            addStatusRow
          )
        )
      );
    };
    const panelConfig = {
      tabTitle: "Task Status Tags",
      settings: [
        {
          id: SETTINGS_KEYS.styleNativeCheckboxes,
          name: "Style native checkboxes by task status",
          description: "Adds an accessible color-and-shape treatment to the exact TODO/DONE checkbox. This is cosmetic and never changes completion or Better Tasks data.",
          action: {
            type: "switch",
            onChange: (value) => setCheckboxStylingEnabled(value)
          }
        },
        {
          id: SETTINGS_KEYS.statusLabelDisplay,
          name: "Status label display",
          description: "Checkbox-only keeps the queryable task-status tag in the block but hides its exact rendered pill after the checkbox is safely styled. Hover or focus the checkbox to reveal the status control.",
          action: {
            type: "select",
            items: Object.values(STATUS_LABEL_DISPLAY),
            onChange: (value) => setStatusLabelDisplay(value)
          }
        },
        {
          id: SETTINGS_KEYS.alertBeacon,
          name: "Animate Alert status",
          description: "Adds a brief two-beat attention halo to exact unchecked Alert tasks, then stays quiet. This is cosmetic, writes no task data, and automatically stays still for reduced-motion, forced-colors, and print.",
          action: {
            type: "switch",
            onChange: (value) => setAlertBeaconEnabled(value)
          }
        },
        {
          id: "task-status-status-names",
          name: "",
          description: "",
          action: { type: "reactComponent", component: StatusNamesPanel }
        },
        {
          id: "task-status-help",
          name: "Help",
          description: "Stores a queryable workflow label as a task-status/<Name> tag after TODO/DONE. In checkbox-only mode, hover or focus the checkbox to reveal it; Enter or Alt+Down opens the chooser, Space remains native completion, and Shift+click removes.",
          action: {
            type: "button",
            content: "Print Help",
            onClick: () => {
              const exampleKey = CONFIG.cycleOrder[0];
              const exampleTagTitle = STATUSES?.[exampleKey]?.tagTitle || `${STATUS_TAG_PREFIX}${DEFAULT_STATUS_NAMES[exampleKey] || "Active"}`;
              console.log("[TaskStatus] Usage:");
              console.log(
                `  - Format: {{[[TODO]]}} #[[${exampleTagTitle}]] Task text`
              );
              console.log("  - Click status tag: choose status");
              console.log("  - Shift+click status tag: remove status");
              console.log("  - Checkbox-only mode: hover/focus checkbox to reveal status");
              console.log("  - Enter or Alt+Down: choose status; Space: native completion");
              console.log("  - Command palette: 'Task Status: ...'");
            }
          }
        }
      ]
    };
    await extensionAPI.settings.panel.create(panelConfig);
  }
  async function init(isActive = () => true) {
    portalRoot = document.createElement("div");
    portalRoot.className = "ts-status-portal";
    portalRoot.setAttribute("data-task-status-portal", "true");
    document.body.appendChild(portalRoot);
    await registerSettingsPanel();
    if (!isActive()) return false;
    statusPeekController = createStatusPeekController({
      document,
      window,
      portalRoot,
      resolveContext: resolveStatusPeekContext,
      onOpen: (context) => openStatusChooser(context),
      onRemove: (context) => setStatusForTargets(context.blockUid, null),
      onAnchorInvalid: () => closeStatusChooser(),
      onError: (error) => log("Status peek error:", error)
    });
    statusPeekController.start();
    statusPeekController.setEnabled(isStatusPeekEnabled());
    clearStatusColorOverrides();
    applyStatusColorOverrides(statusColorOverrides);
    if (!isActive()) return false;
    startThemeObserver();
    await registerAllCommands();
    if (!isActive()) {
      await cleanup();
      return false;
    }
    startStatusPillObserver();
    window.addEventListener("mousedown", handleStatusMouseDown, true);
    window.addEventListener("touchstart", handleStatusTouchStart, TOUCH_LISTENER_OPTIONS);
    window.addEventListener("click", handleStatusClick, true);
    console.log("[TaskStatus] Loaded. Statuses:", CONFIG.cycleOrder.join(", "));
    return true;
  }
  async function cleanup() {
    clearOwnedStatusPillPresentations(document);
    closeStatusChooser();
    statusPeekController?.destroy?.();
    statusPeekController = null;
    stopStatusPillObserver();
    stopThemeObserver();
    clearStatusColorOverrides();
    if (portalRoot?.remove) portalRoot.remove();
    portalRoot = null;
    window.removeEventListener("mousedown", handleStatusMouseDown, true);
    window.removeEventListener("touchstart", handleStatusTouchStart, TOUCH_LISTENER_OPTIONS);
    window.removeEventListener("click", handleStatusClick, true);
    pendingOperations.clear();
    await unregisterAllCommands();
    console.log("[TaskStatus] Unloaded.");
  }
  return { init, cleanup };
}
var activeLifecycle = null;
async function onload({ extensionAPI, extension }) {
  if (!extensionAPI) throw new TypeError("Roam did not provide extensionAPI");
  if (activeLifecycle) await activeLifecycle.dispose();
  const previousRuntime = window[GLOBAL_KEY];
  if (previousRuntime && typeof previousRuntime.dispose === "function") {
    await previousRuntime.dispose();
  }
  const lifecycle = createLifecycle();
  const instance = createTaskStatusExtension({ extensionAPI });
  const runtime = Object.freeze({
    version: resolveTaskStatusRuntimeVersion(extension?.version),
    dispose: () => lifecycle.dispose()
  });
  activeLifecycle = lifecycle;
  window[GLOBAL_KEY] = runtime;
  lifecycle.add(async () => {
    await instance.cleanup();
    if (window[GLOBAL_KEY] === runtime) delete window[GLOBAL_KEY];
    if (activeLifecycle === lifecycle) activeLifecycle = null;
  });
  try {
    const initialized = await instance.init(
      () => window[GLOBAL_KEY] === runtime && !lifecycle.disposed
    );
    if (initialized) console.info(`[TaskStatus] Runtime v${runtime.version}`);
  } catch (error) {
    await lifecycle.dispose().catch((cleanupError) => console.error(cleanupError));
    throw error;
  }
  return () => lifecycle.dispose();
}
async function onunload() {
  const lifecycle = activeLifecycle;
  activeLifecycle = null;
  if (lifecycle) await lifecycle.dispose();
}
var extension_default = { onload, onunload };
export {
  createTaskStatusTextHelpers,
  extension_default as default,
  onload,
  onunload,
  resolveTaskStatusRuntimeVersion,
  resolveTaskStatusTargetUids
};
