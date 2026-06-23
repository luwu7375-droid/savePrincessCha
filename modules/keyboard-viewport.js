// modules/keyboard-viewport.js
// Handles keyboard / viewport CSS custom properties only.
// Must NOT call showPage, switch tabs, open chat, or focus messageInput on mobile.
// Refs (messageInput, chatSearchInput) are passed in via initKeyboardViewportState options.

(function () {
  "use strict";

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

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", scheduleCapture);
      window.visualViewport.addEventListener("scroll", scheduleCapture);
    }
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
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", scheduleUpdate);
      window.visualViewport.addEventListener("scroll", scheduleUpdate);
    } else {
      window.addEventListener("resize", scheduleUpdate);
    }
  }

  // ── Keyboard viewport state ──────────────────────���───────────────────────────
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
      if (window.visualViewport) {
        const ol = window.visualViewport.offsetLeft;
        if (ol !== 0) console.debug("[kb] visualViewport.offsetLeft =", ol);
      }
      window.scrollTo({ left: 0, top: 0, behavior: "auto" });
      document.documentElement.scrollLeft = 0;
      document.documentElement.scrollTop  = 0;
      document.body.scrollLeft = 0;
      document.body.scrollTop  = 0;
      if (document.scrollingElement) {
        document.scrollingElement.scrollLeft = 0;
      }
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
          if (document.activeElement === opts.messageInput) {
            const mode = opts.getChatInputMode ? opts.getChatInputMode() : null;
            if (mode !== "emojiSearch" && opts.setChatInputMode) {
              opts.setChatInputMode("keyboard");
            }
            if (opts.maintainBottomAnchor) opts.maintainBottomAnchor("keyboard");
          }
          if (opts.onKeyboardOpen) opts.onKeyboardOpen(inset);
        }
      });
    };

    window.visualViewport.addEventListener("resize", updateKeyboardState);
    window.visualViewport.addEventListener("scroll", updateKeyboardState);

    if (opts.messageInput) {
      opts.messageInput.addEventListener("focus", () => {
        updateKeyboardState();
        if (opts.maintainBottomAnchor) opts.maintainBottomAnchor("keyboard");
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
