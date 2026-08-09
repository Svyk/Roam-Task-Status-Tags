import {
  ALERT_BEACON_ATTRIBUTE,
  CHECKBOX_STATUS_ATTRIBUTE,
  OWNED_CHECKBOX_SELECTOR,
} from "./status-checkbox.js";

export const STATUS_PEEK_CLASS = "ts-status-peek";
export const STATUS_PEEK_HELP_ID = "ts-status-checkbox-help";

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
  return String(element?.getAttribute?.(name) || "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function appendAttributeToken(element, name, token) {
  const ownedToken = String(token || "").trim();
  if (!element?.setAttribute || !ownedToken) return false;
  const next = [...new Set([...attributeTokens(element, name), ownedToken])];
  element.setAttribute(name, next.join(" "));
  return true;
}

export function removeAttributeToken(element, name, token) {
  const ownedToken = String(token || "").trim();
  if (!element?.removeAttribute || !ownedToken) return false;
  const next = attributeTokens(element, name).filter((item) => item !== ownedToken);
  if (next.length) element.setAttribute(name, next.join(" "));
  else element.removeAttribute(name);
  return true;
}

export function resolveOwnedStatusCheckbox(target) {
  const checkbox = target?.closest?.(OWNED_CHECKBOX_SELECTOR) || null;
  if (!checkbox) return null;
  if (checkbox.isConnected === false) return null;

  const statusKey = checkbox.getAttribute?.(CHECKBOX_STATUS_ATTRIBUTE);
  const input = checkbox.querySelector?.('input[type="checkbox"]') || null;
  const checkmark = checkbox.querySelector?.(".checkmark") || null;
  if (!statusKey || !input || !checkmark) return null;

  return Object.freeze({ checkbox, input, checkmark, statusKey });
}

export function isStatusChooserKey(event) {
  if (!event || event.ctrlKey || event.metaKey) return false;
  if (
    event.key === "Enter" &&
    !event.altKey &&
    !event.shiftKey
  ) {
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

/**
 * One delegated controller for every owned checkbox render. It never installs
 * listeners on Roam's checkbox nodes and never handles ordinary click or Space,
 * leaving completion semantics entirely host-owned.
 */
export function createStatusPeekController({
  document: documentLike,
  window: windowLike,
  portalRoot,
  resolveContext,
  onOpen,
  onRemove,
  onAnchorInvalid = () => {},
  onError = () => {},
  showDelay = 210,
  hideDelay = 120,
  alertBeaconEnabled: initialAlertBeaconEnabled = false,
} = {}) {
  if (!documentLike?.createElement || !portalRoot?.appendChild) {
    throw new TypeError("Status peek requires a document and portal root");
  }

  const eventRoot = documentLike;
  const setTimer = windowLike?.setTimeout?.bind(windowLike) || setTimeout;
  const clearTimer = windowLike?.clearTimeout?.bind(windowLike) || clearTimeout;
  const requestFrame =
    windowLike?.requestAnimationFrame?.bind(windowLike) || ((callback) => setTimer(callback, 0));

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
  let alertBeaconEnabled = Boolean(initialAlertBeaconEnabled);

  function syncAlertBeacon(button, context) {
    if (!button?.removeAttribute) return;
    const shouldBeacon =
      alertBeaconEnabled &&
      context?.statusKey === "ALERT" &&
      context?.input?.checked === false;
    if (shouldBeacon) button.setAttribute(ALERT_BEACON_ATTRIBUTE, "true");
    else button.removeAttribute(ALERT_BEACON_ATTRIBUTE);
  }

  function report(error) {
    try {
      onError(error);
    } catch (_) {}
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
    helperEl.textContent =
      "Workflow status. Press Enter or Alt plus Down Arrow to choose a status. Press Space to complete or reopen the task.";
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
      returnFocusEl: freshOwned.input,
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
      const top = opensBelow
        ? Math.min(below, Math.max(margin, viewportHeight - height - margin))
        : above;

      button.classList?.toggle?.("ts-status-peek-below", opensBelow);
      button.style.left = `${Math.round(left)}px`;
      button.style.top = `${Math.round(top)}px`;
      button.style.visibility = "visible";
    };

    // Establish a valid position immediately, even when animation frames are
    // throttled in a background tab, then refine after the next paint.
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
        isIntentCurrent: () =>
          chooserOpen &&
          activationRevision === activationId &&
          activeContext?.checkbox === fresh.checkbox &&
          activeContext?.statusKey === fresh.statusKey &&
          activeContext?.blockUid === fresh.blockUid,
      });
    }
    try {
      const result = remove
        ? await onRemove?.(intentContext)
        : await onOpen?.(intentContext);
      if (!remove && result === false) hide();
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
    syncAlertBeacon(button, context);

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
      syncAlertBeacon(peekButton, context);
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
    ["mousedown", handleOutsideMouseDown],
  ];

  const viewportListeners = [
    ["resize", handleViewportChange],
    ["scroll", handleViewportChange],
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

  function setAlertBeaconEnabled(nextEnabled) {
    alertBeaconEnabled = Boolean(nextEnabled);
    if (peekButton && activeContext) syncAlertBeacon(peekButton, activeContext);
  }

  function syncNativeCheckboxState(input) {
    if (!peekButton || !activeContext || activeContext.input !== input) return false;
    syncAlertBeacon(peekButton, activeContext);
    return true;
  }

  function refresh() {
    if (!activeContext) return;
    if (!enabled) {
      hide();
      return;
    }
    if (chooserOpen) {
      const fresh = resolveFreshContext(activeContext);
      if (
        !fresh ||
        fresh.statusKey !== activeContext.statusKey ||
        fresh.blockUid !== activeContext.blockUid
      ) {
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
    setAlertBeaconEnabled,
    syncNativeCheckboxState,
    isEnabled: () => enabled,
    isVisible: () => Boolean(peekButton?.isConnected),
  });
}
