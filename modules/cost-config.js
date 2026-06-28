// modules/cost-config.js
// Frontend price table and model alias config for the cost dashboard.
// Keep prices in sync with supabase/functions/_shared/cost-calculator.ts

(function () {
  "use strict";

  window.SPCostConfig = {
    usd_to_cny: 7.2,

    // raw_model (or prefix) → { display, site, note }
    aliases: {
      // GPT family
      "gpt-4o-mini":       { display: "GPT-4o mini",      site: "55api",      note: "快速通用" },
      "gpt-4o":            { display: "GPT-4o",           site: "55api",      note: "通用旗舰" },
      // Gemini family
      "gemini-2.5-pro":    { display: "Gemini 2.5 Pro",   site: "55api",      note: "推理旗舰" },
      "gemini-2.5-flash":  { display: "Gemini 2.5 Flash", site: "55api",      note: "高速推理" },
      "gemini-2.0-flash":  { display: "Gemini 2.0 Flash", site: "55api",      note: "快速" },
      "gemini-flash":      { display: "Gemini Flash",     site: "55api",      note: "快速" },
      // Claude family
      "claude-opus-4":     { display: "Claude Opus 4",    site: "55api/fuka", note: "顶级旗舰" },
      "claude-sonnet-4":   { display: "Claude Sonnet 4",  site: "55api/fuka", note: "均衡旗舰" },
      "claude-3-7-sonnet": { display: "Claude 3.7 Sonnet",site: "55api/fuka", note: "扩展思考" },
      "claude-3-5-sonnet": { display: "Claude 3.5 Sonnet",site: "55api/fuka", note: "前代均衡" },
      "claude-3-haiku":    { display: "Claude 3 Haiku",   site: "55api/fuka", note: "轻量快速" },
      // TTS
      "eleven_flash_v2_5":      { display: "EL Flash 2.5",    site: "elevenlabs", note: "极速语音" },
      "eleven_multilingual_v2": { display: "EL Multilingual", site: "elevenlabs", note: "多语言" },
      "eleven_turbo_v2_5":      { display: "EL Turbo 2.5",    site: "elevenlabs", note: "快速语音" },
      "eleven_v3":              { display: "EL v3",           site: "elevenlabs", note: "高质量" },
      "speech-02-hd":           { display: "MiniMax HD",      site: "minimax",    note: "高质量语音" },
      "speech-02-turbo":        { display: "MiniMax Turbo",   site: "minimax",    note: "快速语音" },
    },

    // site → model-prefix → { in, out, cacheRead, cacheWrite } (¥/1M tokens)
    //                     or { perMChar } (¥/1M chars, for TTS)
    prices: {
      "55api": {
        "gpt-4o-mini":       { in: 1.08,  out: 4.32,  cacheRead: 0.54, cacheWrite: 0 },
        "gpt-4o":            { in: 18,    out: 72,    cacheRead: 9,    cacheWrite: 0 },
        "gemini-2.5-pro":    { in: 25.2,  out: 72,    cacheRead: 3.6,  cacheWrite: 0 },
        "gemini-2.5-flash":  { in: 1.8,   out: 5.4,   cacheRead: 0.9,  cacheWrite: 0 },
        "gemini-2.0-flash":  { in: 1.26,  out: 3.6,   cacheRead: 0,    cacheWrite: 0 },
        "gemini-flash":      { in: 1.26,  out: 3.6,   cacheRead: 0,    cacheWrite: 0 },
        "claude-opus-4":     { in: 108,   out: 540,   cacheRead: 10.8, cacheWrite: 27 },
        "claude-sonnet-4":   { in: 21.6,  out: 108,   cacheRead: 2.16, cacheWrite: 5.4 },
        "claude-3-7-sonnet": { in: 21.6,  out: 108,   cacheRead: 2.16, cacheWrite: 5.4 },
        "claude-3-5-sonnet": { in: 21.6,  out: 108,   cacheRead: 2.16, cacheWrite: 5.4 },
        "claude-3-haiku":    { in: 1.8,   out: 9,     cacheRead: 0.18, cacheWrite: 0.9 },
      },
      "fuka": {
        "claude-opus-4":     { in: 108,   out: 540,   cacheRead: 10.8, cacheWrite: 27 },
        "claude-sonnet-4":   { in: 21.6,  out: 108,   cacheRead: 2.16, cacheWrite: 5.4 },
        "claude-3-7-sonnet": { in: 21.6,  out: 108,   cacheRead: 2.16, cacheWrite: 5.4 },
        "claude-3-5-sonnet": { in: 21.6,  out: 108,   cacheRead: 2.16, cacheWrite: 5.4 },
        "claude-3-haiku":    { in: 1.8,   out: 9,     cacheRead: 0.18, cacheWrite: 0.9 },
        "gpt-4o-mini":       { in: 1.08,  out: 4.32,  cacheRead: 0.54, cacheWrite: 0 },
        "gpt-4o":            { in: 18,    out: 72,    cacheRead: 9,    cacheWrite: 0 },
        "gemini-2.5-flash":  { in: 1.8,   out: 5.4,   cacheRead: 0.9,  cacheWrite: 0 },
        "gemini-2.5-pro":    { in: 25.2,  out: 72,    cacheRead: 3.6,  cacheWrite: 0 },
      },
      "openrouter": {
        "anthropic/claude-opus-4":    { in: 108,  out: 540,  cacheRead: 10.8, cacheWrite: 27 },
        "anthropic/claude-sonnet-4":  { in: 21.6, out: 108,  cacheRead: 2.16, cacheWrite: 5.4 },
        "anthropic/claude-3-7-sonnet":{ in: 21.6, out: 108,  cacheRead: 2.16, cacheWrite: 5.4 },
        "anthropic/claude-3-5-sonnet":{ in: 21.6, out: 108,  cacheRead: 2.16, cacheWrite: 5.4 },
        "google/gemini-2.5-pro":      { in: 25.2, out: 72,   cacheRead: 3.6,  cacheWrite: 0 },
        "google/gemini-2.5-flash":    { in: 1.8,  out: 5.4,  cacheRead: 0.9,  cacheWrite: 0 },
        "openai/gpt-4o-mini":         { in: 1.08, out: 4.32, cacheRead: 0.54, cacheWrite: 0 },
        "openai/gpt-4o":              { in: 18,   out: 72,   cacheRead: 9,    cacheWrite: 0 },
      },
      "elevenlabs": {
        "eleven_flash_v2_5":      { perMChar: 7.2  },
        "eleven_multilingual_v2": { perMChar: 14.4 },
        "eleven_turbo_v2_5":      { perMChar: 7.2  },
        "eleven_v3":              { perMChar: 10.8 },
        "_default":               { perMChar: 7.2  },
      },
      "minimax": {
        "speech-02-hd":    { perMChar: 10.8 },
        "speech-02-turbo": { perMChar: 7.2  },
        "_default":        { perMChar: 7.2  },
      },
    },

    /** Look up display name for a raw model string. */
    getAlias(rawModel) {
      if (!rawModel) return null;
      const lower = rawModel.toLowerCase();
      let best = null, bestLen = 0;
      for (const [key, val] of Object.entries(this.aliases)) {
        if (lower.startsWith(key.toLowerCase()) && key.length > bestLen) {
          best = val;
          bestLen = key.length;
        }
      }
      return best;
    },

    /** Calculate cost in CNY from site + model + token counts. */
    calcCost(site, rawModel, inTokens, outTokens, cacheRead, cacheWrite) {
      const siteMap = this.prices[site];
      if (!siteMap) return 0;
      const lower = rawModel.toLowerCase();
      let price = null, bestLen = 0;
      for (const [key, val] of Object.entries(siteMap)) {
        if (key === "_default") continue;
        if (lower.startsWith(key.toLowerCase()) && key.length > bestLen) {
          price = val;
          bestLen = key.length;
        }
      }
      if (!price) price = siteMap["_default"] ?? null;
      if (!price) return 0;
      if ("perMChar" in price) {
        return (inTokens / 1_000_000) * price.perMChar;
      }
      return (
        (inTokens    / 1_000_000) * price.in +
        (outTokens   / 1_000_000) * price.out +
        (cacheRead   / 1_000_000) * (price.cacheRead  || 0) +
        (cacheWrite  / 1_000_000) * (price.cacheWrite || 0)
      );
    },
  };
})();
