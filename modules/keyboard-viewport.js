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

    // Pin horizontal viewport (iOS can drift left on focus).
    if (window.scrollX !== 0 || (vv && vv.offsetLeft !== 0)) {
      window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
    }

    if (keyboardOpen && active === _opts.messageInput) {
      const mode = _opts.getChatInputMode ? _opts.getChatInputMode() : null;
      if (mode !== "emojiSearch" && _opts.setChatInputMode) {
        _opts.setChatInputMode("keyboard");
      }
      if (_opts.onKeyboardOpen) _opts.onKeyboardOpen(inset);
    }
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
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);

    const reset = () => {
      setTimeout(schedule, 60);
      setTimeout(schedule, 250);
    };

    if (_opts.messageInput) {
      _opts.messageInput.addEventListener("focus", schedule);
      _opts.messageInput.addEventListener("blur", () => {
        if (_opts.getChatInputMode && _opts.getChatInputMode() === "keyboard") {
          if (_opts.setChatInputMode) _opts.setChatInputMode("plain");
        }
        if (_opts.onKeyboardClose) _opts.onKeyboardClose();
        reset();
      });
    }
    if (_opts.chatSearchInput) {
      _opts.chatSearchInput.addEventListener("focus", schedule);
      _opts.chatSearchInput.addEventListener("blur", reset);
    }

    schedule();
  }

  window.SPKeyboardViewport = {
    initStableShellHeight,
    initVisualVh,
    initKeyboardViewportState,
  };
})();
