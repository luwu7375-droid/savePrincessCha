// modules/keyboard-viewport.js
// Handles keyboard / viewport CSS custom properties only.
// Must NOT call showPage, switch tabs, open chat, or focus messageInput on mobile.
// Refs (messageInput, chatSearchInput) are passed in via initKeyboardViewportState options.

(function () {
  "use strict";

  // ── Shared visualViewport dispatcher ─────────────────────────────────────────
  // All initX functions register their schedule fn here instead of binding their
  // own listeners. One listener pair handles all three, avoiding duplicate RAFs.
  const _vvSchedules = [];
  let _vvListenerBound = false;

  function _registerVVHandler(fn) {
    _vvSchedules.push(fn);
    if (!_vvListenerBound && window.visualViewport) {
      _vvListenerBound = true;
      const dispatch = () => _vvSchedules.forEach(f => f());
      window.visualViewport.addEventListener("resize", dispatch);
      window.visualViewport.addEventListener("scroll", dispatch);
    }
  }

  // ── Stable shell height ──────────────────────────────────────────────────────
  // --app-shell-h drives .layout height. Uses visualViewport.height when
  // available so iOS Safari browser-chrome is accounted for. Skips capture
  // while keyboard is open to avoid the shell jumping.
  function initStableShellHeight() {
    let rafPending = false;

    function capture() {
      const vv = window.visualViewport;
      // Skip if keyboard is open (text input focused and viewport shrunk)
      const active = document.activeElement;
      const isTextInput = active && (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable
      );
      const inset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      if (isTextInput && inset > 80) return;

      const h = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty("--app-shell-h", `${Math.round(h)}px`);
    }

    function scheduleCapture() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; capture(); });
    }

    capture();

    window.addEventListener("orientationchange", () => setTimeout(capture, 300));
    window.addEventListener("resize", () => {
      const shell = document.querySelector(".layout");
      if (shell && shell.classList.contains("keyboard-open")) return;
      scheduleCapture();
    });

    _registerVVHandler(scheduleCapture);
  }

  // ── Visual viewport vars ─────────────────────────────────────────────────────
  // --visual-vh tracks the real visible height (shrinks with keyboard).
  // --app-vh kept in sync for legacy callers.
  function initVisualVh() {
    let rafPending = false;
    function update() {
      rafPending = false;
      const height = window.visualViewport
        ? window.visualViewport.height
        : window.innerHeight;
      const px = `${height}px`;
      document.documentElement.style.setProperty("--visual-vh", px);
      document.documentElement.style.setProperty("--app-vh", px);
    }
    function scheduleUpdate() {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(update);
      }
    }
    update();
    _registerVVHandler(scheduleUpdate);
    // Fallback for browsers without visualViewport
    if (!window.visualViewport) {
      window.addEventListener("resize", scheduleUpdate);
    }
  }

  // ── Keyboard viewport state ───────────────────────────────────────────────────
  // Manages .layout.keyboard-open and --keyboard-inset.
  // opts.messageInput / opts.chatSearchInput: DOM refs (may be null/undefined).
  // opts.onKeyboardOpen(inset): callback when keyboard opens (for app.js hooks).
  // opts.onKeyboardClose(): callback when keyboard closes.
  // opts.getChatInputMode(): returns current _chatInputMode string.
  // opts.setChatInputMode(mode): sets _chatInputMode.
  // opts.maintainBottomAnchor(reason): scroll anchor hook.
  function initKeyboardViewportState(opts) {
    opts = opts || {};
    const shell = document.querySelector(".layout");
    if (!shell || !window.visualViewport) return;

    const clampViewportToOrigin = () => {
      // Only correct horizontal viewport offset (iOS Safari can shift viewport left
      // on input focus). Do NOT reset vertical scroll — it races with
      // messageList.scrollTo() and is always 0 on this app because html/body are
      // overflow:hidden.
      const needsHFix =
        window.scrollX !== 0 ||
        (window.visualViewport && window.visualViewport.offsetLeft !== 0);
      if (!needsHFix) return;
      if (window.visualViewport && window.visualViewport.offsetLeft !== 0) {
        console.debug("[kb] visualViewport.offsetLeft =", window.visualViewport.offsetLeft);
      }
      window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
      if (document.scrollingElement) document.scrollingElement.scrollLeft = 0;
    };

    const resetKeyboardState = () => {
      shell.classList.remove("keyboard-open");
      shell.style.setProperty("--keyboard-inset", "0px");
      if (opts.getChatInputMode && opts.getChatInputMode() === "keyboard") {
        if (opts.setChatInputMode) opts.setChatInputMode("plain");
      }
      requestAnimationFrame(clampViewportToOrigin);
      if (opts.onKeyboardClose) opts.onKeyboardClose();
    };

    const deferredReset = () => {
      setTimeout(() => {
        resetKeyboardState();
        setTimeout(() => {
          resetKeyboardState();
          requestAnimationFrame(clampViewportToOrigin);
        }, 180);
      }, 80);
    };

    let _kbRafPending = false;
    const updateKeyboardState = () => {
      if (_kbRafPending) return;
      _kbRafPending = true;
      requestAnimationFrame(() => {
        _kbRafPending = false;
        const viewport = window.visualViewport;
        const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        const activeInput =
          document.activeElement === opts.messageInput ||
          document.activeElement === opts.chatSearchInput;
        const keyboardOpen = inset > 80 && activeInput;
        shell.classList.toggle("keyboard-open", keyboardOpen);
        shell.style.setProperty("--keyboard-inset", keyboardOpen ? `${Math.round(inset)}px` : "0px");
        if (keyboardOpen) {
          clampViewportToOrigin();
          if (document.activeElement === opts.messageInput) {
            const mode = opts.getChatInputMode ? opts.getChatInputMode() : null;
            if (mode !== "emojiSearch" && opts.setChatInputMode) {
              opts.setChatInputMode("keyboard");
            }
            // 不在这里触发滚动 — CSS padding 自动处理偏移
          }
          if (opts.onKeyboardOpen) opts.onKeyboardOpen(inset);
        }
      });
    };

    _registerVVHandler(updateKeyboardState);

    if (opts.messageInput) {
      opts.messageInput.addEventListener("focus", () => {
        updateKeyboardState();
        // focus 时只更新状态，不滚动
      });
      opts.messageInput.addEventListener("blur", deferredReset);
    }

    if (opts.chatSearchInput) {
      opts.chatSearchInput.addEventListener("focus", updateKeyboardState);
      opts.chatSearchInput.addEventListener("blur", deferredReset);
    }

    updateKeyboardState();
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  window.SPKeyboardViewport = {
    initStableShellHeight,
    initVisualVh,
    initKeyboardViewportState,
  };
})();
