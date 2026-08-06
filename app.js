Warning: truncated output (original token count: 108440)
Total output lines: 11930

console.log("build", window.SAVE_PRINCESS_BUILD || "dev");

// ── Config / Supabase ─────────────────────────────────────────────────────────

const appConfig = window.SAVE_PRINCESS_CONFIG || {};

function getConfigValue(key, placeholder) {
  const value = appConfig[key];
  return (!value || value === placeholder) ? "" : value;
}

function createSupabaseClient() {
  const url = getConfigValue("SUPABASE_URL", "YOUR_SUPABASE_URL");
  const key = getConfigValue("SUPABASE_ANON_KEY", "YOUR_SUPABASE_ANON_KEY");
  if (!url || !key || !window.supabase) return null;
  return window.supabase.createClient(url, key);
}

const supabaseClient = createSupabaseClient();
const welcomeMessage = "欢迎回家，kk。";

// Expose runtime context for modules
if (supabaseClient) {
  window.supabaseClient = supabaseClient;
}
// currentUserId is set by auth.js
window.currentUserId = window.currentUserId || "";
// Expose getConfigValue for modules
window.getConfigValue = getConfigValue;

// Chat now has one canonical mode. Keep the legacy request field set to
// "general" until the backend API can remove tier compatibility entirely.
const currentModelTier = "general";
localStorage.removeItem("modelTier");

// ── Provider Groups & Model Role Mapping ──────────────────────────────────────

// Provider groups configuration
// All providers now managed through UI - no hardcoded providers
const PROVIDER_GROUPS = {};

// Load custom providers from localStorage
(function loadCustomProviders() {
  try {
    const customProviders = JSON.parse(localStorage.getItem('custom_providers') || '{}');
    Object.entries(customProviders).forEach(([id, config]) => {
      PROVIDER_GROUPS[id] = {
        name: config.name,
        endpoint: config.endpoint,
        models: config.models,
        description: config.description || '自定义配置',
        requiresAuth: true
      };
    });
  } catch (err) {
    console.error('Failed to load custom providers:', err);
  }
})();

// Model role definitions
const MODEL_ROLES = {
  chat: { label: "对话模型", description: "主聊天回复" },
  diary: { label: "日记模型", description: "自动写日记、手动生成日记" },
  webReader: { label: "联网工具读取模型", description: "读取网页、搜索结果总结" },
  utility: { label: "脏活/后台任务模型", description: "摘要、分类、标签提取等低成本任务" },
  imageGeneration: { label: "图片生成模型", description: "Cha 生成图片时使用" }
};

// Storage key for model role mapping
const MODEL_ROLE_MAPPING_KEY = "spc_model_role_mapping_v1";

// Get model role mapping from localStorage
function getModelRoleMapping() {
  try {
    const stored = localStorage.getItem(MODEL_ROLE_MAPPING_KEY);
    const parsed = stored ? JSON.parse(stored) : {};
    console.log('[app] getModelRoleMapping returned:', parsed);
    return parsed;
  } catch (err) {
    console.error("Failed to parse model role mapping:", err);
    return {};
  }
}

// Save model role mapping to localStorage
function saveModelRoleMapping(mapping) {
  console.log('[app] saveModelRoleMapping called with:', mapping);
  try {
    const data = {
      ...mapping,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(MODEL_ROLE_MAPPING_KEY, JSON.stringify(data));
    console.log('[app] Saved to localStorage:', MODEL_ROLE_MAPPING_KEY, data);

    // Verify it was saved
    const saved = localStorage.getItem(MODEL_ROLE_MAPPING_KEY);
    console.log('[app] Verification read from localStorage:', saved);
    return true;
  } catch (err) {
    console.error("Failed to save model role mapping:", err);
    return false;
  }
}

// Get provider group and model for a specific role
function getModelForRole(role) {
  const mapping = getModelRoleMapping();
  return mapping[role] || null;
}

// Expose to global for modules
window.PROVIDER_GROUPS = PROVIDER_GROUPS;
window.getModelForRole = getModelForRole;
window.getModelRoleMapping = getModelRoleMapping;
window.saveModelRoleMapping = saveModelRoleMapping;
window.MODEL_ROLES = MODEL_ROLES;

console.log('[app] PROVIDER_GROUPS and model functions exposed to window');

// ── Story Seeds 开关（旧关系史已停用，保留变量避免引用报错） ──────────────────
// LEGACY_MEMORY_ENABLED=false，storySeedsEnabled 不再影响 chat 注入。
const storySeedsEnabled = false;

// ── Emoji Pack Registry (moved to modules/emoji-lexicon.js + modules/emoji-catalog.js) ──
// ── Compatibility aliases ────────────────────────────────────────────────────
// These let existing app.js code keep working without changes during Phase 1.
// Keep in sync with the module exports. Remove after full migration.

// Storage keys (still needed by app.js for clearance / settings UI)
const EMOJI_PACK_CONFIG_KEY   = window.SPEmoji.EMOJI_PACK_CONFIG_KEY;
const EMOJI_CATALOG_CACHE_KEY = window.SPEmoji.EMOJI_CATALOG_CACHE_KEY;
const EMOJI_RECENT_KEY        = window.SPEmoji.EMOJI_RECENT_KEY;
const EMOJI_FREQUENCY_KEY     = window.SPEmoji.EMOJI_FREQUENCY_KEY;
const EMOJI_FAVORITE_KEY      = window.SPEmoji.EMOJI_FAVORITE_KEY;
const EMOJI_RENDER_CACHE_KEY  = window.SPEmojiRender.EMOJI_RENDER_CACHE_KEY;
const EMOJI_RENDER_CACHE_VERSION     = window.SPEmojiRender.EMOJI_RENDER_CACHE_VERSION;
const EMOJI_RENDER_CACHE_MAX_ENTRIES = window.SPEmojiRender.EMOJI_RENDER_CACHE_MAX_ENTRIES;

const EMOJI_PACK_SOURCES_DEFAULT = window.SPEmoji.EMOJI_PACK_SOURCES_DEFAULT;
let emojiSourceAdapters = window.SPEmoji.emojiSourceAdapters;
let emojiCatalog = window.SPEmoji.emojiCatalog;
const EMOJI_LEXICON  = window.SPEmoji.EMOJI_LEXICON;
const KAOMOJI_LIST   = window.SPEmoji.KAOMOJI_LIST;

// Function aliases — move callers to window.SPEmoji.* / window.SPEmojiRender.* / window.SPEmojiPanel.*
// progressively. For Phase 1 we keep these shims so existing call sites are untouched.
const buildEmojiGuide           = () => window.SPEmoji.buildEmojiGuide();
const loadEmojiCatalog          = () => window.SPEmoji.loadEmojiCatalog();
const resolveEmojiToken         = (t) => window.SPEmoji.resolveEmojiToken(t);
const pickInsertToken           = (e) => window.SPEmoji.pickInsertToken(e);
const recordEmojiUsed           = (id) => window.SPEmoji.recordEmojiUsed(id);
const filterEmojis              = (e, q) => window.SPEmoji.filterEmojis(e, q);
const getLexiconMap             = () => window.SPEmoji.getLexiconMap();
const isFavorite                = (id) => window.SPEmoji.isFavorite(id);
const toggleFavorite            = (id) => window.SPEmoji.toggleFavorite(id);

const setMessageContent         = (el, text, opts) => window.SPEmojiRender.setMessageContent(el, text, opts);
const renderTextWithEmoji       = (text) => window.SPEmojiRender.renderTextWithEmoji(text);
const hashString                = (s) => window.SPEmojiRender.hashString(s);
const invalidateRenderCache     = (id) => window.SPEmojiRender.invalidateRenderCache(id);
const migrateRenderCacheTempId  = (tid, rid, h) => window.SPEmojiRender.migrateRenderCacheTempId(tid, rid, h);
const getRenderCacheTokens      = (id, h) => window.SPEmojiRender.getRenderCacheTokens(id, h);
const setRenderCacheTokens      = (id, h, t) => window.SPEmojiRender.setRenderCacheTokens(id, h, t);
const preloadVisibleMessageEmojis = () => window.SPEmojiRender.preloadVisibleMessageEmojis(messageList);

const openEmojiPanel            = () => window.SPEmojiPanel.openEmojiPanel();
const closeEmojiPanel           = () => window.SPEmojiPanel.closeEmojiPanel();


// ── Pending images state (multi-image support) ────────────────────────────
let pendingImages = []; // Array<{ id: string, dataUrl: string|null, loading: boolean, error: string|null, file: File }>

// ── Inline edit-message state ─────────────────────────────────────────────────
let composerEditMode = "send"; // "send" | "edit"
let editingMessageId = null;
let editingMessageRow = null;
let editingOriginalText = "";

// ── DOM refs ──────────────────────────────────────────────────────────────────

const chatForm          = document.getElementById("chatForm");
const messageInput      = document.getElementById("messageInput");
const messageList       = document.getElementById("messageList");
const toggleMemoryButton = document.getElementById("toggleMemoryButton");
const closeMemoryButton = document.getElementById("closeMemoryButton");
const memoryOverlay     = document.getElementById("memoryOverlay");
const memoryList        = document.getElementById("memoryList");
const memoryInput       = document.getElementById("memoryInput");
const memoryDomainSelect = document.getElementById("memoryDomainSelect");
const addMemoryButton   = document.getElementById("addMemoryButton");
const newConvButton     = document.getElementById("newConvButton");
const convList          = document.getElementById("convList");
const sidebar           = document.getElementById("sidebar");
const sidebarToggle     = document.getElementById("sidebarToggle");
const loginOverlay      = document.getElementById("loginOverlay");
const loginEmail        = document.getElementById("loginEmail");
const loginMsg          = document.getElementById("loginMsg");
const loginPassword      = document.getElementById("loginPassword");
const loginBtn          = document.getElementById("loginBtn");
const logoutBtn         = document.getElementById("logoutBtn");
const imageInput        = document.getElementById("imageInput");
const imagePreviewBar   = document.getElementById("imagePreviewBar");
const imageAttachBtn    = document.getElementById("imageAttachBtn");
const voiceInputBtn     = document.getElementById("voiceInputBtn");
const chatBackButton    = document.getElementById("chatBackButton");
const chaAvatarButton   = document.getElementById("chaAvatarButton");
const chatSearchButton  = document.getElementById("chatSearchButton");
const chatOnlineDot     = document.getElementById("chatOnlineDot");
const chatSearchBar     = document.getElementById("chatSearchBar");
const chatSearchSheet   = document.getElementById("chatSearchSheet");
const chatSearchOverlay = document.getElementById("chatSearchOverlay");
const chatSearchClose   = document.getElementById("chatSearchClose");
const chatSearchInput   = document.getElementById("chatSearchInput");
const chatSearchClear   = document.getElementById("chatSearchClear");
const chatSearchResults = document.getElementById("chatSearchResults");

// ── Reply / Quote draft state ────────────────────────────────────────────────
var _replyToId      = null;
var _replyToPreview = null;
var _replyToRole    = null;

// ── Theme ─────────────────────────────────────────────────────────────────────

const themeMediaQuery = window.matchMedia("(prefers-color-scheme: light)");
const themeOrder = ["system", "light", "dark"];
const themeLabelMap = {
  system: "系统",
  light: "浅色",
  dark: "深色",
};

function getThemeMode() {
  const stored = localStorage.getItem("theme");
  return themeOrder.includes(stored) ? stored : "system";
}

function getEffectiveTheme(mode = getThemeMode()) {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return themeMediaQuery.matches ? "light" : "dark";
}

function applyTheme(mode = getThemeMode()) {
  const effectiveTheme = getEffectiveTheme(mode);
  if (effectiveTheme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  // 更新系统弹窗内主题选项的选中态
  document.querySelectorAll(".theme-option-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeMode === mode);
  });
}

function setThemeMode(mode) {
  localStorage.setItem("theme", mode);
  applyTheme(mode);
}

applyTheme();

// ── 系统设置弹窗 ──────────────────────────────────────────────────────────────

const systemOverlay = document.getElementById("systemOverlay");

document.getElementById("systemButton")?.addEventListener("click", () => {
  applyTheme(); // 确保选中态最新
  systemOverlay?.classList.remove("hidden");
});

document.getElementById("closeSystemButton")?.addEventListener("click", () => {
  systemOverlay?.classList.add("hidden");
});

document.getElementById("closeStatusPanelBtn")?.addEventListener("click", closeStatusPanel);
document.addEventListener("click", (e) => {
  const panel = document.getElementById("statusPanel");
  if (!panel || panel.classList.contains("hidden")) return;
  if (!panel.contains(e.target) && !e.target.closest("#chatOnlineDot, .top-bar h1")) closeStatusPanel();
});

document.getElementById("themeOptions")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".theme-option-btn");
  if (!btn) return;
  setThemeMode(btn.dataset.themeMode);
});

const onSystemThemeChange = () => {
  if (getThemeMode() === "system") applyTheme("system");
};
if (typeof themeMediaQuery.addEventListener === "function") {
  themeMediaQuery.addEventListener("change", onSystemThemeChange);
} else if (typeof themeMediaQuery.addListener === "function") {
  themeMediaQuery.addListener(onSystemThemeChange);
}

// ── Conversations (moved to modules/conversation-manager.js) ─────────────────
// ── Dialog helper ─────────────────────────────────────────────────────────────

