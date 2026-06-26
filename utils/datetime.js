// utils/datetime.js — Shared date/time formatting utilities
// Consolidates 7 time-format functions into a unified module.

const APP_TIME_ZONE = "Asia/Shanghai";

/**
 * Parse DB timestamp string into Date object.
 * Handles UTC suffix and bare ISO strings (treated as UTC).
 */
export function parseDbTime(value) {
  if (!value) return null;
  const s = String(value);
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  return new Date(s + "Z");
}

/**
 * Get date parts in Asia/Shanghai timezone.
 */
export function getZonedParts(date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

/**
 * Get YYYY-MM-DD key in Asia/Shanghai timezone.
 */
export function zonedDayKey(date) {
  const p = getZonedParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Format message timestamp with relative and absolute display.
 * Used for chat bubble timestamps.
 */
export function formatMsgTime(iso) {
  const d = parseDbTime(iso);
  if (!d) return "";
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const p = getZonedParts(d);
  const todayKey = zonedDayKey(now);
  const yestKey = zonedDayKey(new Date(now - 86400000));
  const dKey = zonedDayKey(d);
  if (dKey === todayKey) return `今天 ${p.hour}:${p.minute}`;
  if (dKey === yestKey) return `昨天 ${p.hour}:${p.minute}`;
  const nowP = getZonedParts(now);
  if (p.year === nowP.year) return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/**
 * Format conversation list timestamp (shorter form).
 */
export function formatConvTime(iso) {
  const d = parseDbTime(iso);
  if (!d) return "";
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const p = getZonedParts(d);
  const todayKey = zonedDayKey(now);
  const yestKey = zonedDayKey(new Date(now - 86400000));
  const dKey = zonedDayKey(d);
  if (dKey === todayKey) return `今天 ${p.hour}:${p.minute}`;
  if (dKey === yestKey) return "昨天";
  const nowP = getZonedParts(now);
  if (p.year === nowP.year) return `${p.month}-${p.day}`;
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Format time as HH:MM (24h) in local timezone.
 * Used for status display.
 */
export function formatStatusTime(date) {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Format as "M月D日 HH:MM" for memory center.
 */
export function mcFormatDateTime(value) {
  const date = mcSafeDate(value);
  if (!date) return "暂无时间";
  const day = date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

/**
 * Safely parse a date value, returning null for invalid dates.
 */
export function mcSafeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Simple HH:MM format (used by phone module).
 */
export function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Format as "MM月DD日 HH:MM" (used by diary module).
 */
export function formatDate(timestamp) {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hours}:${minutes}`;
}

/**
 * Relative time display with fallback to formatDate.
 */
export function formatRelativeTime(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;

  return formatDate(timestamp);
}
