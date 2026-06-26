// supabase/functions/_shared/response-helpers.ts — Shared response builders.

import { corsHeaders } from "./cors.ts";

/**
 * Return a JSON response with CORS headers.
 * @param body — value to JSON.stringify
 * @param status — HTTP status code (default 200)
 * @param extraHeaders — additional headers to merge
 */
export function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

/**
 * Return an error JSON response.
 * @param message — error message
 * @param status — HTTP status code (default 400)
 */
export function jsonError(
  message: string,
  status = 400,
  extraHeaders: Record<string, string> = {},
): Response {
  return json({ error: message }, status, extraHeaders);
}