function showDialog({ title, body, input, inputType = "text", confirmLabel, confirmClass, onConfirm = () => {} }) {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "dialog";

  const h3 = document.createElement("h3");
  h3.textContent = title;
  dialog.appendChild(h3);

  if (body) {
    const p = document.createElement("p");
    p.textContent = body;
    dialog.appendChild(p);
  }

  let inp = null;
  if (input !== undefined) {
    inp = document.createElement("input");
    inp.type = inputType;
    inp.value = input;
    if (inputType === "password") inp.autocomplete = "current-password";
    dialog.appendChild(inp);
  }

  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn-cancel";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", () => overlay.remove());

  const confirmBtn = document.createElement("button");
  confirmBtn.className = confirmClass || "btn-confirm";
  confirmBtn.textContent = confirmLabel;
  confirmBtn.addEventListener("click", () => {
    overlay.remove();
    onConfirm(inp ? inp.value.trim() : null);
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  if (inp) { inp.focus(); inp.select(); }
  if (inp) inp.addEventListener("keydown", e => { if (e.key === "Enter") confirmBtn.click(); });
}

// ── UI helpers ────────────────────────────────────────────────────────────────

let activeInlineEditor = null;

function closeInlineEditor() {
  if (activeInlineEditor) {
    activeInlineEditor.remove();
    activeInlineEditor = null;
  }
}

function placeInlineEditor(editor, anchor) {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  const width = Math.min(320, window.innerWidth - margin * 2);
  editor.style.width = `${width}px`;
  document.body.appendChild(editor);
  const height = editor.offsetHeight || 120;
  let top = rect.bottom + 6;
  if (top + height > window.innerHeight - margin) top = rect.top - height - 6;
  let left = rect.left;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
  editor.style.left = `${left}px`;
  editor.style.top = `${top}px`;
}

function openInlineEditor(anchor, options = {}) {
  closeInlineEditor();
  const {
    load = () => anchor.textContent || "",
    save,
    label = anchor.getAttribute("aria-label") || anchor.title || "Edit",
    multiline = false,
    inputType = "text",
    placeholder = "",
    validate,
    format = (value) => value,
  } = options;
  if (typeof save !== "function") return null;

  const editor = document.createElement("div");
  editor.className = "inline-editor";
  editor.setAttribute("role", "dialog");
  editor.setAttribute("aria-label", label);

  const input = multiline ? document.createElement("textarea") : document.createElement("input");
  input.className = "inline-editor-input";
  if (!multiline) input.type = inputType;
  input.value = String(load() ?? "");
  input.placeholder = placeholder;
  if (multiline) input.rows = 3;

  const error = document.createElement("div");
  error.className = "inline-editor-error";
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className = "inline-editor-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "inline-editor-btn";
  cancelBtn.textContent = "Cancel";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "inline-editor-btn inline-editor-btn--primary";
  saveBtn.textContent = "Save";
  actions.append(cancelBtn, saveBtn);
  editor.append(input, error, actions);

  async function submit() {
    const value = input.value.trim();
    const validationError = typeof validate === "function" ? validate(value) : "";
    if (validationError) {
      error.textContent = validationError;
      error.hidden = false;
      return;
    }
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    error.hidden = true;
    try {
      await save(value);
      anchor.textContent = format(value);
      closeInlineEditor();
    } catch (err) {
      error.textContent = err instanceof Error ? err.message : String(err);
      error.hidden = false;
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  }

  cancelBtn.addEventListener("click", closeInlineEditor);
  saveBtn.addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeInlineEditor();
    if (event.key === "Enter" && !multiline && !event.isComposing) {
      event.preventDefault();
      submit();
    }
    if (event.key === "Enter" && multiline && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  });

  activeInlineEditor = editor;
  placeInlineEditor(editor, anchor);
  input.focus();
  input.select();
  setTimeout(() => {
    document.addEventListener("pointerdown", function onPointerDown(event) {
      if (!activeInlineEditor) return document.removeEventListener("pointerdown", onPointerDown);
      if (activeInlineEditor.contains(event.target) || anchor.contains(event.target)) return;
      closeInlineEditor();
      document.removeEventListener("pointerdown", onPointerDown);
    });
  }, 0);
  return editor;
}

function attachInlineEditor(anchor, options = {}) {
  if (!anchor) return;
  anchor.classList.add("inline-editable");
  anchor.tabIndex = anchor.tabIndex >= 0 ? anchor.tabIndex : 0;
  anchor.addEventListener("click", () => openInlineEditor(anchor, options));
  anchor.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openInlineEditor(anchor, options);
    }
  });
}

window.SavePrincessInlineEdit = {
  attach: attachInlineEditor,
  open: openInlineEditor,
  close: closeInlineEditor,
};

const APP_TIME_ZONE = "Asia/Shanghai";

function parseDbTime(value) {
  if (!value) return null;
  const s = String(value);
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  return new Date(s + "Z");
}

