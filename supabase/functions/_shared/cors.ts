// supabase/functions/_shared/cors.ts — Shared CORS configuration.
// Each function can extend the base headers for custom needs.

/**
 * Base CORS headers applied to all Edge Functions.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Create CORS headers with custom overrides.
 * @example
 * const headers = makeCorsHeaders({
 *   "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
 *   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-memory-admin-token",
 * });
 */
export function makeCorsHeaders(
  overrides: Record<string, string> = {},
): Record<string, string> {
  return { ...corsHeaders, ...overrides };
}

/**
 * Standard CORS preflight response.
 */
export function corsOptionsResponse(
  headers: Record<string, string> = corsHeaders,
): Response {
  return new Response("ok", { headers });
}
