// utils/html.js — Shared HTML escaping utility
// Single source of truth: object-map approach handles null/undefined safely.

/**
 * Escape HTML special characters to prevent XSS.
 * @param {*} value — any value; coerced to string, null/undefined become "".
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]);
}