function getZonedParts(date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

function zonedDayKey(date) {
  const p = getZonedParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

const chatMessages = [];
let lastMessageTime = null;

// ── Unread state ──────────────────────────────────────────────────────────────
// chaUnreadCount: number of assistant messages the user hasn't seen yet.
// Managed by markReadByUser() and updateChaUnreadBadge().
let chaUnreadCount = 0;
const chatUnreadBadge = document.getElementById("chatUnreadBadge");

// ── Chat history pagination ────────────────────────────────────────────────────
const HISTORY_PAGE_SIZE = 20;
let historyHasMore = false;
let historyLoadingOlder = false;
let oldestLoadedMessageCreatedAt = null;

// ── Chat render state — used to skip full re-render on tab switch ─────────────
const chatRenderState = {
  renderedConversationId: null,
  renderedMessageCount: 0,
}

function formatMsgTime(iso) {
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

function formatConvTime(iso) {
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

function maybeAddTimeSeparator(createdAt) {
  const d = parseDbTime(createdAt);
  if (!d) return;
  const t = d.getTime();
  const isFirst = lastMessageTime === null;
  const gap = lastMessageTime !== null ? t - lastMessageTime : Infinity;
  const crossDay = lastMessageTime !== null &&
    zonedDayKey(new Date(lastMessageTime)) !== zonedDayKey(d);
  if (isFirst || crossDay || gap > 5 * 60 * 1000) {
    lastMessageTime = t;
    const div = document.createElement("div");
    div.className = "time-separator";
    div.textContent = formatMsgTime(createdAt);
    messageList.appendChild(div);
  } else {
    lastMessageTime = t;
  }
}

// ── Message Renderer (moved to modules/message-renderer.js) ──────────────────
// ── Quote / Reply helpers (moved to modules/quote-reply.js) ─────────────────
// ── DB ────────────────────────────────────────────────────────────────────────

/**
 * Upload a compressed image data URL to Supabase Storage.
 * Returns the storage object path (e.g. "{userId}/{filename}.jpg") on success,
 * or null on failure (upload errors are non-fatal — chat still works without image persistence).
 *
 * Path convention: {userId}/{conversationId}_{timestamp}.jpg
 * This puts each user's files in their own folder, matching the RLS policy.
 */
function getFileExtension(file, fallback = "jpg") {
  const name = file?.name || "";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return ext || fallback;
}

function defaultStoragePath({ userId, scope = "uploads", file }) {
  return `${userId}/${scope}_${Date.now()}.${getFileExtension(file)}`;
}

async function getStorageSignedUrl(bucket, storagePath, expiresIn = 3600) {
  if (!supabaseClient || !bucket || !storagePath) return null;
  const { data, error } = await supabaseClient.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresIn);
  if (error) return null;
  return data?.signedUrl || null;
}

async function uploadStorageAsset({ file, dataUrl, bucket = "chat-images", path, contentType, signedUrlExpiresIn = 3600 }) {
  if (!supabaseClient || (!file && !dataUrl) || !bucket || !path) return null;
  try {
    const blob = file || await fetch(dataUrl).then((res) => res.blob());
    const { error } = await supabaseClient.storage
      .from(bucket)
      .upload(path, blob, {
        contentType: contentType || blob.type || "application/octet-stream",
        upsert: false,
      });
    if (error) {
      console.warn("Storage upload failed:", error.message);
      return null;
    }
    const signedUrl = await getStorageSignedUrl(bucket, path, signedUrlExpiresIn);
    return { bucket, path, signedUrl };
  } catch (err) {
    console.warn("Storage upload error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

function createStorageUploader(options = {}) {
  const { accept = "image/*", bucket = "chat-images", scope = "uploads", maxBytes = 20 * 1024 * 1024, pathForFile, onUploaded, onError } = options;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.style.display = "none";
  document.body.appendChild(input);

  async function open(extra = {}) {
    const { data: { user } } = await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));
    const userId = extra.userId || user?.id || window.currentUserId;
    if (!userId) {
      const err = new Error("user_id required for upload");
      if (typeof onError === "function") onError(err);
      throw err;
    }
    return new Promise((resolve) => {
      input.onchange = async () => {
        const file = input.files?.[0];
        input.value = "";
        if (!file) return resolve(null);
        if (file.size > maxBytes) {
          const err = new Error("file exceeds upload size limit");
          if (typeof onError === "function") onError(err);
          return resolve(null);
        }
        const uploadPath = typeof pathForFile === "function"
          ? pathForFile({ file, userId, scope, extra })
          : defaultStoragePath({ file, userId, scope });
        const result = await uploadStorageAsset({ file, bucket, path: uploadPath, contentType: file.type });
        if (result && typeof onUploaded === "function") onUploaded(result);
        if (!result && typeof onError === "function") onError(new Error("upload failed"));
        resolve(result);
      };
      input.click();
    });
  }

  return { input, open, destroy: () => input.remove() };
}

window.SavePrincessUpload = {
  create: createStorageUploader,
  upload: uploadStorageAsset,
  signedUrl: getStorageSignedUrl,
};

async function uploadImageToStorage(dataUrl, userId, conversationId) {
  if (!supabaseClient || !dataUrl || !userId || !conversationId) return null;
  const uploadResult = await uploadStorageAsset({
    dataUrl,
    bucket: "chat-images",
    path: `${userId}/${conversationId}_${Date.now()}.jpg`,
    contentType: "image/jpeg",
  });
  if (!uploadResult?.path) return null;
  return { path: uploadResult.path, signedUrl: uploadResult.signedUrl || null };
}

/**
 * Generate a 1-hour signed URL for a Storage path.
 * Returns null on error (non-fatal).
 */
async function getSignedImageUrl(storagePath) {
  if (!supabaseClient || !storagePath) return null;

  // If storagePath is already a full URL (external image), return it directly
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    console.log("[getSignedImageUrl] External URL detected, returning directly:", storagePath.slice(0, 100));
    return storagePath;
  }

  const signedUrl = await getStorageSignedUrl("chat-images", storagePath, 3600);
  if (signedUrl) return signedUrl;
  const { data, error } = await supabaseClient.storage
    .from("chat-images")
    .createSignedUrl(storagePath, 3600); // 1 hour
  if (error) {
    console.warn("生成 signed URL 失败：", error.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Given an array of raw message rows from DB (each may have image_storage_path),
 * batch-generate signed URLs and return augmented rows where content is replaced
 * by a vision content array when an image is present.
 *
 * Input row shape:  { id, role, content, created_at, image_storage_path? }
 * Output row shape: { id, role, content (string | array), created_at, image_storage_path? }
 */
async function resolveImagePaths(rows) {
  // Collect rows that need a signed URL
  const needsUrl = rows.filter(r => r.image_storage_path);
  if (!needsUrl.length) return rows;

  // Parse image_storage_path: could be single string or JSON array
  const pathsToResolve = [];
  const pathIndexMap = new Map(); // path -> [row, index]

  needsUrl.forEach(r => {
    let paths;
    try {
      // Try to parse as JSON array first
      paths = JSON.parse(r.image_storage_path);
      if (!Array.isArray(paths)) paths = [r.image_storage_path];
    } catch {
      // Not JSON, treat as single path
      paths = [r.image_storage_path];
    }

    paths.forEach((path, idx) => {
      if (!pathIndexMap.has(path)) {
        pathIndexMap.set(path, []);
        pathsToResolve.push(path);
      }
      pathIndexMap.get(path).push({ row: r, index: idx, totalPaths: paths.length });
    });
  });

  // Parallel signed URL generation for all unique paths
  const urlResults = await Promise.all(
    pathsToResolve.map(path => getSignedImageUrl(path))
  );

  // Build a map: path → signedUrl
  const urlMap = new Map();
  pathsToResolve.forEach((path, i) => {
    if (urlResults[i]) urlMap.set(path, urlResults[i]);
  });

  // Rebuild rows: upgrade content to vision array when signed URL is available
  return rows.map(r => {
    if (!r.image_storage_path) return r;

    let paths;
    try {
      paths = JSON.parse(r.image_storage_path);
      if (!Array.isArray(paths)) paths = [r.image_storage_path];
    } catch {
      paths = [r.image_storage_path];
    }

    const signedUrls = paths.map(path => urlMap.get(path)).filter(Boolean);
    if (!signedUrls.length) return r; // fallback: keep text-only content

    // Extract text content (remove [图片] or [图片×N] prefix)
    const textPart = r.content.replace(/^\[图片(?:×\d+)?\]\s*/, "").trim();
    const parts = [];
    if (textPart) parts.push({ type: "text", text: textPart });

    // Add all image URLs
    signedUrls.forEach(url => {
      parts.push({ type: "image_url", image_url: { url, detail: "low" } });
    });

    // Preserve original database content for quote preview
    return { ...r, db_content: r.content, content: parts };
  });
}

const MESSAGE_EVENT_TYPES = new Set(["message", "image", "system", "dream", "voice"]);
const MESSAGE_SYSTEM_ACTIONS = new Set(["favorite", "edit", "delete", "tag", "game_played"]);

function buildMessageEventFields(fields = {}) {
  const out = {};
  if (MESSAGE_EVENT_TYPES.has(fields.type)) out.type = fields.type;
  if (typeof fields.is_favorite === "boolean") out.is_favorite = fields.is_favorite;
  if (Array.isArray(fields.ai_tags)) out.ai_tags = fields.ai_tags;
  if (fields.system_action === null || MESSAGE_SYSTEM_ACTIONS.has(fields.system_action)) {
    out.system_action = fields.system_action;
  }
  if (
    fields.ref_event_id === null ||
    Number.isInteger(fields.ref_event_id) ||
    (typeof fields.ref_event_id === "string" && /^\d+$/.test(fields.ref_event_id))
  ) {
    out.ref_event_id = fields.ref_event_id;
  }
  return out;
}

async function saveMessage(role, content, imageStoragePath = null, eventFields = {}, replyTo = null, thought = null) {
  if (!supabaseClient) return null;
  const conversationId = getActiveConversationId();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const row = {
    role,
    content,
    conversation_id: conversationId,
    user_id: user.id,
    ...buildMessageEventFields(eventFields),
  };
  if (imageStoragePath && !row.type) row.type = "image";
  if (imageStoragePath) row.image_storage_path = imageStoragePath;
  if (replyTo?.id) {
    row.reply_to_message_id = replyTo.id;
    row.reply_to_preview    = replyTo.preview || null;
    row.reply_to_role       = replyTo.role   || null;
  }
  if (thought) row.thought = thought;
  const { data, error } = await supabaseClient
    .from("messages")
    .insert(row)
    .select("id")
    .single();
  if (error) { console.error("保存消息失败：", error); return null; }
  supabaseClient.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).then(() => {});
  return data?.id || null;
}

function isExplicitVoiceMessage(message) {
  // Voice message if:
  // 1. type is "voice" (legacy), or
  // 2. audio_type_explicit is true (user explicitly sent voice), or
  // 3. has audio_type = "fake" (user fake voice message), or
  // 4. has audio_transcribed_text (any voice message with transcription)
  return message?.type === "voice"
    || message?.audio_type_explicit === true
    || message?.audio_type === "fake"
    || (message?.audio_transcribed_text && message?.role === "user");
}

function shouldRenderVoiceMessage(message) {
  return isExplicitVoiceMessage(message) && !!window.SPVoiceMessage;
}

function shouldAddAssistantVoiceIndicator(message) {
  return message?.role === "assistant"
    && !!message.audio_url
    && message.audio_type === "real"
    && !isExplicitVoiceMessage(message)
    && !!message.id;
}

let chaVoiceTtsDebug = {};

function updateChaVoiceTtsDebug(fields = {}) {
  chaVoiceTtsDebug = {
    ...chaVoiceTtsDebug,
    ...fields,
    updated_at: new Date().toISOString(),
  };
  window.chaVoiceTtsDebug = chaVoiceTtsDebug;
  return chaVoiceTtsDebug;
}

function getChaTtsFailureReason(error) {
  if (!error) return "unknown";
  if (error instanceof Error) return error.message || "unknown";
  return String(error);
}

function estimateChaVoiceDuration(text, language = "zh") {
  const charsPerMinute = language === "zh" ? 150 : 180;
  return Math.max(1, Math.ceil(((text || "").length / charsPerMinute) * 60));
}

function getChaTtsRequestConfig(text) {
  const ttsConfig = typeof SPVoice !== "undefined" && SPVoice.getTTSConfig
    ? SPVoice.getTTSConfig()
    : null;

  if (!ttsConfig || !ttsConfig.provider) {
    throw new Error("TTS provider is not configured");
  }

  const language = typeof SPVoice !== "undefined" && SPVoice.detectTtsLanguage
    ? SPVoice.detectTtsLanguage(text)
    : "zh";

  const supabaseUrl = getConfigValue("SUPABASE_URL", "YOUR_SUPABASE_URL");
  const anonKey = getConfigValue("SUPABASE_ANON_KEY", "YOUR_SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey || supabaseUrl === "YOUR_SUPABASE_URL" || anonKey === "YOUR_SUPABASE_ANON_KEY") {
    throw new Error("TTS endpoint is not configured");
  }

  const profiles = ttsConfig.profiles || {};
  const profile = profiles[language] || profiles.default || profiles.en || {};
  const voiceId = profile.voice_id || profiles.en?.voice_id || profiles.default?.voice_id || "";
  const modelId = ttsConfig.model_id || profile.model_id || "eleven_v3";

  if (!voiceId) {
    throw new Error("TTS voice_id is not configured");
  }

  return {
    endpoint: `${supabaseUrl}/functions/v1/tts`,
    anonKey,
    language,
    provider: ttsConfig.provider || "elevenlabs",
    voiceId,
    modelId,
    profile,
  };
}

async function requestChaTts(text, { messageId = null, purpose = "attachment" } = {}) {
  const cfg = getChaTtsRequestConfig(text);
  updateChaVoiceTtsDebug({
    tts_provider: cfg.provider,
    voice_id: cfg.voiceId,
    model_id: cfg.modelId,
    tts_endpoint: cfg.endpoint,
    tts_status: "pending",
    tts_error: null,
    storage_upload_status: null,
    audio_url_returned: false,
    purpose,
  });

  let response;
  let data = null;
  try {
    response = await fetch(cfg.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.anonKey}`,
        "apikey": cfg.anonKey,
      },
      body: JSON.stringify({
        message_id: messageId != null ? Number(messageId) : null,
        text,
        language_hint: cfg.language,
        provider: cfg.provider,
        voice_profile: {
          voice_id: cfg.voiceId,
          model_id: cfg.modelId,
          settings: cfg.profile.settings,
        },
      }),
    });

    const raw = await response.text();
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { message: raw };
    }

    if (!response.ok || data?.ok === false) {
      const reason = data?.message || data?.code || response.statusText || "TTS request failed";
      throw new Error(`${response.status}: ${reason}`);
    }

    const audioUrl = data.audio_url || data.url;
    if (!audioUrl) {
      throw new Error("TTS returned no audio URL");
    }

    const audioDuration = data.duration || estimateChaVoiceDuration(text, cfg.language);
    updateChaVoiceTtsDebug({
      tts_status: response.status,
      tts_error: null,
      storage_upload_status: data.storage_upload_status || data.audio_url_type || (data.cache_write_failed ? "data_fallback" : null),
      audio_url_returned: true,
      tts_provider: data.provider || cfg.provider,
      voice_id: data.voice_id || cfg.voiceId,
      model_id: data.model_id || cfg.modelId,
    });

    return {
      data,
      audioUrl,
      audioDuration,
      language: cfg.language,
      provider: data.provider || cfg.provider,
      voiceId: data.voice_id || cfg.voiceId,
      modelId: data.model_id || cfg.modelId,
    };
  } catch (error) {
    updateChaVoiceTtsDebug({
      tts_status: response?.status || "error",
      tts_error: getChaTtsFailureReason(error),
      storage_upload_status: data?.storage_upload_status || data?.audio_url_type || (data?.cache_write_failed ? "data_fallback" : null),
      audio_url_returned: !!(data?.audio_url || data?.url),
    });
    throw error;
  }
}

/**
 * Generate TTS voice for Cha's assistant message
 * Calls TTS endpoint, saves audio_url to database, updates UI
 * @param {string} messageId - The message ID
 * @param {string} text - The message text content
 */
async function generateChaVoice(messageId, text) {
  if (!supabaseClient || !messageId || !text.trim()) return;

  // Check if voice generation is enabled (default: true)
  const autoVoiceEnabled = localStorage.getItem("cha_auto_voice_enabled") !== "false";
  if (!autoVoiceEnabled) return;

  try {
    // Get TTS config
    const ttsConfig = typeof SPVoice !== "undefined" && SPVoice.getTTSConfig
      ? SPVoice.getTTSConfig()
      : null;

    if (!ttsConfig || !ttsConfig.provider) {
      console.log("TTS not configured, skipping Cha voice generation");
      return;
    }

    // Detect language for voice profile selection
    const language = typeof SPVoice !== "undefined" && SPVoice.detectTtsLanguage
      ? SPVoice.detectTtsLanguage(text)
      : "zh";

    // Call TTS endpoint — pass message_id so the function attempts Storage upload
    const voice_id = ttsConfig.profiles?.[language]?.voice_id || ttsConfig.profiles?.default?.voice_id;
    const response = await fetch(`${SUPABASE_URL}/functions/v1/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        message_id: Number(messageId),
        text: text,
        language_hint: language,
        provider: ttsConfig.provider,
        voice_profile: {
          voice_id: voice_id,
          model_id: ttsConfig.model_id,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("TTS generation failed:", response.status, errorText);
      return;
    }

    const data = await response.json();
    const audioUrl = data.audio_url || data.url;

    if (!audioUrl) {
      console.warn("TTS returned no audio URL");
      return;
    }

    const charsPerMinute = language === "zh" ? 150 : 180;
    const estimatedDuration = Math.max(1, Math.ceil((text.length / charsPerMinute) * 60));
    const audioDuration = data.duration || estimatedDuration;

    // Guard: never write a base64 data URL into messages.audio_url (causes Postgres index overflow)
    const isDataUrl = typeof audioUrl === "string" && audioUrl.startsWith("data:audio");
    const isDataFallback = data.audio_url_type === "data_fallback" || data.cache_write_failed === true;

    if (isDataUrl || isDataFallback) {
      console.warn("[TTS] Storage upload failed — playing locally, not persisted", {
        storage_upload_status: data.storage_upload_status,
        audio_url_type: data.audio_url_type,
        cache_write_failed: data.cache_write_failed,
        request_id: data.request_id,
        message_id: messageId,
      });
      if (typeof showToast === "function") {
        showToast("语音已生成，但音频上传失败，未持久保存");
      }
      addVoiceIndicatorToMessage(messageId, audioUrl, audioDuration, text);
      return;
    }

    // Only reach here when audioUrl is a real http(s) Storage URL
    const { error: updateError } = await supabaseClient
      .from("messages")
      .update({
        audio_url: audioUrl,
        audio_duration: audioDuration,
        audio_type: "real",
        audio_type_explicit: false,
        audio_transcribed_text: text,
      })
      .eq("id", Number(messageId));

    if (updateError) {
      console.warn("Failed to save Cha voice attachment to database:", updateError);
      showToast("Cha 朗读保存失败");
      return;
    }

    const msgEntry = chatMessages.find(m => m.id === messageId);
    if (msgEntry) {
      msgEntry.audio_url = audioUrl;
      msgEntry.audio_duration = audioDuration;
      msgEntry.audio_type = "real";
      msgEntry.audio_type_explicit = false;
      msgEntry.audio_transcribed_text = text;
    }

    addVoiceIndicatorToMessage(messageId, audioUrl, audioDuration, text);

    console.log(`✓ Cha voice generated and saved for message ${messageId}`);
  } catch (error) {
    const reason = getChaTtsFailureReason(error);
    console.warn("Cha voice attachment generation error:", error);
    showToast(`Cha 朗读生成失败：${reason}`);
  }
}

async function sendChaVoiceMessage(text, options = {}) {
  if (!supabaseClient || !text || !text.trim()) return null;
  if (window.SPVoice) window.SPVoice.stopSpeaking();
  if (window.SPVoiceMessage) window.SPVoiceMessage.stopVoicePlayback();

  const now = new Date().toISOString();
  const tempId = `tmp-cha-voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const conversationId = getActiveConversationId();
  const cleanedText = text.trim();

  const row = document.createElement("div");
  row.className = "msg-row assistant";
  row.dataset.tempId = tempId;
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.title = "Cha";
  const stack = document.createElement("div");
  stack.className = "msg-stack";
  const pending = document.createElement("div");
  pending.className = "message assistant cha-message message-voice voice-pending";
  pending.textContent = "语音生成中...";
  stack.appendChild(pending);
  row.appendChild(avatar);
  row.appendChild(stack);
  maybeAddTimeSeparator(now);
  messageList.appendChild(row);
  messageList.scrollTop = messageList.scrollHeight;

  try {
    const { audioUrl, audioDuration } = await requestChaTts(cleanedText, {
      messageId: null,
      purpose: options.purpose || "explicit_voice_message",
    });
    const { data: { user } } = await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));
    const userId = user?.id || window.currentUserId;
    const { data, error } = await supabaseClient
      .from("messages")
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "assistant",
        content: cleanedText || "[语音]",
        type: "voice",
        audio_type: "real",
        audio_type_explicit: true,
        audio_url: audioUrl,
        audio_duration: audioDuration,
        audio_transcribed_text: cleanedText,
      })
      .select("id, created_at")
      .single();

    if (error) throw error;

    const msgId = data?.id != null ? String(data.id) : null;
    const createdAt = data?.created_at || now;
    delete row.dataset.tempId;
    if (msgId) {
      row.dataset.msgId = msgId;
      row.dataset.unreadCha = "1";
    }

    stack.innerHTML = "";
    if (window.SPVoiceMessage) {
      const voiceBubble = window.SPVoiceMessage.createVoiceMessageBubble({
        audioUrl,
        duration: audioDuration,
        audioType: "real",
        transcribedText: cleanedText,
        role: "assistant",
        msgId,
      });
      stack.appendChild(voiceBubble);
    } else {
      pending.textContent = cleanedText;
      stack.appendChild(pending);
      if (msgId) addVoiceIndicatorToMessage(msgId, audioUrl, audioDuration, cleanedText);
    }

    chatMessages.push({
      role: "assistant",
      content: cleanedText,
      created_at: createdAt,
      id: msgId,
      type: "voice",
      audio_type: "real",
      audio_type_explicit: true,
      audio_url: audioUrl,
      audio_duration: audioDuration,
      audio_transcribed_text: cleanedText,
      read_by_user_at: null,
    });
    refreshMessageActions();
    syncChaUnreadCount();
    observeUnreadChaRows();
    markVisibleAssistantRowsRead();
    return msgId;
  } catch (error) {
    const reason = getChaTtsFailureReason(error);
    console.warn("Cha explicit voice message failed:", error);
    pending.textContent = "语音生成失败";
    pending.title = reason;
    showToast(`Cha 语音消息生成失败：${reason}`);
    return null;
  }
}

window.sendChaVoiceMessage = sendChaVoiceMessage;
window.generateChaVoiceMessage = sendChaVoiceMessage;

/**
 * Generate an image using the configured image generation model
 * @param {string} prompt - Image generation prompt
 * @param {Object} options - Optional parameters
 * @returns {Promise<string|null>} - Message ID or null on failure
 */
async function generateChaImage(prompt, options = {}) {
  if (!supabaseClient || !prompt || !prompt.trim()) return null;

  const conversationId = getActiveConversationId();
  if (!conversationId) {
    showToast("无法生成图片：未找到当前对话");
    return null;
  }

  // Get image generation model config
  const modelMapping = getModelRoleMapping();
  const imageGenConfig = modelMapping?.imageGeneration;

  if (!imageGenConfig?.providerGroup || !imageGenConfig?.model) {
    showToast("请先在设置中配置图片生成模型");
    return null;
  }

  // Get provider config
  const customProviders = JSON.parse(localStorage.getItem('custom_providers') || '{}');
  const provider = customProviders[imageGenConfig.providerGroup];

  if (!provider) {
    showToast("图片生成通道配置不存在");
    return null;
  }

  // Show loading indicator
  showTypingIndicator("正在生成图片...");

  try {
    // Get user session token for authentication
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.access_token) {
      removeTypingIndicator();
      showToast("用户未登录，无法生成图片");
      return null;
    }

    const result = await callImageGenerationDirect(prompt.trim(), {
      size: options.size || "1024x1024",
      quality: options.quality || "standard",
      style: options.style,
    });
    removeTypingIndicator();

    if (!result.success) {
      console.error("Image generation failed:", result.error);
      showToast(`图片生成失败：${result.error || "未知错误"}`);
      return null;
    }
    console.log("Image generated:", result);

    // Reload messages to show the new image
    await reloadHistory();

    showToast("图片已生成");
    return result.message_id;

  } catch (error) {
    removeTypingIndicator();
    console.error("Image generation error:", error);
    showToast(`图片生成失败：${error.message}`);
    return null;
  }
}

window.generateChaImage = generateChaImage;

/**
 * Call image-generation edge function directly with prompt (for auto-generation)
 * @param {string} prompt - Final image prompt
 * @param {Object} params - Image parameters (size, quality, style)
 * @returns {Promise<{success: boolean, image_url?: string, message_id?: string, error?: string}>}
 */
async function callImageGenerationDirect(prompt, params, options = {}) {
  if (!supabaseClient) return { success: false, error: '未初始化' };

  const conversationId = getActiveConversationId();
  if (!conversationId) {
    return { success: false, error: '未找到当前对话' };
  }

  // Get image generation model config
  const modelMapping = getModelRoleMapping();
  const imageGenConfig = modelMapping?.imageGeneration;

  if (!imageGenConfig?.providerGroup || !imageGenConfig?.model) {
    return { success: false, error: '请先配置图片生成模型' };
  }

  const customProviders = JSON.parse(localStorage.getItem('custom_providers') || '{}');
  const provider = customProviders[imageGenConfig.providerGroup];

  if (!provider) {
    return { success: false, error: '图片生成通道配置不存在' };
  }

  console.log('[callImageGenerationDirect] Using provider config:', {
    providerGroup: imageGenConfig.providerGroup,
    model: imageGenConfig.model,
    endpoint: provider.endpoint,
    hasApiKey: !!provider.apiKey
  });

  try {
    const supabaseUrl = getConfigValue("SUPABASE_URL", "YOUR_SUPABASE_URL");

    // Get user session token for authentication
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: '用户未登录' };
    }

    const candidates = [...new Set([imageGenConfig.model, imageGenConfig.fallbackModel].filter(Boolean))];
    let lastError = '生成失败';
    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i];
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45_000);
      let response;
      try {
        response = await fetch(`${supabaseUrl}/functions/v1/image-generation`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            prompt,
            conversation_id: conversationId,
            provider_config: { endpoint: provider.endpoint, api_key: provider.apiKey, model },
            size: params.size,
            quality: params.quality,
            style: params.style,
            generation_source: options.source === "proactive" ? "proactive" : "explicit",
            // Fail closed. Identity references are opt-in only after a reviewed
            // canonical pack has been promoted on the server.
            use_identity_reference: params.useIdentityReference === true,
          }),
        });
      } catch (error) {
        if (error?.name === "AbortError") {
          lastError = "生成超时";
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.ok) {
        const result = await response.json();
        if (i > 0) console.info('[image-generation] fallback model used:', model);
        return { success: true, image_url: result.image_url, message_id: result.message_id, model };
      }

      const errorText = await response.text();
      console.error('[callImageGenerationDirect] HTTP error:', response.status, errorText);
      try {
        const error = JSON.parse(errorText);
        const rawError = error.details || error.error || errorText;
        lastError = typeof rawError === 'string' ? rawError : JSON.stringify(rawError);
      } catch {
        lastError = errorText || "生成失败";
      }
      const retryable = response.status === 429 || response.status >= 500 ||
        /model_not_found|no available channel|渠道|通道|reference_image_not_supported|does not support Cha identity references|images\/edits/i.test(lastError);
      if (!retryable) break;
    }
    return { success: false, error: lastError };

  } catch (error) {
    console.error('[callImageGenerationDirect] error:', error);
    return { success: false, error: error.message };
  }
}

// ── Proactive image sharing policy ───────────────────────────────────────────
// Explicit user requests bypass this policy. It only controls photos Cha chooses
// to share on his own, and the server repeats the hard checks before billing.
const PROACTIVE_IMAGE_POLICY = Object.freeze({
  enabled: true,
  minAssistantTurns: 10,
  cooldownMs: 4 * 60 * 60 * 1000,
  maxPerShanghaiDay: 2,
  fallbackChance: 0.25,
});

function getShanghaiDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function readProactiveImageState() {
  try {
    return JSON.parse(localStorage.getItem("cha_proactive_image_state") || "{}");
  } catch {
    return {};
  }
}

function getAssistantTurnCount() {
  return chatMessages.filter(message => message.role === "assistant").length;
}

function recentUserRejectedImages() {
  return chatMessages
    .filter(message => message.role === "user")
    .slice(-8)
    .some(message => /不(用|要|必)发图|别发图|不要(发|生成|画|拍)|图片功能|生图功能|图片模型.*(失败|坏|不可用)/i
      .test(extractTextFromMessageContent(message.content)));
}

function canShareProactiveImage() {
  if (!PROACTIVE_IMAGE_POLICY.enabled || recentUserRejectedImages()) {
    return { allowed: false, reason: "disabled_or_rejected" };
  }
  const now = Date.now();
  const dayKey = getShanghaiDayKey();
  const state = readProactiveImageState();
  const todayCount = state.dayKey === dayKey ? Number(state.count || 0) : 0;
  if (todayCount >= PROACTIVE_IMAGE_POLICY.maxPerShanghaiDay) {
    return { allowed: false, reason: "daily_limit" };
  }
  if (state.lastSuccessAt && now - Number(state.lastSuccessAt) < PROACTIVE_IMAGE_POLICY.cooldownMs) {
    return { allowed: false, reason: "cooldown" };
  }
  const assistantTurns = getAssistantTurnCount();
  if (state.lastAssistantTurn != null &&
      assistantTurns - Number(state.lastAssistantTurn) < PROACTIVE_IMAGE_POLICY.minAssistantTurns) {
    return { allowed: false, reason: "turn_interval" };
  }
  // New installs/conversations must also build a little context before Cha
  // spontaneously spends an image-generation request.
  if (!state.lastSuccessAt && assistantTurns < PROACTIVE_IMAGE_POLICY.minAssistantTurns) {
    return { allowed: false, reason: "initial_turn_interval" };
  }
  return { allowed: true, reason: "eligible" };
}

function recordProactiveImageSuccess() {
  const dayKey = getShanghaiDayKey();
  const oldState = readProactiveImageState();
  const count = oldState.dayKey === dayKey ? Number(oldState.count || 0) + 1 : 1;
  localStorage.setItem("cha_proactive_image_state", JSON.stringify({
    dayKey,
    count,
    lastSuccessAt: Date.now(),
    lastAssistantTurn: getAssistantTurnCount(),
  }));
}

function buildFallbackProactiveImageAction(finalReply) {
  if (Math.random() >= PROACTIVE_IMAGE_POLICY.fallbackChance) return null;
  const latestUser = [...chatMessages].reverse().find(message => message.role === "user");
  const latestText = extractTextFromMessageContent(latestUser?.content).trim();
  // Project/debug/meta conversations are poor moments for an unsolicited,
  // billable lifestyle image.
  if (/代码|报错|日志|部署|模型|通道|生图|图片功能|prompt|github|supabase|修复|测试/i.test(latestText)) {
    return null;
  }
  const shanghaiHour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hour12: false,
  }).format(new Date()));
  const moment = shanghaiHour < 6 ? "上海时间的深夜" :
    shanghaiHour < 11 ? "上海时间的早晨" :
    shanghaiHour < 17 ? "上海时间的白天" :
    shanghaiHour < 21 ? "上海时间的傍晚" : "上海时间的夜晚";
  return {
    route: "slice_of_life",
    description: `${moment}，Cha 自然地分享此刻正在做的小事。画面要承接刚才聊天的情绪，但不要出现文字、聊天界面或摆拍感。当前回复语气参考：${String(finalReply || "").slice(0, 180)}`,
  };
}

/**
 * Handle automatic image generation based on intent detection
 * @param {Object} intent - Intent detection result from SavePrincessImagePolicy.detectImageIntent
 * @param {string} userText - Original user message
 */
async function handleImageGeneration(intent, userText) {
  const { route, face_policy, reason } = intent;

  console.log(`[image-gen] ========== AUTO IMAGE GENERATION START ==========`);
  console.log(`[image-gen] intercepted userText:`, userText);
  console.log(`[image-gen] route:`, route);
  console.log(`[image-gen] face_policy:`, face_policy);
  console.log(`[image-gen] reason:`, reason);

  // First, save user message to database and render it
  console.log(`[image-gen] saving user message before generation`);
  const now = new Date().toISOString();
  const isFirst = chatMessages.length === 0;
  const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Render user message optimistically
  addMessage(userText, "user", now, { tempId });
  chatMessages.push({ role: "user", content: userText, created_at: now, id: null });

  // Save user message to database
  let userMessageId = null;
  try {
    const { data: userMsg, error: userMsgError } = await supabaseClient
      .from("messages")
      .insert({
        role: "user",
        content: userText,
        conversation_id: getActiveConversationId(),
        user_id: currentUserId,
        created_at: now,
      })
      .selec…78440 tokens truncated…BackButton");
  if (title) title.textContent = meta.title;
  if (subtitle) subtitle.textContent = meta.subtitle;
  if (back) back.classList.toggle("hidden", view === "room");
  // 同步桌面 nav active 态
  document.querySelectorAll(".mc-nav-item").forEach((btn) => {
    const isActive = btn.dataset.mcView === view;
    btn.classList.toggle("mc-nav-item--active", isActive);
  });
}

function mcRenderEmpty(root, text) {
  root.appendChild(mcEl("div", "mc-empty", text));
}

function mcRenderBadge(text, tone) {
  const badge = mcEl("span", `mc-chip mc-chip--${tone || "background"}`, text);
  return badge;
}

function mcRenderMemoryCard(item, compact = false) {
  const card = mcEl("article", "mc-memory-card");
  const top = mcEl("div", "mc-memory-card-top");
  const chips = mcEl("div", "mc-chip-row");
  chips.appendChild(mcRenderBadge(item.categoryShort, item.tone));
  chips.appendChild(mcRenderBadge(mcStatusLabel(item), "status"));
  top.appendChild(chips);
  top.appendChild(mcEl("span", "mc-memory-time", mcFormatDateTime(item.createdAt)));

  const title = mcEl("h3", "mc-memory-title", item.title);
  const summary = mcEl("p", "mc-memory-summary", item.summary);
  card.append(top, title, summary);

  // Full content (collapsed by default)
  let fullEl = null;
  const hasFullContent = item.content && item.content.trim().length > 0;
  if (hasFullContent) {
    fullEl = mcEl("div", "mc-memory-full");
    fullEl.textContent = item.content;
    // Don't use .hidden, let CSS handle display via .mc-memory-card--expanded
    card.appendChild(fullEl);
  }

  if (!compact && item.sourcePreview) {
    const source = mcEl("div", "mc-memory-source", `来源：${item.sourcePreview}`);
    card.appendChild(source);
  }

  // Add actions section (only if not compact AND not read-only recent)
  if (!compact && item.source !== "recent") {
    const actions = mcEl("div", "mc-memory-actions");

    // Expand button (only if content has actual text after trim)
    if (hasFullContent) {
      const expandBtn = mcEl("button", "mc-action-btn", "展开");
      expandBtn.type = "button";
      expandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isExp = card.classList.toggle("mc-memory-card--expanded");
        expandBtn.textContent = isExp ? "收起" : "展开";
      });
      actions.appendChild(expandBtn);
    }

    // Toggle enable/disable (for memories and instructions)
    if (item.source === "memories" || item.source === "instructions") {
      const isEnabled = item.enabled !== false;
      const toggleBtn = mcEl("button", "mc-action-btn", isEnabled ? "禁用" : "启用");
      toggleBtn.type = "button";
      toggleBtn.dataset.id = item.id;
      toggleBtn.dataset.enabled = String(isEnabled);
      toggleBtn.dataset.source = item.source;

      toggleBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.disabled = true;
        const newEnabled = btn.dataset.enabled !== "true";
        const isInstruction = btn.dataset.source === "instructions";

        let path = `?id=${encodeURIComponent(btn.dataset.id)}`;
        if (isInstruction) path = `?type=instructions&id=${encodeURIComponent(btn.dataset.id)}`;

        let r;
        try {
          r = await memoryFetch(path, {
            method: "PATCH",
            body: JSON.stringify({ enabled: newEnabled }),
          });
        } catch (err) {
          btn.disabled = false;
          showMcToast(`网络错误：${err.message}`, true);
          return;
        }

        btn.disabled = false;
        if (!r.ok) {
          if (r.status === 401) {
            sessionStorage.removeItem("memory_admin_token");
            showMcToast("口令过期，请刷新页面", true);
          } else {
            let msg = `操作失败（${r.status}）`;
            try { const j = await r.json(); msg = j.error || j.message || msg; } catch {}
            showMcToast(msg, true);
          }
          return;
        }

        let updated;
        try { updated = await r.json(); } catch { updated = null; }
        if (updated && updated.id) {
          updateMemoryItem(updated, isInstruction);
        } else {
          const cached = isInstruction
            ? memoryCenterV2State.instructions.find(i => i.id === item.id)
            : memoryCenterV2State.memories.find(m => m.id === item.id);
          if (cached) updateMemoryItem({ ...cached, enabled: newEnabled }, isInstruction);
        }
        showMcToast(newEnabled ? "已启用" : "已停用");
      });

      actions.appendChild(toggleBtn);
    }

    // Edit button (only for memories, not instructions)
    if (item.source === "memories") {
      const editBtn = mcEl("button", "mc-action-btn", "编辑");
      editBtn.type = "button";
      editBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const current = memoryCenterV2State.memories.find(m => m.id === item.id) || item.raw;
        showMemoryEditDialog(current, null);
      });
      actions.appendChild(editBtn);
    }

    // Delete button (for memories and instructions)
    if (item.source === "memories" || item.source === "instructions") {
      const deleteBtn = mcEl("button", "mc-action-btn mc-action-btn--danger", "删除");
      deleteBtn.type = "button";
      deleteBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isInstruction = item.source === "instructions";
        showDialog({
          title: isInstruction ? "删除设定" : "删除记忆",
          body: isInstruction ? "确定删除这条设定？" : "确定删除这条记忆？",
          confirmLabel: "删除",
          confirmClass: "btn-danger",
          onConfirm: async () => {
            let path = `?id=${encodeURIComponent(item.id)}`;
            if (isInstruction) path = `?type=instructions&id=${encodeURIComponent(item.id)}`;

            let r;
            try {
              r = await memoryFetch(path, { method: "DELETE" });
            } catch (err) {
              showMcToast(`网络错误：${err.message}`, true);
              return;
            }

            if (!r.ok) {
              if (r.status === 401) {
                sessionStorage.removeItem("memory_admin_token");
                showMcToast("口令过期，请刷新页面", true);
              } else {
                let msg = `删除失败（${r.status}）`;
                try { const j = await r.json(); msg = j.error || j.message || msg; } catch {}
                showMcToast(msg, true);
              }
              return;
            }

            removeMemoryItem(item.id, isInstruction);
            showMcToast("已删除");
          },
        });
      });
      actions.appendChild(deleteBtn);
    }

    card.appendChild(actions);
  }

  return card;
}

function switchMemoryCenterView(view, options = {}) {
  memoryCenterV2State.view = view;
  renderMemoryCenterCurrentView(options);
}

function renderMemoryCenterCurrentView(options = {}) {
  const root = document.getElementById("mcViewRoot");
  if (!root) return;
  root.innerHTML = "";
  // 视图专属 class，供 CSS 控制各视图宽度
  root.className = `mc-view-root mc-view-root--${memoryCenterV2State.view}`;
  mcSetHeader(memoryCenterV2State.view);

  if (memoryCenterV2State.view === "archive") {
    renderMemoryArchiveView(root, options);
  } else if (memoryCenterV2State.view === "candidates") {
    renderCandidatePoolView(root);
  } else if (memoryCenterV2State.view === "timeline") {
    renderMemoryTimelineView(root);
  } else if (memoryCenterV2State.view === "lab") {
    renderMemoryLabView(root);
  } else {
    renderMemoryRoomView(root);
  }
}

function renderMemoryRoomView(root) {
  const items = mcBridgeGetDisplayItems();
  const debug = getLastMemoryDebug();

  const status = mcEl("div", "mc-room-status");
  const avatar = mcEl("div", "mc-room-avatar", "⌂");
  const copy = mcEl("div", "mc-room-copy");
  copy.append(
    mcEl("div", "mc-room-title", "cha 的房间"),
    mcEl("div", "mc-room-subtitle", "我们一起经历的，都好好收着")
  );
  const online = mcEl("div", "mc-online");
  online.append(mcEl("span", "mc-online-dot"), document.createTextNode("记忆中心在线"));
  status.append(avatar, copy, online);
  root.appendChild(status);

  const section = mcEl("section", "mc-section");
  section.appendChild(mcEl("h2", "mc-section-title", "最近"));
  const recentWrap = mcEl("div", "mc-card-list");
  const _snap = mcBridgeGetLabSnapshot();
  if (_snap.loadingStates.loadingRecent && !items.length) {
    mcRenderEmpty(recentWrap, "加载中...");
  } else if (items.length) {
    items.slice(0, 2).forEach((item) => recentWrap.appendChild(mcRenderMemoryCard(item, true)));
  } else {
    mcRenderEmpty(recentWrap, _snap.errors.recentError || "还没有当前记忆。");
  }
  section.appendChild(recentWrap);
  root.appendChild(section);

  const archiveLink = mcEl("button", "mc-inline-link", `走进档案馆，看更早的记忆（共 ${items.length} 条） →`);
  archiveLink.type = "button";
  archiveLink.addEventListener("click", () => switchMemoryCenterView("archive"));
  root.appendChild(archiveLink);

  const actions = mcEl("div", "mc-room-actions");
  [
    ["档案馆", "archive", false],
    ["实验室", "lab", false],
  ].forEach(([label, view, focus]) => {
    const btn = mcEl("button", "mc-room-action-btn", label);
    btn.type = "button";
    btn.addEventListener("click", () => switchMemoryCenterView(view, { focusSearch: Boolean(focus) }));
    actions.appendChild(btn);
  });
  root.appendChild(actions);

  if (debug?.active_memory_providers?.length) {
    const note = mcEl("div", "mc-footnote", `本轮参考：${debug.active_memory_providers.length} 个来源`);
    root.appendChild(note);
  }
}

function renderMemoryArchiveView(root, options = {}) {
  const items = mcBridgeGetDisplayItems();
  const toolbar = mcEl("div", "mc-archive-toolbar");
  const input = mcEl("input", "mc-search-input");
  input.type = "search";
  input.placeholder = "找一段记忆...";
  input.value = memoryCenterV2State.query;
  input.addEventListener("input", (event) => {
    memoryCenterV2State.query = event.target.value;
    renderMemoryCenterCurrentView({ focusSearch: true });
  });

  const select = mcEl("select", "mc-status-select");
  [
    ["all", "全部状态"],
    ["enabled", "已写入"],
    ["disabled", "停用"],
    ["instructions", "常驻"],
    ["recent", "最近沉淀"],
  ].forEach(([value, label]) => {
    const option = mcEl("option", "", label);
    option.value = value;
    option.selected = memoryCenterV2State.statusFilter === value;
    select.appendChild(option);
  });
  select.addEventListener("change", (event) => {
    memoryCenterV2State.statusFilter = event.target.value;
    renderMemoryCenterCurrentView();
  });

  const catSelect = mcEl("select", "mc-status-select");
  const catOptions = [["all", "全部分类"], ...Object.entries(MEMORY_CENTER_CATEGORY_CONFIG).map(([key, cfg]) => [key, cfg.label])];
  catOptions.forEach(([value, label]) => {
    const option = mcEl("option", "", label);
    option.value = value;
    option.selected = memoryCenterV2State.categoryFilter === value;
    catSelect.appendChild(option);
  });
  catSelect.addEventListener("change", (event) => {
    memoryCenterV2State.categoryFilter = event.target.value;
    renderMemoryCenterCurrentView();
  });

  toolbar.append(input, select, catSelect);
  root.appendChild(toolbar);

  const grid = mcEl("div", "mc-category-grid");
  Object.entries(MEMORY_CENTER_CATEGORY_CONFIG).forEach(([key, config]) => {
    const count = items.filter((item) => item.categoryKey === key).length;
    const card = mcEl("button", "mc-category-card");
    card.type = "button";
    card.addEventListener("click", () => {
      memoryCenterV2State.categoryFilter = key;
      renderMemoryCenterCurrentView();
    });
    const head = mcEl("div", "mc-category-head");
    head.append(mcRenderBadge(config.short, config.tone), mcEl("span", "mc-category-count", count));
    card.append(head, mcEl("div", "mc-category-title", config.label), mcEl("div", "mc-category-desc", config.desc), mcEl("div", "mc-category-open", "翻开 →"));
    grid.appendChild(card);
  });
  root.appendChild(grid);

  const list = mcEl("div", "mc-card-list mc-card-list--archive");
  const filtered = mcBridgeGetArchiveItems(memoryCenterV2State.query, memoryCenterV2State.statusFilter, memoryCenterV2State.categoryFilter);
  const _archiveSnap = mcBridgeGetLabSnapshot();

  if (_archiveSnap.loadingStates.loadingArchive && !_archiveSnap.loadingStates.archiveLoaded) {
    mcRenderEmpty(list, "档案加载中...");
  } else if (filtered.length) {
    filtered.forEach((item) => list.appendChild(mcRenderMemoryCard(item)));
  } else {
    mcRenderEmpty(list, _archiveSnap.errors.archiveError || "没有匹配的记忆。");
  }
  root.appendChild(list);

  if (options.focusSearch) {
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }
}

function renderMemoryTimelineView(root) {
  const items = mcBridgeGetTimelineItems();
  const intro = mcEl("div", "mc-footnote", "热力条只代表当前已加载数据，不代表全量历史。");
  root.appendChild(intro);

  const heat = mcEl("div", "mc-heat-panel");
  const now = new Date();
  const monthLabel = `${now.getFullYear()} · ${now.getMonth() + 1}月`;
  heat.appendChild(mcEl("div", "mc-heat-label", monthLabel));
  const counts = new Map();
  items.forEach((item) => {
    const key = mcDateKey(item.createdAt);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const maxCount = Math.max(1, ...counts.values());
  const cells = mcEl("div", "mc-heat-cells");
  for (let i = 27; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const key = mcDateKey(date);
    const count = counts.get(key) || 0;
    const level = count === 0 ? 0 : Math.ceil((count / maxCount) * 4);
    const cell = mcEl("span", `mc-heat-cell mc-heat-cell--${level}`);
    cell.title = `${key}: ${count} 条`;
    cells.appendChild(cell);
  }
  heat.appendChild(cells);
  root.appendChild(heat);

  const list = mcEl("div", "mc-timeline-list");
  if (!items.length) {
    mcRenderEmpty(list, "当前没有可用于时间线的已加载记忆。");
  } else {
    let lastDay = "";
    items.forEach((item) => {
      const day = mcDateKey(item.createdAt);
      if (day !== lastDay) {
        lastDay = day;
        list.appendChild(mcEl("div", "mc-timeline-day", day));
      }
      const row = mcEl("article", "mc-timeline-item");
      row.append(mcRenderBadge(item.categoryShort, item.tone));
      const body = mcEl("div", "mc-timeline-body");
      body.append(mcEl("div", "mc-timeline-title", item.title), mcEl("div", "mc-timeline-summary", item.summary));
      row.append(body, mcEl("time", "mc-timeline-time", mcFormatDateTime(item.createdAt).split(" ").pop()));
      list.appendChild(row);
    });
  }
  root.appendChild(list);
}

function renderMemoryLabView(root) {
  const snap = mcBridgeGetLabSnapshot();
  const debug = snap.debug;
  const recentRows = snap.recentRows;
  const audit = snap.audit;
  const items = snap.displayItems;

  const metrics = mcEl("div", "mc-lab-metrics");
  const tokenVal = (typeof debug?.input_tokens === "number" && typeof debug?.output_tokens === "number")
    ? `↑${debug.input_tokens} ↓${debug.output_tokens}`
    : (typeof debug?.input_tokens === "number" ? `↑${debug.input_tokens}` : "暂无本轮数据");
  [
    ["当前模型", debug?.model || "暂无本轮数据"],
    ["本轮 token", tokenVal],
    ["召回来源", debug ? `${debug.memory_provider_count ?? debug.active_memory_providers?.length ?? 0} 个` : "暂无本轮数据"],
    ["注入 token", typeof debug?.memory_context_tokens_estimated === "number" ? String(debug.memory_context_tokens_estimated) : "暂无本轮数据"],
  ].forEach(([label, value]) => {
    const card = mcEl("div", "mc-lab-metric");
    card.append(mcEl("div", "mc-lab-label", label), mcEl("div", "mc-lab-value", value));
    metrics.appendChild(card);
  });
  root.appendChild(metrics);

  const grid = mcEl("div", "mc-lab-grid");
  grid.appendChild(renderMemoryLabPanel("本轮召回", renderRecallDebugRows(debug)));
  grid.appendChild(renderMemoryLabPanel("记忆审计", renderAuditRows(audit, snap.loadingStates, snap.errors)));
  grid.appendChild(renderMemoryLabPanel("最近沉淀", renderRecentLabRows(recentRows, snap.loadingStates, snap.errors, snap.recentSource)));
  grid.appendChild(renderMemoryLabPanel("事件日志", renderLabEventRows(debug, audit, recentRows)));
  root.appendChild(grid);

  // bridge 分布统计
  const distRows = [
    ["总条目", String(snap.sourceDistribution.total)],
    ["memories", String(snap.sourceDistribution.memories)],
    ["instructions", String(snap.sourceDistribution.instructions)],
    ["recent", String(snap.sourceDistribution.recent)],
  ];
  root.appendChild(renderMemoryLabPanel("bridge 分布", distRows));

  // raw 折叠区
  root.appendChild(mcLabRawSection("raw: lastMemoryDebug", debug));
  root.appendChild(mcLabRawSection("raw: audit summary", audit));
  const recentSlice = recentRows.length ? recentRows.slice(0, 5) : null;
  root.appendChild(mcLabRawSection(`raw: recent rows（最多 5 条，共 ${recentRows.length} 条）`, recentSlice));
}

function mcLabRawSection(label, data) {
  const details = document.createElement("details");
  details.className = "mc-lab-raw";
  const summary = document.createElement("summary");
  summary.className = "mc-lab-raw-summary";
  summary.textContent = data ? label : `${label}（暂无数据）`;
  details.appendChild(summary);
  if (data) {
    const pre = document.createElement("pre");
    pre.className = "mc-lab-raw-pre";
    try { pre.textContent = JSON.stringify(data, null, 2); } catch { pre.textContent = String(data); }
    details.appendChild(pre);
  }
  return details;
}

function renderMemoryLabPanel(title, rows) {
  const panel = mcEl("section", "mc-lab-panel");
  panel.appendChild(mcEl("h2", "mc-section-title", title));
  if (!rows.length) {
    mcRenderEmpty(panel, "暂无本轮数据");
    return panel;
  }
  const list = mcEl("div", "mc-lab-rows");
  rows.forEach(([key, value]) => {
    const row = mcEl("div", "mc-lab-row");
    row.append(mcEl("span", "mc-lab-key", key), mcEl("span", "mc-lab-row-value", value));
    list.appendChild(row);
  });
  panel.appendChild(list);
  return panel;
}

function renderRecallDebugRows(debug) {
  if (!debug) return [];
  const providers = Array.isArray(debug.active_memory_providers) ? debug.active_memory_providers : [];
  const rows = [];

  // 路由决策
  if (debug.topic_route) rows.push(["话题路由", debug.topic_route + (debug.secondary_route ? ` / ${debug.secondary_route}` : "")]);

  // 激活来源
  rows.push(["激活来源", providers.length ? providers.map((p) => MEMORY_PROVIDER_LABELS[p] || p).join("、") : "无"]);

  // 长期记忆（persona_memories）
  if (debug.persona_memories_loaded) {
    const cats = Array.isArray(debug.persona_memories_categories) ? debug.persona_memories_categories.join("、") : "";
    rows.push(["长期记忆", `已加载 ${debug.persona_memories_count ?? 0} 条${cats ? `（${cats}）` : ""}`]);
  } else if (debug.persona_memories_error) {
    rows.push(["长期记忆", `加载失败: ${debug.persona_memories_error}`]);
  }

  // 用户画像
  if (debug.mastodon_profile_loaded) {
    const chars = debug.mastodon_profile_chars ?? 0;
    const tok = debug.mastodon_profile_tokens_estimated ?? 0;
    rows.push(["用户画像", `${chars} 字符 / ~${tok} tokens`]);
  }

  // 项目记忆
  if (debug.project_memory_recalled) {
    const hits = debug.project_memory_hit_count ?? 0;
    const keys = Array.isArray(debug.project_memory_keys) ? debug.project_memory_keys.join("、") : "";
    rows.push(["项目记忆", `已召回 ${hits} 条${keys ? `（${keys}）` : ""}`]);
  } else {
    const reason = debug.project_memory_suppressed_reason || debug.project_memory_reason || "未触发";
    rows.push(["项目记忆", reason]);
  }

  // 写作记忆
  if (debug.writing_memory_recalled) {
    rows.push(["写作记忆", "已召回"]);
  } else {
    rows.push(["写作记忆", debug.writing_memory_reason || "未触发"]);
  }

  // 生活上下文
  if (debug.life_context_recalled) {
    rows.push(["生活上下文", "已召回"]);
  } else {
    rows.push(["生活上下文", debug.life_context_reason || "未触发"]);
  }

  // 关系上下文
  if (debug.relationship_context_recalled) {
    rows.push(["关系上下文", "已召回"]);
  } else {
    rows.push(["关系上下文", debug.relationship_context_reason || "未触发"]);
  }

  // 历史对话
  if (debug.conversation_history_recalled) {
    const hitCount = debug.conversation_history_hit_count ?? 0;
    const convIds = Array.isArray(debug.conversation_history_hit_conversation_ids)
      ? debug.conversation_history_hit_conversation_ids.slice(0, 3).join("、")
      : "";
    rows.push(["历史对话", `${hitCount} 条${convIds ? `（会话: ${convIds}）` : ""}`]);
  } else {
    rows.push(["历史对话", debug.conversation_history_reason || "未触发"]);
  }

  // 时间线
  if (debug.mastodon_timeline_enabled) {
    if (debug.timeline_recalled) {
      const hitKeys = Array.isArray(debug.mastodon_timeline_hit_keys) ? debug.mastodon_timeline_hit_keys.join("、") : "";
      rows.push(["时间线", `${debug.timeline_hit_count ?? 0} 个命中${hitKeys ? `（${hitKeys}）` : ""}`]);
    } else {
      rows.push(["时间线", debug.mastodon_timeline_reason || "未触发"]);
    }
  }

  // 历史档案（openai_archive）
  if (debug.openai_archive_recalled) {
    const hitKeys = Array.isArray(debug.openai_archive_keys) ? debug.openai_archive_keys.join("、") : "";
    rows.push(["历史档案", `${debug.openai_archive_hit_count ?? 0} 条${hitKeys ? `（${hitKeys}）` : ""}`]);
  } else if (debug.openai_archive_loaded === false) {
    rows.push(["历史档案", debug.openai_archive_reason || "未触发"]);
  }

  return rows;
}

function renderAuditRows(audit, loadingStates, errors) {
  loadingStates = loadingStates || {};
  errors = errors || {};
  if (loadingStates.loadingAudit) return [["状态", "审计加载中..."]];
  if (!getMemoryToken() && !audit) return [["状态", "需要记忆口令后显示"]];
  if (errors.auditError && !audit) return [["状态", errors.auditError]];
  if (!audit) return [];

  const rows = [];

  // 快照时间
  if (audit.generated_at) rows.push(["快照时间", mcFormatDateTime(audit.generated_at)]);

  // 总量
  rows.push(["memories", `${audit.memories?.total ?? 0} 条`]);
  rows.push(["instructions", `${audit.instructions?.total ?? 0} 条`]);
  rows.push(["openai_archive", `${audit.openai_archive_entries?.enabled_count ?? 0}/${audit.openai_archive_entries?.total ?? 0} enabled`]);
  rows.push(["persona_profile", `${audit.persona_profile?.enabled_count ?? 0}/${audit.persona_profile?.total ?? 0} enabled`]);

  // memories by_category 分布
  const byCategory = audit.memories?.by_category;
  if (byCategory && typeof byCategory === "object") {
    Object.entries(byCategory).forEach(([cat, data]) => {
      if (data?.count > 0) {
        const originParts = data.origin_distribution
          ? Object.entries(data.origin_distribution)
              .filter(([, n]) => n > 0)
              .map(([origin, n]) => `${origin.slice(0, 12)}:${n}`)
              .join(" ")
          : "";
        rows.push([`  └ ${cat}`, `${data.count} 条${originParts ? `（${originParts}）` : ""}`]);
      }
    });
  }

  // persona_profile rows（最多 3 条预览）
  const profileRows = Array.isArray(audit.persona_profile?.rows) ? audit.persona_profile.rows : [];
  if (profileRows.length) {
    profileRows.slice(0, 3).forEach((r, i) => {
      const preview = r.content_preview ? r.content_preview.slice(0, 40) : r.note || "";
      rows.push([`  画像 ${i + 1}`, `${r.enabled ? "✓" : "✗"} ${preview}`]);
    });
  }

  return rows;
}

function renderRecentLabRows(rows, loadingStates, errors, recentSource) {
  loadingStates = loadingStates || {};
  errors = errors || {};
  if (loadingStates.loadingRecent) return [["状态", "最近沉淀加载中..."]];
  if (errors.recentError) return [["状态", errors.recentError]];
  if (!rows.length) return [];
  const result = [];
  rows.slice(0, 5).forEach((row, index) => {
    const cat = row.category || row.candidate_type || recentSource || "memory";
    const time = mcFormatDateTime(row.created_at || row.promoted_at);
    result.push([`${index + 1}. ${cat}`, time]);

    // status
    if (row.status) result.push(["  状态", row.status]);

    // confidence / sensitivity（candidates 专有字段）
    if (typeof row.confidence === "number") result.push(["  置信度", String(row.confidence)]);
    if (typeof row.sensitivity === "number") result.push(["  敏感度", String(row.sensitivity)]);

    // source_preview
    if (row.source_preview) {
      const preview = String(row.source_preview).slice(0, 80);
      result.push(["  来源摘要", preview.length < String(row.source_preview).length ? `${preview}…` : preview]);
    }
  });
  return result;
}

function renderLabEventRows(debug, audit, recentRows) {
  const rows = [];
  if (debug) {
    rows.push(["本轮召回", `${debug.memory_provider_count ?? 0} 个来源`]);
    if (typeof debug.memory_context_tokens_estimated === "number") {
      rows.push(["构建注入内容", `${debug.memory_context_tokens_estimated} tokens`]);
    }
    if (debug.model) rows.push(["发送请求到 LLM", debug.model]);
  }
  if (audit) rows.push(["审计快照", audit.generated_at ? mcFormatDateTime(audit.generated_at) : "已加载"]);
  if (recentRows.length) rows.push(["最近沉淀", `${recentRows.length} 条`]);
  return rows;
}

async function fetchMemoryCenterJson(path) {
  const res = await memoryFetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function refreshMemoryCenterData() {
  // Delegates to bridge; kept for backwards-compat call sites.
  await mcBridgeRefreshAll();
}

function openMemoryCenter() {
  if (!memoryCenterOverlay) return;
  memoryCenterOverlay.classList.remove("hidden");
  memoryCenterV2State.view = "archive"; // 直接进档案馆，支持 CRUD
  renderMemoryCenterCurrentView();
  refreshMemoryCenterData();
  // 绑定桌面 nav 点击（用 _mcNavBound 标记避免重复绑定）
  if (!memoryCenterOverlay._mcNavBound) {
    memoryCenterOverlay._mcNavBound = true;
    memoryCenterOverlay.addEventListener("click", (e) => {
      const btn = e.target.closest(".mc-nav-item[data-mc-view]");
      if (btn) switchMemoryCenterView(btn.dataset.mcView);
    });
    document.getElementById("mcNavCloseBtn")?.addEventListener("click", () => {
      memoryCenterOverlay.classList.add("hidden");
    });
  }
}

function renderRecentMemoryUpdatesOptimistic(items) {
  if (!Array.isArray(items) || items.length === 0) return;
  memoryCenterV2State.recentSource = "candidates";
  memoryCenterV2State.recentRows = items.concat(memoryCenterV2State.recentRows).slice(0, 5);
  if (!memoryCenterOverlay?.classList.contains("hidden")) renderMemoryCenterCurrentView();
}

async function renderRecentMemoryUpdates() {
  try {
    const userId = window.currentUserId || "";
    const data = await fetchMemoryCenterJson(`?type=recent&userId=${encodeURIComponent(userId)}`);
    memoryCenterV2State.recentSource = data.source || "";
    memoryCenterV2State.recentRows = Array.isArray(data.rows) ? data.rows : [];
    memoryCenterV2State.recentError = "";
  } catch (err) {
    memoryCenterV2State.recentError = err instanceof Error ? err.message : String(err);
  }
  if (!memoryCenterOverlay?.classList.contains("hidden")) renderMemoryCenterCurrentView();
}

document.getElementById("mcBackButton")?.addEventListener("click", () => {
  switchMemoryCenterView("room");
});

// ═════════════════════════════════════════════════════════════════════════════
// 世界书管理
// ═════════════════════════════════════════════════════════════════════════════

// ── Worldbook (moved to modules/worldbook.js) ───────────────────────────────
// ── Toast helper (reuse existing showDialog or fallback) ─────────────────────
// The app uses showDialog(). For non-blocking brief feedback we use it as
// a simple one-button alert. If a lighter toast API exists in the codebase
// we can swap this out, but showDialog is the existing pattern.

function showToast(message, duration = 2800) {
  const el = document.createElement("div");
  el.className = "memory-toast toast-enter";
  el.textContent = message;
  el.addEventListener("click", () => dismiss());
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.remove("toast-enter"));
  const t = setTimeout(dismiss, duration);
  function dismiss() {
    clearTimeout(t);
    el.classList.add("toast-exit");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
  }
}

// ── Service Worker registration ───────────────────────────────────────────────
// SW is disabled on localhost and *.dev.* preview deployments.
// On those hosts we also proactively unregister any previously installed SW
// and clear all spc-shell-* caches so stale assets can't mask fresh deploys.
const _SW_DEV_HOST =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.hostname.includes(".dev.") ||
  location.hostname.includes("dev.");

async function _cleanupSwAndCaches() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("spc-shell")).map((k) => caches.delete(k))
      );
    }
    console.info("[SW] unregistered and stale caches cleared");
  } catch (err) {
    console.warn("[SW] cleanup failed:", err);
  }
}

if (_SW_DEV_HOST) {
  // Dev / preview: tear down any existing SW so we always load fresh files.
  _cleanupSwAndCaches();
} else if ("serviceWorker" in navigator) {
  // Production: register the cleanup SW which will unregister itself after
  // deleting all caches. Re-enable a real caching SW in a future PR.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[SW] registration failed:", err);
    });
  });
}

// ── Diary Module Initialization ──────────────────────────────────────────────

// Update Home diary card on page load and start auto-schedule checker
window.addEventListener("load", () => {
  if (supabaseClient && window.SPDiary) {
    window.SPDiary.updateHomeDiaryCard(supabaseClient, window.currentUserId || 'default')
      .catch(err => console.error('Failed to update diary card:', err));
    window.SPDiary.initDiaryScheduler();
  }

  // ── G's Eyes Status Monitor ──────────────────────────────────────────────────
  // Update Video Call status display in chat more panel every 2 seconds
  setInterval(() => {
    const valSpan = document.getElementById("cmsVideoCallVal");
    if (valSpan && window.VideoCall) {
      const isActive = window.VideoCall.isActive();
      valSpan.textContent = isActive ? "运行中" : "已关闭";
    }
  }, 2000);
});

// ── V2 Composer (Plus Panel & Emoji Button) ──────────────────────────────────

/**
 * Show voice call loading page with heartbeat/ripple animation
 */
function showVoiceCallLoadingPage() {
  const overlay = document.createElement('div');
  overlay.className = 'voice-call-overlay';
  overlay.innerHTML = `
    <div class="voice-call-container">
      <div class="heartbeat-pulse"></div>
      <p>正在连接通话服务...</p>
      <button type="button" class="voice-call-cancel" aria-label="取消">取消</button>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('.voice-call-cancel')?.addEventListener('click', () => {
    overlay.remove();
  });

  // 自动移除（预留：未来可以链接真实的 tts 和语音通话）
  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.remove();
    }
  }, 3000);
}

function initV2Composer() {
  const plusButton = document.getElementById("composerMenuBtn");
  const inputBar = document.getElementById("chatForm");
  if (!plusButton || !inputBar) return;

  let emojiButton = document.getElementById("emojiButton");
  if (!emojiButton) {
    emojiButton = document.createElement("button");
    emojiButton.id = "emojiButton";
    emojiButton.type = "button";
    emojiButton.className = "ghost-icon-btn v2-emoji-btn";
    emojiButton.title = "Emoji";
    emojiButton.setAttribute("aria-label", "Emoji");
    emojiButton.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.5"/><circle cx="6.5" cy="8" r="1" fill="currentColor"/><circle cx="11.5" cy="8" r="1" fill="currentColor"/><path d="M6 11c.7 1.2 1.8 2 3 2s2.3-.8 3-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    inputBar.insertBefore(emojiButton, plusButton);
  }

  // Wire up emoji button
  emojiButton.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    openEmojiPanel();
  }, true);

  plusButton.innerHTML = '<img src="assets/icons/chat/plus.svg" alt="">';
  plusButton.title = "更多";
  plusButton.setAttribute("aria-label", "更多");

  let panel = null;
  const closePanel = () => {
    if (panel) {
      panel.remove();
      panel = null;
      plusButton.classList.remove("active");
      document.querySelector(".chat-shell")?.classList.remove("plus-panel-open");
      // 清理动态注入的面板高度变量
      document.documentElement.style.removeProperty('--plus-panel-h');
      if (_chatInputMode !== "plain") {
        _chatInputMode = "plain";
      }
      maintainBottomAnchor("close-panel");
    }
  };
  window.closeV2PlusPanel = closePanel;

  function addPanelItem(group, { label, desc, icon, onClick, disabled = false }) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "plus-panel-item";
    item.disabled = Boolean(disabled);
    item.innerHTML = `<span class="plus-panel-icon">${icon}</span><span><strong>${label}</strong><small>${desc}</small></span>`;
    item.addEventListener("click", () => {
      closePanel();
      onClick?.();
    });
    group.appendChild(item);
  }

  function openPanel() {
    closeStatusPanel();
    closePanel();
    // Close emoji panel if open (mutual exclusion)
    if (typeof window.closeEmojiPanel === "function") window.closeEmojiPanel();
    // Dismiss the soft keyboard cleanly so the plus panel takes its place,
    // preventing the composer from drifting with the keyboard-close animation.
    if (messageInput && document.activeElement === messageInput) {
      messageInput.blur();
    }
    // Force a clean non-keyboard state immediately so --dock-gap resolves to
    // the stable baseline instead of --kb+10 during the keyboard-close window.
    document.querySelector(".layout")?.classList.remove("keyboard-open");
    document.documentElement.style.setProperty("--kb", "0px");
    document.documentElement.style.setProperty("--keyboard-inset", "0px");
    panel = document.createElement("div");
    panel.className = "plus-panel";

    const actions = document.createElement("div");
    actions.className = "plus-panel-grid";

    // Voice call
    addPanelItem(actions, {
      label: "语音电话",
      desc: "通话服务",
      icon: '<img src="assets/icons/others/voice-call.svg" alt="">',
      onClick: () => {
        closePanel();
        // 显示心跳/水波纹加载页面，链接 tts 和语音通话
        showVoiceCallLoadingPage();
      },
      disabled: false,
    });

    addPanelItem(actions, {
      label: "视频聊天",
      desc: "语音+视频交互",
      icon: '<span>◉</span>',
      onClick: async () => {
        closePanel();
        setTimeout(async () => {
          if (window.VideoCall && typeof window.VideoCall.start === "function") {
            await window.VideoCall.start();
          } else {
            console.error("[app] VideoCall module not available");
            showDialog({
              title: "视频聊天不可用",
              body: "VideoCall 模块未加载",
              confirmLabel: "知道了",
            });
          }
        }, 300);
      },
    });

    addPanelItem(actions, {
      label: "图片",
      desc: "相册或文件",
      icon: '<span>＋</span>',
      onClick: () => {
        if (isMobileLayout()) {
          showImageBottomSheet();
        } else {
          imageInput.value = "";
          imageInput.click();
        }
      },
    });
    addPanelItem(actions, {
      label: "戳一下",
      desc: "让 Cha 接话",
      icon: '<img src="assets/icons/chat/poke.svg" alt="">',
      disabled: isReplying || !chatMessages.length,
      onClick: () => triggerReply("forced"),
    });
    panel.appendChild(actions);

    // Game shortcuts intentionally live in Game Center, not the chat “+” panel.

    // 浮模式：append 到 chat-shell，加 plus-panel-open class（和 emoji 一致）
    const chatShell = document.querySelector(".chat-shell");
    (chatShell || inputBar.parentNode).appendChild(panel);
    chatShell?.classList.add("plus-panel-open");
    plusButton.classList.add("active");
    setChatInputMode("plain"); // plus-panel is not a keyboard-replacement state

    // 记录打开前是否在底部
    const wasNearBottom = isNearBottom();

    requestAnimationFrame(() => {
      panel.classList.add("open");

      // 测量面板实际高度，注入 CSS 变量用于 padding 计算
      const panelHeight = panel.offsetHeight;
      if (panelHeight > 0) {
        document.documentElement.style.setProperty('--plus-panel-h', `${panelHeight + 12}px`);
      }

      // 只在原本就在底部时才跟随滚动
      if (wasNearBottom) {
        scrollChatToLatest();
      }
    });
  }

  plusButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    panel ? closePanel() : openPanel();
  }, true);

  messageInput?.addEventListener("focus", closePanel);

  document.addEventListener("click", (event) => {
    if (!panel) return;
    if (panel.contains(event.target) || plusButton.contains(event.target)) return;
    closePanel();
  });
}

