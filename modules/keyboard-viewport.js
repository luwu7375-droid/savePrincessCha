// modules/keyboard-viewport.js
// ── Unified keyboard / viewport model ────────────────────────────────────────
// Single source of truth for keyboard state. Exposes to CSS:
//   --kb            : keyboard height in px (0 when closed)
//   --visual-vh     : visualViewport height (legacy alias --app-vh kept)
//   --keyboard-inset: legacy alias of --kb
// and one class on .layout:
//   .keyboard-open  : present only while a CHAT input is focused AND keyboard up
//
// Rules (do not reintroduce old behaviour):
//  - NEVER resize .layout height on keyboard open. Shell stays full height.
//  - Composer is anchored above the keyboard via --kb only.
//  - ONE visualViewport listener pair, shared by all updates.
//  - Only chat inputs (messageInput / chatSearchInput) drive .keyboard-open;
//    other inputs (world-book, simulator, login) never shift the chat layout.

(function () {
  "use strict";

  const CHAT_INPUT_IDS = ["messageInput", "chatSearchInput"];
  const root = document.documentElement;

  let _opts = {};
  let _rafPending = false;

  function isChatInput(el) {
    return !!el && CHAT_INPUT_IDS.indexOf(el.id) !== -1;
  }

  // ── Diagnostic snapshot function ──────────────────────────────────────────────
  // Captures complete viewport state to diagnose iOS Safari left drift on input focus.
  // Call at key moments: before-focus, after-focus, vv-resize, vv-scroll, blur, blank-click
  function getViewportDriftSnapshot(reason = "unknown") {
    const vv = window.visualViewport;
    const layout = document.querySelector(".layout");
    const input = document.getElementById("messageInput");
    const inputBar = document.getElementById("chatForm");
    const scrollingEl = document.scrollingElement || document.documentElement;

    return {
      reason,
      ts: Date.now(),
      windowInnerWidth: window.innerWidth,
      documentClientWidth: document.documentElement.clientWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      scrollX: window.scrollX,
      scrollingLeft: scrollingEl?.scrollLeft ?? null,
      docScrollLeft: document.documentElement.scrollLeft,
      bodyScrollLeft: document.body.scrollLeft,
      visualViewport: vv ? {
        width: vv.width,
        height: vv.height,
        offsetLeft: vv.offsetLeft,
        offsetTop: vv.offsetTop,
        scale: vv.scale,
      } : null,
      layoutRect: layout ? (layout.getBoundingClientRect().toJSON?.() || {
        left: layout.getBoundingClientRect().left,
        right: layout.getBoundingClientRect().right,
        width: layout.getBoundingClientRect().width,
        top: layout.getBoundingClientRect().top,
      }) : null,
      inputBarRect: inputBar ? {
        left: inputBar.getBoundingClientRect().left,
        right: inputBar.getBoundingClientRect().right,
        width: inputBar.getBoundingClientRect().width,
      } : null,
      inputRect: input ? {
        left: input.getBoundingClientRect().left,
        right: input.getBoundingClientRect().right,
        width: input.getBoundingClientRect().width,
      } : null,
      activeElement: document.activeElement?.id || document.activeElement?.tagName,
    };
  }

  // Expose for manual console inspection
  window.__dumpViewportDrift = (reason = "manual") => {
    const snap = getViewportDriftSnapshot(reason);
    console.table(snap);
    console.info("[viewport-drift]", snap);
    return snap;
  };

  // ── Diagnostic: Complete horizontal alignment analysis ──────────────────────
  window.__debugHorizontalAlignment = () => {
    const vv = window.visualViewport;
    const layout = document.querySelector(".layout");
    const chatShell = document.querySelector(".chat-shell");
    const topBar = document.querySelector(".top-bar");
    const messageList = document.querySelector(".message-list");
    const inputBar = document.querySelector(".input-bar");

    if (!layout || !chatShell || !topBar || !messageList || !inputBar) {
      console.error("One or more elements not found");
      return;
    }

    const data = {
      visualViewport: {
        offsetLeft: vv?.offsetLeft ?? 0,
        offsetTop: vv?.offsetTop ?? 0,
        width: vv?.width ?? window.innerWidth,
        height: vv?.height ?? window.innerHeight,
        scale: vv?.scale ?? 1,
      },
      window: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      },
      layout: {
        left: Math.round(layout.getBoundingClientRect().left * 100) / 100,
        right: Math.round(layout.getBoundingClientRect().right * 100) / 100,
        width: Math.round(layout.getBoundingClientRect().width * 100) / 100,
        computedWidth: getComputedStyle(layout).width,
        transform: getComputedStyle(layout).transform,
        position: getComputedStyle(layout).position,
      },
      chatShell: {
        left: Math.round(chatShell.getBoundingClientRect().left * 100) / 100,
        right: Math.round(chatShell.getBoundingClientRect().right * 100) / 100,
        width: Math.round(chatShell.getBoundingClientRect().width * 100) / 100,
        computedWidth: getComputedStyle(chatShell).width,
      },
      topBar: {
        left: Math.round(topBar.getBoundingClientRect().left * 100) / 100,
        right: Math.round(topBar.getBoundingClientRect().right * 100) / 100,
        width: Math.round(topBar.getBoundingClientRect().width * 100) / 100,
        centerX: Math.round((topBar.getBoundingClientRect().left + topBar.getBoundingClientRect().right) / 2 * 100) / 100,
      },
      messageList: {
        left: Math.round(messageList.getBoundingClientRect().left * 100) / 100,
        right: Math.round(messageList.getBoundingClientRect().right * 100) / 100,
        width: Math.round(messageList.getBoundingClientRect().width * 100) / 100,
        centerX: Math.round((messageList.getBoundingClientRect().left + messageList.getBoundingClientRect().right) / 2 * 100) / 100,
      },
      inputBar: {
        left: Math.round(inputBar.getBoundingClientRect().left * 100) / 100,
        right: Math.round(inputBar.getBoundingClientRect().right * 100) / 100,
        width: Math.round(inputBar.getBoundingClientRect().width * 100) / 100,
        centerX: Math.round((inputBar.getBoundingClientRect().left + inputBar.getBoundingClientRect().right) / 2 * 100) / 100,
        marginLeft: getComputedStyle(inputBar).marginLeft,
        marginRight: getComputedStyle(inputBar).marginRight,
        computedWidth: getComputedStyle(inputBar).width,
        maxWidth: getComputedStyle(inputBar).maxWidth,
        position: getComputedStyle(inputBar).position,
      },
    };

    const topBarCenter = (topBar.getBoundingClientRect().left + topBar.getBoundingClientRect().right) / 2;
    const inputBarCenter = (inputBar.getBoundingClientRect().left + inputBar.getBoundingClientRect().right) / 2;
    const centerOffset = Math.round((inputBarCenter - topBarCenter) * 100) / 100;

    console.group("🔍 Horizontal Alignment Debug");
    console.table(data);
    console.warn(`⚠️  Center offset: ${centerOffset}px (inputBar - topBar)`);
    if (Math.abs(centerOffset) > 1) {
      console.error(`❌ Horizontal misalignment detected: ${centerOffset}px`);
    } else {
      console.log("✅ Elements are horizontally aligned");
    }
    console.groupEnd();

    return { data, centerOffset };
  };


  function currentInset() {
    const vv = window.visualViewport;
    if (!vv) return 0;
    return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  }

  // ── Single update pass ─────────────────────────────────────────────────────
  function apply() {
    _rafPending = false;
    const vv = window.visualViewport;
    const vh = vv ? vv.height : window.innerHeight;
    const inset = currentInset();
    const active = document.activeElement;
    const chatFocused = isChatInput(active);
    const keyboardOpen = inset > 80 && chatFocused;

    root.style.setProperty("--visual-vh", `${Math.round(vh)}px`);
    root.style.setProperty("--app-vh", `${Math.round(vh)}px`);
    root.style.setProperty("--kb", keyboardOpen ? `${Math.round(inset)}px` : "0px");
    root.style.setProperty("--keyboard-inset", keyboardOpen ? `${Math.round(inset)}px` : "0px");

    const shell = document.querySelector(".layout");
    if (shell) shell.classList.toggle("keyboard-open", keyboardOpen);

    // Pin horizontal viewport (iOS can drift left on focus/blur).
    pinHorizontal();

    if (keyboardOpen && active === _opts.messageInput) {
      const mode = _opts.getChatInputMode ? _opts.getChatInputMode() : null;
      if (mode !== "emojiSearch" && _opts.setChatInputMode) {
        _opts.setChatInputMode("keyboard");
      }
      if (_opts.onKeyboardOpen) _opts.onKeyboardOpen(inset);
    }
  }

  // ── Horizontal viewport drift reset ────────────────────────────────────────
  // iOS Safari can shift the page left when a focused input scrolls into view,
  // and sometimes fails to restore it after the keyboard closes (the page sits
  // a few % to the left). Force every horizontal scroll offset back to 0.
  // Also clear any inline style drift on .layout itself.
  function resetHorizontalViewportDrift(reason = "unknown") {
    const vv = window.visualViewport;
    const scrollingEl = document.scrollingElement || document.documentElement;
    const layout = document.querySelector(".layout");
    const offsetLeft = vv?.offsetLeft || 0;

    // 1. Clear browser horizontal scroll (ONLY if non-zero to avoid unnecessary ops)
    if (window.scrollX !== 0) {
      window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
    }
    if (scrollingEl && scrollingEl.scrollLeft !== 0) scrollingEl.scrollLeft = 0;
    if (document.documentElement.scrollLeft !== 0) document.documentElement.scrollLeft = 0;
    if (document.body.scrollLeft !== 0) document.body.scrollLeft = 0;

    // 2. Clear any residual inline horizontal styles on .layout
    if (layout) {
      layout.style.left = "";
      layout.style.right = "";
      layout.style.marginLeft = "";
      layout.style.marginRight = "";
      // Remove translateX from inline transform if present (but preserve other transforms)
      const inlineTransform = layout.style.transform || "";
      if (/translateX|translate3d\(/.test(inlineTransform)) {
        layout.style.transform = "";
      }
    }

    // 3. Record visualViewport offsetLeft for potential CSS compensation
    root.style.setProperty("--vv-offset-left", `${Math.round(offsetLeft)}px`);

    // 4. Force recheck next frame (only if there's actual drift)
    if (window.scrollX !== 0 || offsetLeft !== 0) {
      requestAnimationFrame(() => {
        if (window.scrollX !== 0) window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
        if (scrollingEl && scrollingEl.scrollLeft !== 0) scrollingEl.scrollLeft = 0;
        if (document.documentElement.scrollLeft !== 0) document.documentElement.scrollLeft = 0;
        if (document.body.scrollLeft !== 0) document.body.scrollLeft = 0;
      });
    }

    if (window.DEBUG_LAYOUT) {
      console.info("[viewport] reset horizontal drift", {
        reason,
        scrollX: window.scrollX,
        vvOffsetLeft: offsetLeft,
        docScrollLeft: document.documentElement.scrollLeft,
        bodyScrollLeft: document.body.scrollLeft,
        innerWidth: window.innerWidth,
        docClientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
      });
    }
  }

  // Legacy alias for compatibility
  function pinHorizontal() {
    resetHorizontalViewportDrift("pin");
  }

  // ── Reset with delayed sequence ────────────────────────────────────────────
  // iOS viewport restoration is async and can take several hundred ms.
  // Call reset multiple times to catch the drift at different phases.
  function resetHorizontalSoon(reason) {
    resetHorizontalViewportDrift(reason);
    [50, 150, 300, 600].forEach((t) => {
      setTimeout(() => resetHorizontalViewportDrift(`${reason}:${t}`), t);
    });
  }

  // ── Reset during focus with tighter sequence ───────────────────────────────
  // Focus triggers immediate drift. Use aggressive sequence to catch it early.
  function resetHorizontalDuringFocus(reason) {
    resetHorizontalViewportDrift(reason);
    [16, 50, 100, 180, 300, 500, 800].forEach((t) => {
      setTimeout(() => resetHorizontalViewportDrift(`${reason}:${t}`), t);
    });
  }

  function schedule() {
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(apply);
  }

  // ── Shell height: lock to full visual height; never capture while kb open ──
  function captureShellHeight() {
    const vv = window.visualViewport;
    if (currentInset() > 80) return;
    const h = vv ? vv.height : window.innerHeight;
    root.style.setProperty("--app-shell-h", `${Math.round(h)}px`);
  }

  // ── Public init (same names app.js already calls) ──────────────────────────
  function initStableShellHeight() {
    captureShellHeight();
    window.addEventListener("orientationchange", () => setTimeout(captureShellHeight, 300));
    window.addEventListener("resize", captureShellHeight);
  }

  function initVisualVh() {
    schedule();
  }

  function initKeyboardViewportState(opts) {
    _opts = opts || {};
    const shell = document.querySelector(".layout");
    if (!shell || !window.visualViewport) return;

    const vv = window.visualViewport;
    vv.addEventListener("resize", () => {
      console.info("[viewport-drift vv resize]", getViewportDriftSnapshot("vv-resize"));
      schedule();
      // If chat input is focused during resize, also reset horizontal drift
      const active = document.activeElement;
      if (isChatInput(active)) {
        resetHorizontalViewportDrift("resize-while-focused");
      }
    });
    vv.addEventListener("scroll", () => {
      console.info("[viewport-drift vv scroll]", getViewportDriftSnapshot("vv-scroll"));
      schedule();
      // If chat input is focused during scroll, also reset horizontal drift
      const active = document.activeElement;
      if (isChatInput(active)) {
        resetHorizontalViewportDrift("scroll-while-focused");
      }
    });

    const reset = () => {
      // Re-evaluate state and re-pin horizontally at several moments, because
      // iOS restores the viewport over a few hundred ms after blur.
      resetHorizontalSoon("blur");
      schedule();
    };

    if (_opts.messageInput) {
      _opts.messageInput.addEventListener("focus", () => {
        // DIAGNOSTIC: Capture state before any action
        console.info("[viewport-drift before focus]", getViewportDriftSnapshot("before-focus"));

        // Reset horizontal drift IMMEDIATELY on focus, before keyboard animates
        resetHorizontalDuringFocus("messageInput-focus");
        schedule();

        // DIAGNOSTIC: Capture state after reset (async to catch post-layout)
        setTimeout(() => {
          console.info("[viewport-drift after focus]", getViewportDriftSnapshot("after-focus"));
        }, 0);
      });
      _opts.messageInput.addEventListener("blur", () => {
        console.info("[viewport-drift blur]", getViewportDriftSnapshot("blur"));
        if (_opts.getChatInputMode && _opts.getChatInputMode() === "keyboard") {
          if (_opts.setChatInputMode) _opts.setChatInputMode("plain");
        }
        if (_opts.onKeyboardClose) _opts.onKeyboardClose();
        reset();
      });
    }
    if (_opts.chatSearchInput) {
      _opts.chatSearchInput.addEventListener("focus", () => {
        resetHorizontalDuringFocus("chatSearchInput-focus");
        schedule();
      });
      _opts.chatSearchInput.addEventListener("blur", reset);
    }

    // Safety net: any time the window regains focus or page is shown, re-pin.
    window.addEventListener("focus", () => resetHorizontalSoon("window-focus"));
    window.addEventListener("pageshow", () => resetHorizontalSoon("pageshow"));
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        resetHorizontalSoon("visibility-visible");
      }
    });
    window.addEventListener("orientationchange", () => {
      setTimeout(() => resetHorizontalSoon("orientationchange"), 300);
    });

    schedule();
  }

  window.SPKeyboardViewport = {
    initStableShellHeight,
    initVisualVh,
    initKeyboardViewportState,
    resetHorizontalViewportDrift,
    resetHorizontalSoon,
    resetHorizontalDuringFocus,
  };
})();
