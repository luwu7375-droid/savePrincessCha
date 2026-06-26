// ============================================================================
// Conversation Manager Module - Conversation CRUD & Sidebar
// ============================================================================
// Extracted from app.js lines 305-527
// Handles conversation list, switching, creation, deletion, and sidebar UI

(function() {
  "use strict";

// ── Conversations (Supabase) ──────────────────────────────────────────────────

// In-memory cache of the conversation list for the current session
let conversationsCache = [];

function getActiveConversationId() {
  return localStorage.getItem("active_conversation_id");
}

function setActiveConversationId(id) {
  localStorage.setItem("active_conversation_id", id);
}

async function loadConversationsFromDB() {
  const { data, error } = await supabaseClient
    .from("conversations")
    .select("id, title, pinned, created_at, updated_at")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) { console.error("加载会话列表失败：", error); return []; }
  return data || [];
}

async function initConversations() {
  conversationsCache = await loadConversationsFromDB();

  // Warn if old localStorage conversations exist
  const oldConvs = (() => { try { return JSON.parse(localStorage.getItem("conversations") || "[]"); } catch { return []; } })();
  if (oldConvs.length > 0 && conversationsCache.length === 0) {
    showLegacyDataNotice();
  }

  // Ensure active conversation is valid
  let activeId = getActiveConversationId();
  if (!activeId || !conversationsCache.find(c => c.id === activeId)) {
    if (conversationsCache.length > 0) {
      activeId = conversationsCache[0].id;
    } else {
      // No conversations at all — create one
      activeId = await createConversation("新会话");
    }
    setActiveConversationId(activeId);
  }

  renderConvList();
  return activeId;
}

async function createConversation(title) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { data, error } = await supabaseClient
    .from("conversations")
    .insert({ title, user_id: user.id })
    .select("id, title, pinned, created_at")
    .single();
  if (error) { console.error("创建会话失败：", error); return null; }
  conversationsCache.unshift(data);
  return data.id;
}

async function updateConvTitle(id, firstUserMessage) {
  const conv = conversationsCache.find(c => c.id === id);
  if (!conv || conv.title !== "新会话" || !firstUserMessage) return;
  const title = firstUserMessage.slice(0, 20);
  conv.title = title;
  renderConvList();
  await supabaseClient.from("conversations").update({ title }).eq("id", id);
}

function renderConvList() {
  const activeId = getActiveConversationId();
  convList.innerHTML = "";
  for (const conv of conversationsCache) {
    const li = document.createElement("li");
    if (conv.pinned) li.classList.add("pinned");
    if (conv.id === activeId) li.classList.add("active");

    const titleRow = document.createElement("div");
    titleRow.className = "conv-title-row";

    const title = document.createElement("span");
    title.className = "conv-title";
    title.textContent = conv.title || "新会话";
    title.addEventListener("click", () => switchConversation(conv.id));

    const timeEl = document.createElement("span");
    timeEl.className = "conv-time";
    timeEl.textContent = formatConvTime(conv.updated_at || conv.created_at);

    titleRow.appendChild(title);
    titleRow.appendChild(timeEl);

    const menuBtn = document.createElement("button");
    menuBtn.className = "conv-menu-btn";
    menuBtn.type = "button";
    menuBtn.textContent = "···";
    menuBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    menuBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openConvMenu(conv.id, menuBtn);
    });

    li.appendChild(titleRow);
    li.appendChild(menuBtn);
    li.addEventListener("click", () => switchConversation(conv.id));
    convList.appendChild(li);
  }
}

let activeMenu = null;

function closeActiveMenu() {
  if (activeMenu) { activeMenu.remove(); activeMenu = null; }
}

function openConvMenu(id, anchor) {
  closeActiveMenu();
  const conv = conversationsCache.find(c => c.id === id);
  const menu = document.createElement("div");
  menu.className = "conv-menu";

  const actions = [
    { label: "重命名", fn: () => renameConv(id) },
    { label: conv?.pinned ? "取消置顶" : "置顶", fn: () => pinConv(id) },
    { label: "抹掉", fn: () => deleteConv(id), danger: true },
  ];

  for (const a of actions) {
    const btn = document.createElement("button");
    btn.textContent = a.label;
    if (a.danger) btn.classList.add("danger");
    btn.addEventListener("click", (e) => { e.stopPropagation(); closeActiveMenu(); a.fn(); });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  activeMenu = menu;

  const rect = anchor.getBoundingClientRect();
  const menuW = menu.offsetWidth || 120;
  const menuH = menu.offsetHeight || 110;
  const margin = 6;
  let top = rect.bottom + 4;
  let left = rect.left - menuW + anchor.offsetWidth;
  // Clamp to viewport
  left = Math.max(margin, Math.min(left, window.innerWidth - menuW - margin));
  top  = Math.max(margin, Math.min(top,  window.innerHeight - menuH - margin));
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  setTimeout(() => document.addEventListener("click", closeActiveMenu, { once: true }), 0);
}

function renameConv(id) {
  const conv = conversationsCache.find(c => c.id === id);
  if (!conv) return;
  showDialog({
    title: "重命名会话",
    input: conv.title || "新会话",
    confirmLabel: "确定",
    onConfirm: async (name) => {
      const title = name || "新会话";
      conv.title = title;
      renderConvList();
      await supabaseClient.from("conversations").update({ title }).eq("id", id);
    }
  });
}

async function pinConv(id) {
  const conv = conversationsCache.find(c => c.id === id);
  if (!conv) return;
  conv.pinned = !conv.pinned;
  conversationsCache.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  renderConvList();
  await supabaseClient.from("conversations").update({ pinned: conv.pinned }).eq("id", id);
}

async function deleteConv(id) {
  showDialog({
    title: "抹掉这段？",
    body: "这段记录会从这里消失。",
    confirmLabel: "抹掉",
    confirmClass: "btn-danger",
    onConfirm: async () => {
      conversationsCache = conversationsCache.filter(c => c.id !== id);
      await supabaseClient.from("messages").delete().eq("conversation_id", id);
      await supabaseClient.from("conversations").delete().eq("id", id);

      if (getActiveConversationId() === id) {
        if (conversationsCache.length) {
          setActiveConversationId(conversationsCache[0].id);
          await reloadHistory();
        } else {
          const newId = await createConversation("新会话");
          setActiveConversationId(newId);
          chatMessages.length = 0;
          renderWelcomeMessage();
        }
      }
      renderConvList();
    }
  });
}

async function switchConversation(id) {
  if (window.matchMedia("(max-width: 820px)").matches) closeMobileSidebar();
  // Cancel any in-progress message edit to avoid carrying state to another conversation

  // Stop TTS playback when switching conversations
  if (window.SPVoice) window.SPVoice.stopSpeaking();
  if (composerEditMode === "edit") exitEditMessageMode({ restoreDraft: false });
  setActiveConversationId(id);
  _conversationStartedAt = null; // reset for new conversation context
  chatRenderState.renderedConversationId = null; // force full re-render
  renderConvList();
  await reloadHistory();
}


  // ── Public API ────────────────────────────────────────────────────────────
  window.SavePrincessConversations = {
    initConversations,
    createConversation,
    switchConversation,
    getActiveConversationId,
    setActiveConversationId,
    renderConvList,
  };

  // ── Legacy global aliases (for backward compatibility) ────────────────────
  window.conversationsCache = conversationsCache;
  window.getActiveConversationId = getActiveConversationId;
  window.setActiveConversationId = setActiveConversationId;
  window.initConversations = initConversations;
  window.createConversation = createConversation;
  window.switchConversation = switchConversation;
  window.renderConvList = renderConvList;

})();