// ── App Initialization ───────────────────────────────────────────────────────

initV2Shell();
initV2Composer();
initInputKeyboardHints();
initKeyboardViewportState();
initStableShellHeight();
initVisualVh();

// Initialize voice module
if (window.SPVoice) {
  window.SPVoice.initVoice();
}

// Voice input button handler - opens voice input dialog
if (voiceInputBtn) {
  voiceInputBtn.addEventListener("click", async () => {
    if (!window.SPVoiceMessage) {
      alert("语音消息模块未加载");
      return;
    }

    try {
      const result = await window.SPVoiceMessage.showVoiceInputDialog();
      // result: { text: string, audioType: "fake", duration: number }

      // Send as voice message
      await sendVoiceMessage(result.text, result.audioType, result.duration);
    } catch (err) {
      // User cancelled or error
      console.log("Voice input cancelled or failed:", err);
    }
  });
}

// Start loading emoji catalog in the background — never blocks UI
window.SPEmoji.loadEmojiCatalog().catch(err => console.warn("[emoji] catalog load error:", err));

// Shortcode emoji suggestion bar (moved to modules/emoji-suggestions.js)
window.SPEmojiSuggestions.initEmojiSuggestionBar();

// ── Chat Transformation Integration ──────────────────────────────────────────

// Initialize contact manager and chat navigation
if (window.ContactManager) {
  window.ContactManager.init();
}

