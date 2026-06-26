// utils/index.js — Re-exports for convenient access.
// Usage (ES modules): import { escapeHtml, formatMsgTime } from "./utils/index.js";
// Usage (script tags): These are loaded individually via <script> tags until
// the project migrates to a bundler.

export { escapeHtml } from "./html.js";
export {
  parseDbTime, getZonedParts, zonedDayKey,
  formatMsgTime, formatConvTime, formatStatusTime,
  mcFormatDateTime, mcSafeDate, formatTime,
  formatDate, formatRelativeTime,
} from "./datetime.js";
export { storageGetJSON, storageSetJSON, storageRemove } from "./storage.js";
export { getAuthHeaders } from "./auth.js";
export { showToast, scrollToBottom, show, hide } from "./ui.js";
