// _shared/cost-calculator.ts
// Hard-coded price table for cost_log writing from Edge Functions.
// Prices in ¥CNY per 1M tokens (or per 1M chars for TTS).
// Keep in sync with modules/cost-config.js on the frontend.

export const USD_TO_CNY = 7.2;

// Prices: { in, out, cacheRead, cacheWrite } per 1M tokens, in CNY
// cacheRead / cacheWrite default to 0 if not applicable
interface TokenPrice {
  in: number;
  out: number;
  cacheRead: number;
  cacheWrite: number;
}

// TTS prices per 1M characters, in CNY
interface CharPrice {
  perMChar: number;
}

type ModelPrice = TokenPrice | CharPrice;

function isCharPrice(p: ModelPrice): p is CharPrice {
  return "perMChar" in p;
}

// site → model-prefix → price
// For model matching we check if the raw_model starts with a key (longest match wins)
const PRICE_TABLE: Record<string, Record<string, ModelPrice>> = {
  // ── 55api / fiftyfive (OpenAI-compatible proxy) ──────────────────────────
  "55api": {
    // GPT-4o family
    "gpt-4o-mini":      { in: 1.08, out: 4.32,  cacheRead: 0.54, cacheWrite: 0 },
    "gpt-4o":           { in: 18,   out: 72,     cacheRead: 9,    cacheWrite: 0 },
    // Gemini 2.x Flash / Pro
    "gemini-2.5-pro":   { in: 25.2, out: 72,     cacheRead: 3.6,  cacheWrite: 0 },
    "gemini-2.5-flash": { in: 1.8,  out: 5.4,    cacheRead: 0.9,  cacheWrite: 0 },
    "gemini-2.0-flash": { in: 1.26, out: 3.6,    cacheRead: 0,    cacheWrite: 0 },
    "gemini-flash":     { in: 1.26, out: 3.6,    cacheRead: 0,    cacheWrite: 0 },
    // Claude Sonnet / Haiku / Opus
    "claude-opus-4":    { in: 108,  out: 540,    cacheRead: 10.8, cacheWrite: 27 },
    "claude-sonnet-4":  { in: 21.6, out: 108,    cacheRead: 2.16, cacheWrite: 5.4 },
    "claude-3-7-sonnet":{ in: 21.6, out: 108,    cacheRead: 2.16, cacheWrite: 5.4 },
    "claude-3-5-sonnet":{ in: 21.6, out: 108,    cacheRead: 2.16, cacheWrite: 5.4 },
    "claude-3-haiku":   { in: 1.8,  out: 9,      cacheRead: 0.18, cacheWrite: 0.9 },
  },
  // ── fuka (OpenAI-compatible Chinese proxy) ───────────────────────────────
  "fuka": {
    "claude-opus-4":    { in: 108,  out: 540,    cacheRead: 10.8, cacheWrite: 27 },
    "claude-sonnet-4":  { in: 21.6, out: 108,    cacheRead: 2.16, cacheWrite: 5.4 },
    "claude-3-7-sonnet":{ in: 21.6, out: 108,    cacheRead: 2.16, cacheWrite: 5.4 },
    "claude-3-5-sonnet":{ in: 21.6, out: 108,    cacheRead: 2.16, cacheWrite: 5.4 },
    "claude-3-haiku":   { in: 1.8,  out: 9,      cacheRead: 0.18, cacheWrite: 0.9 },
    "gpt-4o-mini":      { in: 1.08, out: 4.32,   cacheRead: 0.54, cacheWrite: 0 },
    "gpt-4o":           { in: 18,   out: 72,      cacheRead: 9,    cacheWrite: 0 },
    "gemini-2.5-flash": { in: 1.8,  out: 5.4,    cacheRead: 0.9,  cacheWrite: 0 },
    "gemini-2.5-pro":   { in: 25.2, out: 72,     cacheRead: 3.6,  cacheWrite: 0 },
  },
  // ── openrouter ────────────────────────────────────────────────────────────
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
  // ── TTS providers ─────────────────────────────────────────────────────────
  "elevenlabs": {
    "eleven_flash_v2_5": { perMChar: 7.2  },
    "eleven_multilingual_v2": { perMChar: 14.4 },
    "eleven_turbo_v2_5": { perMChar: 7.2  },
    // default fallback for any elevenlabs model
    "_default": { perMChar: 7.2 },
  },
  "minimax": {
    "speech-02-hd":    { perMChar: 10.8 },
    "speech-02-turbo": { perMChar: 7.2  },
    "_default":        { perMChar: 7.2  },
  },
};

/** Find best-match price entry for a given site + model string.
 *  Tries longest prefix match within the site's price map.
 *  Falls back to "_default" if available, then returns null. */
function findPrice(site: string, rawModel: string): ModelPrice | null {
  const siteMap = PRICE_TABLE[site];
  if (!siteMap) return null;

  const model = rawModel.toLowerCase();
  let bestKey = "";
  let bestPrice: ModelPrice | null = null;

  for (const key of Object.keys(siteMap)) {
    if (key === "_default") continue;
    if (model.startsWith(key.toLowerCase()) && key.length > bestKey.length) {
      bestKey = key;
      bestPrice = siteMap[key];
    }
  }

  return bestPrice ?? (siteMap["_default"] ?? null);
}

export function calculateCostCny(
  site: string,
  rawModel: string,
  inTokens: number,
  outTokens: number,
  cacheRead: number,
  cacheWrite: number,
): number {
  const price = findPrice(site, rawModel);
  if (!price) return 0;

  if (isCharPrice(price)) {
    // chars-billed (TTS): caller passes char count in inTokens
    return (inTokens / 1_000_000) * price.perMChar;
  }

  const cost =
    (inTokens    / 1_000_000) * price.in +
    (outTokens   / 1_000_000) * price.out +
    (cacheRead   / 1_000_000) * price.cacheRead +
    (cacheWrite  / 1_000_000) * price.cacheWrite;
  return cost;
}

export function calculateTtsCostCny(site: string, model: string, chars: number): number {
  const price = findPrice(site, model);
  if (!price || !isCharPrice(price)) return 0;
  return (chars / 1_000_000) * price.perMChar;
}