if (window.ChatNavigation) {
  window.ChatNavigation.init();
}

// Composer state for mic/send toggle
const composerState = {
  hasText: false,
  hasImage: false,
  hasQuote: false,
  hasAttachment: false
};

function updateComposerButtons() {
  const hasSendable = composerState.hasText ||
                      composerState.hasImage ||
                      composerState.hasQuote ||
                      composerState.hasAttachment;

  const micBtn = document.getElementById('voiceInputBtn');
  const sendBtn = document.getElementById('sendButton');

  if (hasSendable) {
    micBtn?.classList.add('hidden');
    sendBtn?.classList.remove('hidden');
  } else {
    micBtn?.classList.remove('hidden');
    sendBtn?.classList.add('hidden');
  }
}

// Hook into message input
if (messageInput) {
  const originalInputListener = messageInput.oninput;
  messageInput.addEventListener('input', () => {
    composerState.hasText = messageInput.value.trim().length > 0;
    updateComposerButtons();
  });
}

// Export for other modules to use
window.updateComposerState = function(updates) {
  Object.assign(composerState, updates);
  updateComposerButtons();
};

// ── Contact List Page Rendering ──────────────────────────────────────────────

async function renderChatContactsList() {
  const contactsList = document.getElementById('chatContactsList');
  if (!contactsList || !window.ContactManager) return;

  const contacts = await window.ContactManager.getContactList();

  contactsList.innerHTML = '';

  for (const contact of contacts) {
    const row = document.createElement('div');
    row.className = 'contact-row';
    row.dataset.contactId = contact.id;

    // Avatar
    const avatar = document.createElement('img');
    avatar.className = 'contact-avatar';
    avatar.src = contact.avatar || 'assets/avatars/cha.png';
    avatar.alt = contact.nickname;

    // Info column
    const info = document.createElement('div');
    info.className = 'contact-info';

    const nameRow = document.createElement('div');
    nameRow.className = 'contact-name-row';

    const name = document.createElement('span');
    name.className = 'contact-name';
    name.textContent = contact.nickname;

    const statusDot = document.createElement('span');
    statusDot.className = 'online-dot';
    if (contact.status !== 'online') {
      statusDot.style.display = 'none';
    }

    nameRow.appendChild(name);
    nameRow.appendChild(statusDot);

    const preview = document.createElement('div');
    preview.className = 'contact-preview';
    preview.textContent = contact.lastMessage || '开始聊天...';

    info.appendChild(nameRow);
    info.appendChild(preview);

    // Meta column
    const meta = document.createElement('div');
    meta.className = 'contact-meta';

    const time = document.createElement('span');
    time.className = 'contact-time';
    time.textContent = contact.lastMessageTime || '';

    meta.appendChild(time);

    if (contact.unreadCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'contact-unread-badge';
      badge.textContent = contact.unreadCount;
      meta.appendChild(badge);
    }

    row.appendChild(avatar);
    row.appendChild(info);
    row.appendChild(meta);

    // Click handler
    row.addEventListener('click', () => enterChatDetailForContact(contact.id));

    contactsList.appendChild(row);
  }
}

