// utils/storage.js — Safe localStorage wrapper with JSON parse/stringify
// Handles parse errors gracefully and provides typed defaults.

/**
 * Get a JSON value from localStorage with a fallback default.
 * @param {string} key
 * @param {*} defaultValue — returned if key is missing or JSON parse fails
 * @returns {*}
 */
export function storageGetJSON(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

/**
 * Set a JSON value in localStorage.
 * @param {string} key
 * @param {*} value — will be JSON.stringify'd
 */
export function storageSetJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("[storage] Failed to write", key, err);
  }
}

/**
 * Remove a key from localStorage.
 * @param {string} key
 */
export function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}
