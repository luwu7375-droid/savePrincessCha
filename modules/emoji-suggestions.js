// ── modules/emoji-suggestions.js ─────────────────────────────────────────────
// Shortcode autocomplete suggestion bar above the message input.
// Exposes: window.SPEmojiSuggestions.initEmojiSuggestionBar (called once on load)
// Depends on: emoji-catalog.js (window.SPEmoji.*), emoji-render.js is NOT needed here
//             app.js globals: messageInput

(function () {
  "use strict";

  function getActiveEmojiQuery(text, cursorIndex) {
    let colonPos = -1;
    for (let i = cursorIndex - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === ":") {
        colonPos = i;
        break;
      }
      if (!/[a-zA-Z0-9_\-.]/.test(ch)) break;
    }
    if (colonPos === -1) return null;

    const rawToken = text.slice(colonPos, cursorIndex);
    if (rawToken.length < 2) return null;
    if (text[cursorIndex] === ":") return null;

    const query = rawToken.slice(1);
    if (!/^[a-zA-Z0-9_\-.]*$/.test(query)) return null;

    return { active: true, query, rawToken, start: colonPos, end: cursorIndex };
  }

  function filterEmojiSuggestions(query, limit) {
    if (limit === undefined) limit = 24;
    const { emojiCatalog, EMOJI_LEXICON } = window.SPEmoji;
    if (!emojiCatalog.loaded || !query) return [];
    const q = query.toLowerCase();

    const exact = [];
    const prefix = [];
    const contains = [];
    const alias = [];
    const meta = [];
    const seen = new Set();

    const addUniq = (arr, emoji) => {
      if (!seen.has(emoji.id)) {
        seen.add(emoji.id);
        arr.push(emoji);
      }
    };

    for (const emoji of Object.values(emojiCatalog.byId)) {
      const sc = (emoji.shortcode || "").toLowerCase();
      const cat = (emoji.category || "").toLowerCase();
      if (sc === q) { addUniq(exact, emoji); continue; }
      if (sc.startsWith(q)) { addUniq(prefix, emoji); continue; }
      if (sc.includes(q)) { addUniq(contains, emoji); continue; }
      if ((emoji.aliases || []).some(a => a.toLowerCase().includes(q))) { addUniq(alias, emoji); continue; }
      if (cat.includes(q)) { addUniq(meta, emoji); continue; }
    }
    for (const entry of EMOJI_LEXICON) {
      if (seen.has(entry.emojiId)) continue;
      const meaning = (entry.meaning_zh || "").toLowerCase();
      if (meaning.includes(q)) {
        const emoji = emojiCatalog.byId[entry.emojiId];
        if (emoji) addUniq(meta, emoji);
      }
    }

    return [...exact, ...prefix, ...contains, ...alias, ...meta].slice(0, limit);
  }

  function replaceTokenInText(text, tokenStart, tokenEnd, replacement) {
    const newText = text.slice(0, tokenStart) + replacement + text.slice(tokenEnd);
    return { newText, newCursor: tokenStart + replacement.length };
  }

  function initEmojiSuggestionBar() {
    const inputEl = messageInput;
    const chatShell = document.querySelector(".chat-shell");
    if (!inputEl || !chatShell) return;

    const bar = document.createElement("div");
    bar.id = "emojiSuggestionBar";
    bar.className = "emoji-suggestion-bar";
    bar.setAttribute("aria-label", "表情联想");
    bar.setAttribute("role", "listbox");
    bar.hidden = true;

    const track = document.createElement("div");
    track.className = "emoji-suggestion-track";
    bar.appendChild(track);

    const inputBar = document.getElementById("chatForm");
    if (inputBar && inputBar.parentNode) {
      inputBar.parentNode.insertBefore(bar, inputBar);
    } else {
      chatShell.appendChild(bar);
    }

    let _activeSuggestions = [];
    let _highlightIndex = 0;
    let _activeQuery = null;

    // Minimum pointer travel (px) to treat a gesture as a drag instead of a tap.
    const SUGGESTION_DRAG_THRESHOLD = 8;
    // True while a pointer is down on the suggestion bar (tap or drag in progress).
    let isInteractingWithSuggestion = false;
    // Tracks the active pointer gesture: { emoji, startX, startY, dragging }
    let _suggestionPointerState = null;

    function hideSuggestions() {
      bar.hidden = true;
      _activeSuggestions = [];
      _activeQuery = null;
      track.innerHTML = "";
    }

    function renderSuggestions(emojis, queryInfo) {
      _activeSuggestions = emojis;
      _activeQuery = queryInfo;
      _highlightIndex = 0;
      track.innerHTML = "";

      if (!emojis.length) {
        hideSuggestions();
        return;
      }

      emojis.forEach((emoji, idx) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "emoji-suggestion-item";
        item.setAttribute("role", "option");
        item.dataset.idx = idx;
        item.setAttribute("aria-label", emoji.shortcode);

        const img = document.createElement("img");
        img.src = emoji.staticUrl || emoji.url;
        img.alt = emoji.shortcode;
        img.className = "emoji-suggestion-img";
        img.loading = "lazy";
        item.appendChild(img);

        const label = document.createElement("span");
        label.className = "emoji-suggestion-label";
        label.textContent = emoji.shortcode.length > 12
          ? emoji.shortcode.slice(0, 11) + "…"
          : emoji.shortcode;
        item.appendChild(label);

        // Tap-vs-drag: record start position on pointerdown, commit only on clean tap
        // (pointerup with movement below threshold). This lets the track scroll
        // horizontally without accidentally selecting an item.
        item.addEventListener("pointerdown", (e) => {
          isInteractingWithSuggestion = true;
          _suggestionPointerState = {
            emoji,
            startX: e.clientX,
            startY: e.clientY,
            dragging: false,
          };
        });
        item.addEventListener("pointermove", (e) => {
          if (!_suggestionPointerState) return;
          const dx = Math.abs(e.clientX - _suggestionPointerState.startX);
          const dy = Math.abs(e.clientY - _suggestionPointerState.startY);
          if (dx > SUGGESTION_DRAG_THRESHOLD || dy > SUGGESTION_DRAG_THRESHOLD) {
            _suggestionPointerState.dragging = true;
          }
        });
        item.addEventListener("pointerup", (e) => {
          if (!_suggestionPointerState) return;
          const { emoji: tappedEmoji, dragging } = _suggestionPointerState;
          _suggestionPointerState = null;
          if (!dragging) {
            // Clean tap — select the item.
            e.preventDefault();
            e.stopPropagation();
            commitSuggestion(tappedEmoji);
          }
          setTimeout(() => {
            isInteractingWithSuggestion = false;
          }, 120);
        });
        item.addEventListener("pointercancel", () => {
          _suggestionPointerState = null;
          setTimeout(() => {
            isInteractingWithSuggestion = false;
          }, 120);
        });
        track.appendChild(item);
      });

      setHighlight(0);
      bar.hidden = false;
      track.scrollLeft = 0;
    }

    function setHighlight(idx) {
      if (!_activeSuggestions.length) return;
      _highlightIndex = Math.max(0, Math.min(idx, _activeSuggestions.length - 1));
      Array.from(track.children).forEach((item, i) => {
        item.classList.toggle("emoji-suggestion-item--active", i === _highlightIndex);
      });
      const activeItem = track.children[_highlightIndex];
      if (activeItem) {
        activeItem.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }

    function commitSuggestion(emoji) {
      if (!_activeQuery) return;
      const token = window.SPEmoji.pickInsertToken(emoji);
      const { newText, newCursor } = replaceTokenInText(
        inputEl.value,
        _activeQuery.start,
        _activeQuery.end,
        token
      );
      inputEl.value = newText;
      inputEl.setSelectionRange(newCursor, newCursor);
      inputEl.focus();
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      window.SPEmoji.recordEmojiUsed(emoji.id);
      hideSuggestions();
    }

    function onInput() {
      const text = inputEl.value;
      const cursor = inputEl.selectionStart ?? text.length;
      const queryInfo = getActiveEmojiQuery(text, cursor);
      if (!queryInfo) {
        hideSuggestions();
        return;
      }
      if (!window.SPEmoji.emojiCatalog.loaded) {
        hideSuggestions();
        return;
      }
      const suggestions = filterEmojiSuggestions(queryInfo.query);
      renderSuggestions(suggestions, queryInfo);
    }

    inputEl.addEventListener("input", onInput);

    inputEl.addEventListener("keyup", (e) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        onInput();
      }
    });

    inputEl.addEventListener("keydown", (e) => {
      if (bar.hidden || !_activeSuggestions.length) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setHighlight(_highlightIndex + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setHighlight(_highlightIndex - 1);
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (_activeSuggestions.length) {
          e.preventDefault();
          commitSuggestion(_activeSuggestions[_highlightIndex]);
        }
      } else if (e.key === "Escape") {
        hideSuggestions();
      }
    });

    // Hide when input loses focus, but not while the user is interacting with the
    // suggestion bar (scrolling or mid-tap). The isInteractingWithSuggestion flag
    // is set on pointerdown and cleared 120 ms after pointerup/cancel, which is
    // safely longer than a blur event that fires synchronously on focus loss.
    inputEl.addEventListener("blur", () => {
      setTimeout(() => {
        if (isInteractingWithSuggestion) return;
        if (!bar.contains(document.activeElement)) {
          hideSuggestions();
        }
      }, 160);
    });

    document.addEventListener("click", (e) => {
      if (!bar.hidden && !bar.contains(e.target) && e.target !== inputEl) {
        hideSuggestions();
      }
    });
  }

  // ── Namespace export ──────────────────────────────────────────────────────
  window.SPEmojiSuggestions = {
    initEmojiSuggestionBar,
    getActiveEmojiQuery,
    filterEmojiSuggestions,
    replaceTokenInText,
  };

})();