async function enterChatDetailForContact(contactId) {
  if (!window.ContactManager || !window.ChatNavigation) return;

  const convId = window.ContactManager.getChatThreadForContact(contactId);
  if (convId) {
    setActiveConversationId(convId);
  }

  window.ChatNavigation.navigateToChatPage('chat-detail');

  // Update top bar with contact info
  updateChatDetailTopBar(contactId);

  // Reload history
  await reloadHistory();
  scrollToBottom(messageList);
  markReadByUser();
}

function updateChatDetailTopBar(contactId) {
  if (!window.ContactManager) return;

  const contact = window.ContactManager.getContactById(contactId);
  if (!contact) return;

  const nameEl = document.querySelector('.chat-detail-name');
  const dotEl = document.querySelector('.chat-detail-contact-btn .online-dot');

  if (nameEl) {
    nameEl.textContent = contact.nickname;
  }

  if (dotEl) {
    dotEl.style.display = contact.status === 'online' ? 'block' : 'none';
  }
}

// ── Chat Detail Navigation ───────────────────────────────────────────────────

const chatDetailBackBtn = document.getElementById('chatDetailBackBtn');
const chatDetailContactBtn = document.getElementById('chatDetailContactBtn');

if (chatDetailBackBtn) {
  chatDetailBackBtn.addEventListener('click', () => {
    if (window.ChatNavigation) {
      window.ChatNavigation.navigateToChatPage('chat-contacts');
    }
  });
}

