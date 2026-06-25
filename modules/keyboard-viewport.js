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

    // 1. Clear browser horizontal scroll
    if (window.scrollX !== 0) {
      window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
    }
    if (scrollingEl) scrollingEl.scrollLeft = 0;
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;

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
    root.style.setProperty("--vv-offset-left", `${Math.round(vv?.offsetLeft || 0)}px`);

    // 4. Force recheck next frame
    requestAnimationFrame(() => {
      if (window.scrollX !== 0) window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
      if (scrollingEl) scrollingEl.scrollLeft = 0;
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
    });

    if (window.DEBUG_LAYOUT) {
      console.info("[viewport] reset horizontal drift", {
        reason,
        scrollX: window.scrollX,
        vvOffsetLeft: vv?.offsetLeft ?? null,
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
      schedule();
      // If chat input is focused during resize, also reset horizontal drift
      const active = document.activeElement;
      if (isChatInput(active)) {
        resetHorizontalViewportDrift("resize-while-focused");
      }
    });
    vv.addEventListener("scroll", () => {
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
        // Reset horizontal drift IMMEDIATELY on focus, before keyboard animates
        resetHorizontalDuringFocus("messageInput-focus");
        schedule();
      });
      _opts.messageInput.addEventListener("blur", () => {
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
