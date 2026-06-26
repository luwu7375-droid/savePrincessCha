// utils/ui.js — Shared UI interaction helpers.

/**
 * Show a toast notification overlay.
 * @param {string} message — text to display
 * @param {number} duration — ms before auto-dismiss (default 2000)
 */
export function showToast(message, duration = 2000) {
  const toast = document.createElement('div');
  toast.className = 'sp-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    z-index: 10000;
    font-size: 14px;
    pointer-events: none;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

/**
 * Scroll container to bottom.
 * @param {HTMLElement} container
 */
export function scrollToBottom(container) {
  if (!container) return;
  container.scrollTop = container.scrollHeight;
}

/**
 * Show an element by removing 'hidden' class.
 * @param {HTMLElement|null} el
 */
export function show(el) {
  el?.classList.remove("hidden");
}

/**
 * Hide an element by adding 'hidden' class.
 * @param {HTMLElement|null} el
 */
export function hide(el) {
  el?.classList.add("hidden");
}