if (chatDetailContactBtn) {
  chatDetailContactBtn.addEventListener('click', () => {
    if (window.ChatNavigation) {
      window.ChatNavigation.navigateToChatPage('contact-profile', { contactId: 'cha' });
    }
  });
}

// ── Contact Profile Page ──────────────────────────────────────────────────────

function loadContactProfilePage(contactId) {
  if (!window.ContactManager) return;

  const contact = window.ContactManager.getContactById(contactId);
  if (!contact) return;

  // Update profile fields
  const nicknameEl = document.getElementById('profileNickname');
  const nicknameCalledEl = document.getElementById('profileNicknameCalled');
  const introEl = document.getElementById('profileIntro');
  const statusEl = document.getElementById('profileStatus');
  const avatarBtn = document.getElementById('profileAvatarBtn');

  if (nicknameEl) nicknameEl.textContent = contact.nickname;
  if (nicknameCalledEl) nicknameCalledEl.textContent = contact.nicknameCalled;
  if (introEl) introEl.textContent = contact.intro;
  if (statusEl) statusEl.textContent = contact.status === 'online' ? '在线' : '离线';

  if (avatarBtn) {
    avatarBtn.style.backgroundImage = `url(${contact.avatar})`;
  }

  // Update hints
  const notesHint = document.getElementById('profileNotesHint');
  const chatBgHint = document.getElementById('profileChatBgHint');

  if (notesHint) {
    notesHint.textContent = contact.notes || '未设置';
  }

  if (chatBgHint) {
    // Read directly from Settings storage key so they stay in sync
    const hasChatBg = !!localStorage.getItem('ui_custom_chat_background');
    chatBgHint.textContent = hasChatBg ? '已自定义' : '默认';
  }
}

