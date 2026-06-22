// ── modules/emoji-catalog.js ──────────────────────────────────────────────────
// Emoji pack sources, adapters, catalog state and loading logic.
// Exposes: window.SPEmoji.emojiCatalog, window.SPEmoji.loadEmojiCatalog,
//          window.SPEmoji.resolveEmojiToken, window.SPEmoji.filterEmojis,
//          window.SPEmoji.buildEmojiGuide, window.SPEmoji.pickInsertToken,
//          window.SPEmoji.isShortcodeUnique, window.SPEmoji.getLexiconMap
// Depends on: modules/emoji-lexicon.js (window.SPEmoji.EMOJI_LEXICON)

(function () {
  "use strict";

  // ── Cache / storage keys ──────────────────────────────────────────────────
  const EMOJI_PACK_CONFIG_KEY   = "emoji_pack_sources_v1";
  const EMOJI_CATALOG_CACHE_KEY = "emoji_catalog_cache_v1";
  const EMOJI_RECENT_KEY        = "emoji_recent_v1";
  const EMOJI_FREQUENCY_KEY     = "emoji_frequency_v1";
  const EMOJI_FAVORITE_KEY      = "emoji_favorite_v1";

  // Default pack source definitions
  const EMOJI_PACK_SOURCES_DEFAULT = [
    {
      id: "stelpolva",
      name: "stelpolva.moe",
      type: "mastodon",
      enabled: true,
      sourceUrl: "https://stelpolva.moe",
      apiUrl: "https://stelpolva.moe/api/v1/custom_emojis",
      priority: 10,
    },
  ];

  // Adapter registry: type -> loader function (populated after function declarations)
  // eslint-disable-next-line prefer-const
  let emojiSourceAdapters = {};

  // Live catalog state (rebuilt on load)
  const emojiCatalog = {
    byId:             {},  // id -> emoji
    byShortcode:      {},  // shortcode -> emoji[]   (may be ambiguous)
    byCanonicalToken: {},  // canonicalToken -> emoji
    byAlias:          {},  // alias -> emoji
    byCategory:       {},  // category -> emoji[]
    byPackId:         {},  // packId -> emoji[]
    loaded: false,
    loadError: null,
  };

  // ── Mastodon adapter ──────────────────────────────────────────────────────

  async function loadMastodonEmojiPack(source) {
    const res = await fetch(source.apiUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${source.apiUrl}`);
    const raw = await res.json();
    if (!Array.isArray(raw)) throw new Error("Unexpected response shape from Mastodon API");
    return raw
      .filter(e => e.visible_in_picker !== false)
      .map(e => normalizeEmoji(source, e, "mastodon"));
  }

  async function loadManifestEmojiPack(source) {
    const url = source.manifestUrl;
    if (!url) throw new Error(`manifestUrl missing for pack "${source.id}"`);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const manifest = await res.json();
    if (!Array.isArray(manifest.emojis)) throw new Error("Manifest missing emojis array");
    return manifest.emojis.map(e => normalizeEmoji(source, e, "manifest"));
  }

  function normalizeEmoji(source, raw, sourceType) {
    const shortcode = raw.shortcode || raw.short_code || "";
    const url       = raw.url || "";
    const staticUrl = raw.static_url || raw.staticUrl || url;
    const category  = raw.category || "";

    const id             = `${source.id}:${shortcode}`;
    const token          = `:${shortcode}:`;
    const canonicalToken = `:${source.id}.${shortcode}:`;

    return {
      id,
      packId:          source.id,
      packName:        source.name,
      shortcode,
      token,
      canonicalToken,
      url,
      staticUrl,
      category,
      aliases:         [token, canonicalToken],
      visibleInPicker: raw.visible_in_picker !== false,
      sourceType,
      meaning_zh:  raw.meaning_zh  || null,
      mood_tags:   raw.mood_tags   || null,
      use_cases:   raw.use_cases   || null,
    };
  }

  emojiSourceAdapters.mastodon = loadMastodonEmojiPack;
  emojiSourceAdapters.manifest = loadManifestEmojiPack;

  // ── Catalog loading ───────────────────────────────────────────────────────

  async function loadEmojiCatalog() {
    let sources;
    try {
      const stored = localStorage.getItem(EMOJI_PACK_CONFIG_KEY);
      sources = stored ? JSON.parse(stored) : EMOJI_PACK_SOURCES_DEFAULT;
    } catch (_) {
      sources = EMOJI_PACK_SOURCES_DEFAULT;
    }
    const enabled = sources.filter(s => s.enabled);

    const allEmojis = [];
    let anySuccess = false;
    for (const source of enabled) {
      const adapter = emojiSourceAdapters[source.type];
      if (!adapter) {
        console.warn(`[emoji] No adapter for type "${source.type}" (pack "${source.id}")`);
        continue;
      }
      try {
        const emojis = await adapter(source);
        allEmojis.push(...emojis);
        anySuccess = true;
      } catch (err) {
        console.warn(`[emoji] Failed to load pack "${source.id}":`, err);
      }
    }

    if (!anySuccess) {
      try {
        const cached = JSON.parse(localStorage.getItem(EMOJI_CATALOG_CACHE_KEY) || "null");
        if (cached && Array.isArray(cached)) {
          buildCatalogIndexes(cached);
          emojiCatalog.loadError = "loaded from cache (sources failed)";
          return;
        }
      } catch (_) {}
      emojiCatalog.loadError = "all sources failed, no cache available";
      emojiCatalog.loaded = true;
      return;
    }

    buildCatalogIndexes(allEmojis);

    try {
      localStorage.setItem(EMOJI_CATALOG_CACHE_KEY, JSON.stringify(allEmojis));
    } catch (_) {}
  }

  function buildCatalogIndexes(emojis) {
    const byId             = {};
    const byShortcode      = {};
    const byCanonicalToken = {};
    const byAlias          = {};
    const byCategory       = {};
    const byPackId         = {};

    for (const e of emojis) {
      byId[e.id] = e;
      byCanonicalToken[e.canonicalToken] = e;

      if (!byShortcode[e.shortcode]) byShortcode[e.shortcode] = [];
      byShortcode[e.shortcode].push(e);

      for (const alias of (e.aliases || [])) {
        byAlias[alias] = e;
      }

      const cat = e.category || "_uncategorized";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(e);

      if (!byPackId[e.packId]) byPackId[e.packId] = [];
      byPackId[e.packId].push(e);
    }

    emojiCatalog.byId             = byId;
    emojiCatalog.byShortcode      = byShortcode;
    emojiCatalog.byCanonicalToken = byCanonicalToken;
    emojiCatalog.byAlias          = byAlias;
    emojiCatalog.byCategory       = byCategory;
    emojiCatalog.byPackId         = byPackId;
    emojiCatalog.loaded           = true;
    emojiCatalog.loadError        = null;

    // Hydrate any message elements that were rendered before the catalog was ready.
    if (window.SPEmojiRender && typeof window.SPEmojiRender._hydratePendingMessageElements === "function") {
      window.SPEmojiRender._hydratePendingMessageElements();
    }
  }

  // ── Token resolution ──────────────────────────────────────────────────────

  function resolveEmojiToken(token) {
    if (!token) return null;
    const fromCanon = emojiCatalog.byCanonicalToken[token];
    if (fromCanon) return fromCanon;
    const fromAlias = emojiCatalog.byAlias[token];
    if (fromAlias) return fromAlias;
    const sc = token.replace(/^:|:$/g, "");
    const matches = emojiCatalog.byShortcode[sc];
    if (matches && matches.length === 1) return matches[0];
    return null;
  }

  function isShortcodeUnique(shortcode) {
    const matches = emojiCatalog.byShortcode[shortcode];
    return Array.isArray(matches) && matches.length === 1;
  }

  function pickInsertToken(emoji) {
    return isShortcodeUnique(emoji.shortcode) ? emoji.token : emoji.canonicalToken;
  }

  // ── Lexicon map ───────────────────────────────────────────────────────────

  let _lexiconMap = null;
  function getLexiconMap() {
    if (!_lexiconMap) {
      _lexiconMap = Object.create(null);
      const EMOJI_LEXICON = window.SPEmoji.EMOJI_LEXICON;
      for (const entry of EMOJI_LEXICON) {
        _lexiconMap[entry.emojiId] = entry;
      }
    }
    return _lexiconMap;
  }

  // ── Filter ────────────────────────────────────────────────────────────────

  function filterEmojis(emojis, query) {
    if (!query) return emojis;
    const q = query.toLowerCase().replace(/^:|:$/g, "");
    const lmap = getLexiconMap();
    return emojis.filter(e => {
      if (e.shortcode.toLowerCase().includes(q)) return true;
      if (e.category && e.category.toLowerCase().includes(q)) return true;
      if (e.meaning_zh && e.meaning_zh.toLowerCase().includes(q)) return true;
      if (e.packName && e.packName.toLowerCase().includes(q)) return true;
      const lex = lmap[e.id];
      if (!lex) return false;
      if (lex.meaning_zh && lex.meaning_zh.toLowerCase().includes(q)) return true;
      if (lex.use_cases && lex.use_cases.some(u => u.toLowerCase().includes(q))) return true;
      if (lex.mood_tags && lex.mood_tags.some(t => t.toLowerCase().includes(q))) return true;
      return false;
    });
  }

  // ── Emoji guide for LLM ───────────────────────────────────────────────────

  function buildEmojiGuide() {
    if (!emojiCatalog.loaded || !Object.keys(emojiCatalog.byId).length) return "";

    const EMOJI_LEXICON = window.SPEmoji.EMOJI_LEXICON;
    const lines = [];
    for (const entry of EMOJI_LEXICON) {
      const emoji = emojiCatalog.byId[entry.emojiId];
      if (!emoji) continue;
      const token = pickInsertToken(emoji);
      lines.push(`${token} = ${entry.meaning_zh}`);
    }

    if (!lines.length) return "";

    return (
      "[可用自定义表情]\n" +
      "你可以在自然合适时使用这些短代码，它们会在聊天中显示为图片表情。" +
      "不要过度使用；一条回复最多 0-2 个。" +
      "不要机械复制用户刚刚使用的表情。\n\n" +
      lines.join("\n")
    );
  }

  // ── Usage tracking ────────────────────────────────────────────────────────

  function recordEmojiUsed(emojiId) {
    try {
      let recent = JSON.parse(localStorage.getItem(EMOJI_RECENT_KEY) || "[]");
      recent = [emojiId, ...recent.filter(id => id !== emojiId)].slice(0, 50);
      localStorage.setItem(EMOJI_RECENT_KEY, JSON.stringify(recent));
    } catch (_) {}

    try {
      const freq = JSON.parse(localStorage.getItem(EMOJI_FREQUENCY_KEY) || "{}");
      freq[emojiId] = (freq[emojiId] || 0) + 1;
      localStorage.setItem(EMOJI_FREQUENCY_KEY, JSON.stringify(freq));
    } catch (_) {}
  }

  function isFavorite(emojiId) {
    try {
      const favs = JSON.parse(localStorage.getItem(EMOJI_FAVORITE_KEY) || "[]");
      return favs.includes(emojiId);
    } catch (_) { return false; }
  }

  function toggleFavorite(emojiId) {
    try {
      let favs = JSON.parse(localStorage.getItem(EMOJI_FAVORITE_KEY) || "[]");
      if (favs.includes(emojiId)) {
        favs = favs.filter(id => id !== emojiId);
      } else {
        favs = [emojiId, ...favs];
      }
      localStorage.setItem(EMOJI_FAVORITE_KEY, JSON.stringify(favs));
    } catch (_) {}
  }

  // ── Namespace export ──────────────────────────────────────────────────────
  window.SPEmoji = window.SPEmoji || {};

  // State
  window.SPEmoji.emojiCatalog          = emojiCatalog;
  window.SPEmoji.emojiSourceAdapters   = emojiSourceAdapters;
  window.SPEmoji.EMOJI_PACK_SOURCES_DEFAULT = EMOJI_PACK_SOURCES_DEFAULT;
  window.SPEmoji.EMOJI_PACK_CONFIG_KEY      = EMOJI_PACK_CONFIG_KEY;
  window.SPEmoji.EMOJI_CATALOG_CACHE_KEY    = EMOJI_CATALOG_CACHE_KEY;
  window.SPEmoji.EMOJI_RECENT_KEY           = EMOJI_RECENT_KEY;
  window.SPEmoji.EMOJI_FREQUENCY_KEY        = EMOJI_FREQUENCY_KEY;
  window.SPEmoji.EMOJI_FAVORITE_KEY         = EMOJI_FAVORITE_KEY;

  // Functions
  window.SPEmoji.loadEmojiCatalog  = loadEmojiCatalog;
  window.SPEmoji.resolveEmojiToken = resolveEmojiToken;
  window.SPEmoji.isShortcodeUnique = isShortcodeUnique;
  window.SPEmoji.pickInsertToken   = pickInsertToken;
  window.SPEmoji.getLexiconMap     = getLexiconMap;
  window.SPEmoji.filterEmojis      = filterEmojis;
  window.SPEmoji.buildEmojiGuide   = buildEmojiGuide;
  window.SPEmoji.recordEmojiUsed   = recordEmojiUsed;
  window.SPEmoji.isFavorite        = isFavorite;
  window.SPEmoji.toggleFavorite    = toggleFavorite;

})();
