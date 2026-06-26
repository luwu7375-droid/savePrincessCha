// utils/auth.js — Unified Supabase authentication header retrieval.
// Single implementation used by app.js, phone.js, and any future modules.

/**
 * Get Supabase auth headers for Edge Function requests.
 * @returns {Promise<Record<string, string>>}
 */
export async function getAuthHeaders() {
  try {
    const sc = window.supabaseClient || null;
    if (!sc) return {};
    const { data: { session } } = await sc.auth.getSession();
    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
  } catch (err) {
    console.warn("[auth] Failed to get session:", err);
    return {};
  }
}
