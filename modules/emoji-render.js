// ── modules/emoji-render.js ───────────────────────────────────────────────────
// Emoji token parsing, message rendering, render cache, image preload.
// Exposes: window.SPEmojiRender.*
// Depends on: modules/emoji-catalog.js (window.SPEmoji.emojiCatalog, resolveEmojiToken)

(function () {
  "use strict";

  // ── Render cache constants ────────────────────────────────────────────────
  const EMOJI_RENDER_CACHE_KEY         = "emoji_render_cache_v1";
  const EMOJI_RENDER_CACHE_VERSION     = 1;
  const EMOJI_RENDER_CACHE_MAX_ENTRIES = 500;
  const EMOJI_IMAGE_CACHE_NAME         = "custom_emoji_images_v1";

  // ── Helpers ───────────────────────────────────────────────────────────────

  function hashString(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
    }
    return (h >>> 0).toString(36);
  }

  // ── Render cache ──────────────────────────────────────────────────────────

  let _emojiRenderCache = null;

  function _loadRenderCache() {
    if (_emojiRenderCache !== null) return;
    try {
      const raw = localStorage.getItem(EMOJI_RENDER_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const cleaned = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v && v.version === EMOJI_RENDER_CACHE_VERSION) cleaned[k] = v;
      }
      _emojiRenderCache = cleaned;
    } catch (_) {
      _emojiRenderCache = {};
    }
  }

  function _saveRenderCache() {
    if (!_emojiRenderCache) return;
    try {
      const entries = Object.entries(_emojiRenderCache);
      if (entries.length > EMOJI_RENDER_CACHE_MAX_ENTRIES) {
        entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
        _emojiRenderCache = Object.fromEntries(entries.slice(0, EMOJI_RENDER_CACHE_MAX_ENTRIES));
      }
      localStorage.setItem(EMOJI_RENDER_CACHE_KEY, JSON.stringify(_emojiRenderCache));
    } catch (_) {}
  }

  function _renderCacheKey(messageId, contentHash) {
    return `${messageId}:${contentHash}`;
  }

  function getRenderCacheTokens(messageId, contentHash) {
    if (!messageId) return null;
    _loadRenderCache();
    const key = _renderCacheKey(messageId, contentHash);
    return _emojiRenderCache[key]?.tokens ?? null;
  }

  function setRenderCacheTokens(messageId, contentHash, tokens) {
    if (!messageId) return;
    _loadRenderCache();
    const key = _renderCacheKey(messageId, contentHash);
    _emojiRenderCache[key] = {
      messageId,
      contentHash,
      tokens,
      updatedAt: Date.now(),
      version: EMOJI_RENDER_CACHE_VERSION,
    };
    _saveRenderCache();
  }

  function invalidateRenderCache(messageId) {
    if (!messageId) return;
    _loadRenderCache();
    const prefix = `${messageId}:`;
    let changed = false;
    for (const k of Object.keys(_emojiRenderCache)) {
      if (k.startsWith(prefix)) {
        delete _emojiRenderCache[k];
        changed = true;
      }
    }
    if (changed) _saveRenderCache();
  }

  function migrateRenderCacheTempId(tempId, realId, contentHash) {
    if (!tempId || !realId) return;
    _loadRenderCache();
    const oldKey = _renderCacheKey(tempId, contentHash);
    const entry = _emojiRenderCache[oldKey];
    if (!entry) return;
    delete _emojiRenderCache[oldKey];
    const newKey = _renderCacheKey(realId, contentHash);
    _emojiRenderCache[newKey] = { ...entry, messageId: realId };
    _saveRenderCache();
  }

  // ── Image preload ─────────────────────────────────────────────────────────

  async function preloadCustomEmojiImage(url) {
    if (!url) return;
    try {
      if ("caches" in window) {
        const cache = await caches.open(EMOJI_IMAGE_CACHE_NAME);
        const existing = await cache.match(url);
        if (existing) return;
        const resp = await fetch(url, { mode: "cors", cache: "force-cache" });
        if (resp.ok) {
          await cache.put(url, resp);
        }
      } else {
        const img = new Image();
        img.src = url;
      }
    } catch (_) {}
  }

  function preloadTokenImages(tokens) {
    if (!tokens || !tokens.length) return;
    setTimeout(() => {
      for (const t of tokens) {
        preloadCustomEmojiImage(t.staticUrl || t.url);
      }
    }, 0);
  }

  function preloadVisibleMessageEmojis(messageList) {
    if (!messageList) return;
    const imgs = messageList.querySelectorAll(".message .custom-emoji");
    if (!imgs.length) return;
    setTimeout(() => {
      for (const img of imgs) {
        preloadCustomEmojiImage(img.src);
      }
    }, 0);
  }

  // ── Token parsing ─────────────────────────────────────────────────────────

  const EMOJI_TOKEN_RE = /:([a-zA-Z0-9_\-.]+):/g;

  function parseEmojiTokens(text) {
    const tokens = [];
    if (!text) return tokens;
    let lastIndex = 0;
    let match;
    EMOJI_TOKEN_RE.lastIndex = 0;
    while ((match = EMOJI_TOKEN_RE.exec(text)) !== null) {
      const [fullMatch] = match;
      const start = match.index;
      if (start > lastIndex) {
        tokens.push({ type: "text", value: text.slice(lastIndex, start) });
      }
      const emoji = window.SPEmoji.resolveEmojiToken(fullMatch);
      if (emoji) {
        tokens.push({
          type: "emoji",
          token: fullMatch,
          emojiId: emoji.id,
          shortcode: emoji.shortcode,
          url: emoji.url,
          staticUrl: emoji.staticUrl,
          alt: fullMatch,
        });
      } else {
        tokens.push({ type: "unknown", value: fullMatch });
      }
      lastIndex = start + fullMatch.length;
    }
    if (lastIndex < text.length) {
      tokens.push({ type: "text", value: text.slice(lastIndex) });
    }
    return tokens;
  }

  function buildFragmentFromTokens(tokens) {
    const frag = document.createDocumentFragment();
    for (const t of tokens) {
      if (t.type === "emoji") {
        const img = document.createElement("img");
        img.src = t.staticUrl || t.url;
        img.alt = t.alt || t.token;
        img.title = t.shortcode;
        img.className = "custom-emoji";
        img.loading = "lazy";
        frag.appendChild(img);
      } else {
        frag.appendChild(document.createTextNode(t.value));
      }
    }
    return frag;
  }

  function renderTextWithEmoji(text) {
    const frag = document.createDocumentFragment();
    const emojiCatalog = window.SPEmoji.emojiCatalog;
    if (!emojiCatalog.loaded || !text) {
      frag.appendChild(document.createTextNode(text || ""));
      return frag;
    }
    const tokens = parseEmojiTokens(text);
    return buildFragmentFromTokens(tokens);
  }

  function setMessageContent(el, text, opts) {
    opts = opts || {};
    const emojiCatalog = window.SPEmoji.emojiCatalog;
    const rawText = text || "";
    const contentHash = hashString(rawText);
    const cacheId = String(opts.messageId || opts.tempId || "");

    if (
      el.dataset.emojiRendered === "1" &&
      el.dataset.contentHash === contentHash
    ) {
      return;
    }

    // Preserve quote blocks (msg-quote-block) before clearing content
    const existingQuoteBlocks = Array.from(el.querySelectorAll(".msg-quote-block"));

    const cached = cacheId ? getRenderCacheTokens(cacheId, contentHash) : null;
    if (cached) {
      el.textContent = "";
      // Restore quote blocks first
      existingQuoteBlocks.forEach(block => el.appendChild(block));
      el.appendChild(buildFragmentFromTokens(cached));
      el.dataset.emojiRendered = "1";
      el.dataset.contentHash = contentHash;
      return;
    }

    if (!emojiCatalog.loaded) {
      el.textContent = rawText;
      // Restore quote blocks at the beginning
      existingQuoteBlocks.reverse().forEach(block => el.insertBefore(block, el.firstChild));
      el.dataset.emojiRendered = "0";
      el.dataset.contentHash = contentHash;
      if (cacheId) el.dataset.pendingEmojiId = cacheId;
      return;
    }

    const tokens = parseEmojiTokens(rawText);
    el.textContent = "";
    // Restore quote blocks first
    existingQuoteBlocks.forEach(block => el.appendChild(block));
    el.appendChild(buildFragmentFromTokens(tokens));
    el.dataset.emojiRendered = "1";
    el.dataset.contentHash = contentHash;

    if (cacheId && tokens.some(t => t.type === "emoji")) {
      setRenderCacheTokens(cacheId, contentHash, tokens);
      preloadTokenImages(tokens.filter(t => t.type === "emoji"));
    }
  }

  // Called by emoji-catalog.js after catalog loads
  function _hydratePendingMessageElements() {
    const messageList = document.getElementById("messageList");
    const pending = Array.from(
      messageList ? messageList.querySelectorAll(".message[data-emoji-rendered='0']") : []
    );
    if (!pending.length) return;
    for (const el of pending) {
      const rawText = el.textContent;
      const cacheId = el.dataset.pendingEmojiId || "";
      el.dataset.emojiRendered = "";
      el.dataset.contentHash = "";
      setMessageContent(el, rawText, { messageId: cacheId || undefined });
      delete el.dataset.pendingEmojiId;
    }
  }

  // ── Namespace export ──────────────────────────────────────────────────────
  window.SPEmojiRender = {
    hashString,
    parseEmojiTokens,
    buildFragmentFromTokens,
    renderTextWithEmoji,
    setMessageContent,
    _hydratePendingMessageElements,
    // render cache
    getRenderCacheTokens,
    setRenderCacheTokens,
    invalidateRenderCache,
    migrateRenderCacheTempId,
    // preload
    preloadCustomEmojiImage,
    preloadTokenImages,
    preloadVisibleMessageEmojis,
    // constants
    EMOJI_RENDER_CACHE_KEY,
    EMOJI_RENDER_CACHE_VERSION,
    EMOJI_RENDER_CACHE_MAX_ENTRIES,
  };

})();