// Profile back button
const contactProfileBackBtn = document.getElementById('contactProfileBackBtn');
if (contactProfileBackBtn) {
  contactProfileBackBtn.addEventListener('click', () => {
    if (window.ChatNavigation) {
      window.ChatNavigation.navigateToChatPage('chat-detail');
    }
  });
}

// Profile edit buttons
document.querySelectorAll('.profile-edit-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const row = e.target.closest('.profile-info-row');
    if (!row) return;

    const field = row.dataset.field;
    const label = row.querySelector('.profile-label')?.textContent || '字段';
    const currentValue = row.querySelector('.profile-value')?.textContent || '';

    showDialog({
      title: `编辑${label}`,
      input: currentValue,
      confirmLabel: '确定',
      onConfirm: (newValue) => {
        if (!window.ContactManager) return;

        const updates = {};

        if (field === 'nickname') {
          updates.nickname = newValue;
        } else if (field === 'nicknameCalled') {
          updates.nicknameCalled = newValue;
        } else if (field === 'intro') {
          updates.intro = newValue;
        } else if (field === 'status') {
          updates.status = newValue === '在线' ? 'online' : 'offline';
        }

        window.ContactManager.updateContactMetadata('cha', updates);
        loadContactProfilePage('cha');
        updateChatDetailTopBar('cha');
      }
    });
  });
});

// Profile clear history button
const profileClearHistoryBtn = document.getElementById('profileClearHistoryBtn');
if (profileClearHistoryBtn) {
  profileClearHistoryBtn.addEventListener('click', () => {
    showDialog({
      title: '清空聊天记录',
      body: '确定要清空与 Cha 的所有聊天记录吗？此操作不可撤销。',
      confirmLabel: '清空',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        const convId = getActiveConversationId();
        if (!convId) return;

        await supabaseClient.from('messages').delete().eq('conversation_id', convId);
        chatMessages.length = 0;
        renderWelcomeMessage();

        if (window.ChatNavigation) {
          window.ChatNavigation.navigateToChatPage('chat-detail');
        }
      }
    });
  });
}

// Profile notes button
const profileNotesBtn = document.getElementById('profileNotesBtn');
if (profileNotesBtn) {
  profileNotesBtn.addEventListener('click', () => {
    if (!window.ContactManager) return;
    const contact = window.ContactManager.getContactById('cha');
    showDialog({
      title: '备注',
      input: contact?.notes || '',
      confirmLabel: '保存',
      onConfirm: (newValue) => {
        window.ContactManager.updateContactMetadata('cha', { notes: newValue.trim() });
        loadContactProfilePage('cha');
      }
    });
  });
}

// Profile chat background button — syncs with ui_custom_chat_background (Settings)
const profileChatBgBtn = document.getElementById('profileChatBgBtn');
if (profileChatBgBtn) {
  profileChatBgBtn.addEventListener('click', async () => {
    // Direct file upload for chat background (shares ui_custom_chat_background with Settings)
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      // Validate type: JPEG, PNG, WebP, GIF only
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        if (typeof showToast === 'function') {
          showToast('仅支持 JPEG、PNG、WebP、GIF 格式');
        }
        fileInput.remove();
        return;
      }

      // Validate size: max 10MB for backgrounds
      if (file.size > 10 * 1024 * 1024) {
        if (typeof showToast === 'function') {
          showToast('图片不能超过 10MB');
        }
        fileInput.remove();
        return;
      }

      try {
        // Compress and save
        const dataUrl = await compressImage(file);
        localStorage.setItem('ui_custom_chat_background', dataUrl);

        // Update hint text in profile page
        const hintEl = document.getElementById('profileChatBgHint');
        if (hintEl) hintEl.textContent = '已自定义';

        // Apply to chat shell immediately
        const chatShell = document.querySelector('.chat-shell');
        if (chatShell) {
          chatShell.style.backgroundImage = `url(${dataUrl})`;
          chatShell.style.backgroundSize = 'cover';
          chatShell.style.backgroundPosition = 'center';
          chatShell.style.backgroundRepeat = 'no-repeat';
        }

        if (typeof showToast === 'function') {
          showToast('聊天背景已更新');
        }
      } catch (err) {
        console.error('Failed to set chat background:', err);
        if (typeof showToast === 'function') {
          showToast('背景图片处理失败，请重试');
        }
      }

      fileInput.remove();
    });

    document.body.appendChild(fileInput);
    fileInput.click();
  });
}

// ── Bottom Tab Chat Integration ──────────────────────────────────────────────

// Listen for page activation and show chat detail when chat page becomes active
(function initChatPageObserver() {
  const chatPage = document.querySelector('.v2-page--chat');
  if (!chatPage) {
    console.warn('[Chat] Chat page not found, will retry...');
    setTimeout(initChatPageObserver, 100);
    return;
  }

  function ensureChatDetailShown() {
    if (chatPage.classList.contains('v2-active')) {
      const currentChatPage = window.ChatNavigation?.getCurrentChatPage();
      // Always show chat detail when chat page is active, unless explicitly on another subpage
      if (!currentChatPage || currentChatPage === 'chat-contacts') {
        console.log('[Chat] Navigating to chat detail');
        if (window.ChatNavigation) {
          window.ChatNavigation.navigateToChatPage('chat-detail');
          // Also update top bar
          if (window.updateChatDetailTopBar) {
            window.updateChatDetailTopBar('cha');
          }
        }
      }
    }
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        ensureChatDetailShown();
      }
    });
  });

  observer.observe(chatPage, { attributes: true });

  // Also call immediately in case page is already active
  ensureChatDetailShown();

  console.log('[Chat] Page observer initialized');
})();


// ── Search Contact Functionality ─────────────────────────────────────────────

const chatContactsSearchBtn = document.getElementById('chatContactsSearchBtn');
const chatContactsSearch = document.getElementById('chatContactsSearch');
const contactSearchInput = document.getElementById('contactSearchInput');

if (chatContactsSearchBtn && chatContactsSearch) {
  chatContactsSearchBtn.addEventListener('click', () => {
    chatContactsSearch.classList.toggle('hidden');
    if (!chatContactsSearch.classList.contains('hidden')) {
      contactSearchInput?.focus();
    }
  });
}

if (contactSearchInput) {
  contactSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const rows = document.querySelectorAll('.contact-row');

    rows.forEach(row => {
      const name = row.querySelector('.contact-name')?.textContent.toLowerCase() || '';
      const preview = row.querySelector('.contact-preview')?.textContent.toLowerCase() || '';

      if (name.includes(query) || preview.includes(query)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  });
}

// Export functions for global use
window.renderChatContactsList = renderChatContactsList;
window.loadContactProfilePage = loadContactProfilePage;
window.updateChatDetailTopBar = updateChatDetailTopBar;

// Initialize on page load
updateComposerButtons();

// ── 全局禁用原生长按菜单 ──────────────────────────────────────────────────
// 禁用所有区域的原生 contextmenu（包括 chat、bar、其他界面）
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  e.stopPropagation();
  return false;
}, { capture: true });

// ── Game Status Updates ────────────────────────────────────────────────────

async function updateGameStatus() {
  if (!window.supabaseClient || !window.currentUserId) return;

  try {
    // Query active game session
    const { data: sessions, error } = await window.supabaseClient
      .from("game_sessions")
      .select("*")
      .eq("user_id", window.currentUserId)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[game-status] Query error:", error);
      return;
    }

    const rawSession = sessions && sessions.length > 0 ? sessions[0] : null;
    const displayName = rawSession
      ? (rawSession.game_display_name || rawSession.game_name || rawSession.game || rawSession.game_type || "")
      : "";
    const session = rawSession && displayName ? rawSession : null;
    if (rawSession && !displayName) {
      console.warn("[game-status] Ignoring active session without a game name", {
        sessionId: rawSession.id || null,
      });
    }

    // Update Home page card
    const homeCard = document.getElementById("gameStatusCard");
    if (homeCard) {
      if (session) {
        homeCard.classList.remove("hidden");
        const gameStatusText = document.getElementById("gameStatusText");
        const gameStatusTime = document.getElementById("gameStatusTime");
        
        if (gameStatusText) {
          const actionCount = session.action_count || 0;
          gameStatusText.textContent = `正在玩${displayName}，已经进行了 ${actionCount} 步`;
        }
        
        if (gameStatusTime) {
          const duration = Date.now() - new Date(session.started_at).getTime();
          gameStatusTime.textContent = formatDuration(duration);
        }
      } else {
        homeCard.classList.add("hidden");
      }
    }

    // Update Chat page status bar
    const chatStatus = document.getElementById("chaGameStatus");
    if (chatStatus) {
      if (session) {
        chatStatus.classList.remove("hidden");
        const chatStatusText = document.getElementById("chaGameStatusText");
        
        if (chatStatusText) {
          chatStatusText.textContent = `正在玩${displayName}...`;
        }
      } else {
        chatStatus.classList.add("hidden");
      }
    }
  } catch (err) {
    console.error("[game-status] Update error:", err);
  }
}

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) {
    return `${minutes}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}小时${remainingMinutes}分钟` : `${hours}小时`;
}

// Update game status periodically
setInterval(updateGameStatus, 30000); // Every 30 seconds

// Update on page visibility change
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    updateGameStatus();
  }
});

// Initial update
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", updateGameStatus);
} else {
  updateGameStatus();
}
