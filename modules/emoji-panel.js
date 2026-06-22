// ── modules/emoji-panel.js ────────────────────────────────────────────────────
// Emoji bottom-sheet panel: open/close, tabs, search, rendering.
// Exposes: window.SPEmojiPanel.openEmojiPanel, window.SPEmojiPanel.closeEmojiPanel
// Depends on: emoji-catalog.js, emoji-lexicon.js (window.SPEmoji.*)
//             app.js globals: scrollChatToLatest, insertTextAtCursor, messageList

(function () {
  "use strict";

  let _emojiPanelOpen = false;
  let _emojiPanelMode = "browse"; // "browse" | "search"

  // ── Helpers ───────────────────────────────────────────────────────────────

  function makeEmptyNotice(text) {
    const div = document.createElement("div");
    div.className = "emoji-empty";
    div.textContent = text;
    return div;
  }

  function makeEmojiItem(emoji, opts) {
    opts = opts || {};
    const { emojiCatalog, pickInsertToken, recordEmojiUsed } = window.SPEmoji;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = opts.inSearchMode ? "emoji-search-result-item" : "emoji-item";
    btn.title = emoji.shortcode;
    btn.setAttribute("aria-label", emoji.shortcode);

    const img = document.createElement("img");
    img.src = emoji.staticUrl || emoji.url;
    img.alt = emoji.shortcode;
    img.className = opts.inSearchMode ? "emoji-search-result-img" : "emoji-item-img";
    img.loading = "lazy";
    btn.appendChild(img);

    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    btn.addEventListener("click", () => {
      const token = pickInsertToken(emoji);
      insertTextAtCursor(token + " ");
      recordEmojiUsed(emoji.id);
      closeEmojiPanel();
      scrollChatToLatest();
    });

    return btn;
  }

  function renderKaomojiTab(container, query) {
    const KAOMOJI_LIST = window.SPEmoji.KAOMOJI_LIST;
    const list = query
      ? KAOMOJI_LIST.filter(k => k.includes(query))
      : KAOMOJI_LIST;
    if (!list.length) {
      container.appendChild(makeEmptyNotice("没有匹配的颜文字"));
      return;
    }
    const grid = document.createElement("div");
    grid.className = "emoji-grid emoji-grid--kaomoji";
    list.forEach(kao => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-item emoji-item--kaomoji";
      btn.textContent = kao;
      btn.title = kao;
      btn.addEventListener("click", () => {
        insertTextAtCursor(kao);
        closeEmojiPanel();
        scrollChatToLatest();
      });
      grid.appendChild(btn);
    });
    container.appendChild(grid);
  }

  function renderStoredEmojiTab(container, storageKey, query, emptyLabel, isFavorite) {
    const { emojiCatalog, filterEmojis } = window.SPEmoji;
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch (_) {}
    if (!Array.isArray(ids)) ids = [];

    let emojis = ids
      .map(id => emojiCatalog.byId[id])
      .filter(Boolean);

    if (query) emojis = filterEmojis(emojis, query);

    if (!emojis.length) {
      container.appendChild(makeEmptyNotice(query ? "没有匹配结果" : `暂无${emptyLabel}`));
      return;
    }

    const grid = document.createElement("div");
    grid.className = "emoji-grid";
    emojis.forEach(emoji => {
      grid.appendChild(makeEmojiItem(emoji, { isFavorite, storageKey }));
    });
    container.appendChild(grid);
  }

  function renderFrequentTab(container, query) {
    const { emojiCatalog, filterEmojis, EMOJI_FREQUENCY_KEY } = window.SPEmoji;
    let freq = {};
    try { freq = JSON.parse(localStorage.getItem(EMOJI_FREQUENCY_KEY) || "{}"); } catch (_) {}

    let emojis = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80)
      .map(([id]) => emojiCatalog.byId[id])
      .filter(Boolean);

    if (query) emojis = filterEmojis(emojis, query);

    if (!emojis.length) {
      container.appendChild(makeEmptyNotice(query ? "没有匹配结果" : "还没有常用记录"));
      return;
    }

    const grid = document.createElement("div");
    grid.className = "emoji-grid";
    emojis.forEach(emoji => grid.appendChild(makeEmojiItem(emoji)));
    container.appendChild(grid);
  }

  function renderPacksTab(container, query) {
    const { emojiCatalog, filterEmojis, loadEmojiCatalog } = window.SPEmoji;
    if (!emojiCatalog.loaded) {
      const notice = makeEmptyNotice("表情包加载中…");
      container.appendChild(notice);
      loadEmojiCatalog().then(() => {
        if (document.getElementById("emojiPanel")) {
          renderTabContent(container, "packs", query);
        }
      });
      return;
    }

    if (emojiCatalog.loadError === "all sources failed, no cache available") {
      container.appendChild(makeEmptyNotice("表情包加载失败，请检查网络后重试"));
      return;
    }

    const packIds = Object.keys(emojiCatalog.byPackId).sort();
    if (!packIds.length) {
      container.appendChild(makeEmptyNotice("暂无表情包"));
      return;
    }

    const allEmojis = [];
    packIds.forEach(packId => {
      const inPack = emojiCatalog.byPackId[packId] || [];
      const filtered = query ? filterEmojis(inPack, query) : inPack;
      allEmojis.push(...filtered);
    });

    if (!allEmojis.length) {
      container.appendChild(makeEmptyNotice("没有匹配结果"));
      return;
    }

    const catOrder = [];
    const catSet = new Set();
    allEmojis.forEach(e => {
      const cat = e.category || "其他";
      if (!catSet.has(cat)) { catSet.add(cat); catOrder.push(cat); }
    });

    const rail = document.createElement("div");
    rail.className = "emoji-cat-rail";

    const gridWrap = document.createElement("div");
    gridWrap.className = "emoji-packs-grid-wrap";

    function renderGrid(cat) {
      gridWrap.innerHTML = "";
      const emojis = cat === null
        ? allEmojis
        : allEmojis.filter(e => (e.category || "其他") === cat);

      if (!emojis.length) {
        gridWrap.appendChild(makeEmptyNotice("没有匹配结果"));
        return;
      }
      const grid = document.createElement("div");
      grid.className = "emoji-grid";
      emojis.forEach(emoji => grid.appendChild(makeEmojiItem(emoji)));
      gridWrap.appendChild(grid);
    }

    function selectCat(cat, chipEl) {
      rail.querySelectorAll(".emoji-cat-chip").forEach(c => {
        c.classList.toggle("active", c === chipEl);
        c.setAttribute("aria-selected", String(c === chipEl));
      });
      renderGrid(cat);
    }

    const allChip = document.createElement("button");
    allChip.type = "button";
    allChip.className = "emoji-cat-chip active";
    allChip.textContent = "全部";
    allChip.setAttribute("role", "tab");
    allChip.setAttribute("aria-selected", "true");
    allChip.addEventListener("click", () => selectCat(null, allChip));
    rail.appendChild(allChip);

    catOrder.forEach(cat => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "emoji-cat-chip";
      chip.textContent = cat;
      chip.setAttribute("role", "tab");
      chip.setAttribute("aria-selected", "false");
      chip.addEventListener("click", () => selectCat(cat, chip));
      rail.appendChild(chip);
    });

    container.appendChild(rail);
    container.appendChild(gridWrap);
    renderGrid(null);
  }

  function renderSearchResults(container, query) {
    const { emojiCatalog, filterEmojis, KAOMOJI_LIST } = window.SPEmoji;
    container.innerHTML = "";

    if (!query) {
      container.appendChild(makeEmptyNotice("输入关键词搜索表情…"));
      return;
    }

    const allEmojis = Object.values(emojiCatalog.byId);
    const matchedEmojis = filterEmojis(allEmojis, query);
    const matchedKaomoji = KAOMOJI_LIST.filter(k => k.includes(query));

    if (!matchedEmojis.length && !matchedKaomoji.length) {
      container.appendChild(makeEmptyNotice("没有匹配结果"));
      return;
    }

    if (matchedEmojis.length) {
      const grid = document.createElement("div");
      grid.className = "emoji-search-results-grid";
      matchedEmojis.forEach(emoji => {
        grid.appendChild(makeEmojiItem(emoji, { inSearchMode: true }));
      });
      container.appendChild(grid);
    }

    if (matchedKaomoji.length) {
      if (matchedEmojis.length) {
        const divider = document.createElement("div");
        divider.className = "emoji-search-section-label";
        divider.textContent = "颜文字";
        container.appendChild(divider);
      }
      const kaoGrid = document.createElement("div");
      kaoGrid.className = "emoji-grid emoji-grid--kaomoji";
      matchedKaomoji.forEach(kao => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "emoji-item emoji-item--kaomoji";
        btn.textContent = kao;
        btn.title = kao;
        btn.addEventListener("click", () => {
          insertTextAtCursor(kao);
          closeEmojiPanel();
          scrollChatToLatest();
        });
        kaoGrid.appendChild(btn);
      });
      container.appendChild(kaoGrid);
    }
  }

  function renderTabContent(container, tabId, query) {
    const { EMOJI_RECENT_KEY, EMOJI_FAVORITE_KEY } = window.SPEmoji;
    container.innerHTML = "";
    container.classList.toggle("emoji-content--packs", tabId === "packs");

    if (tabId === "kaomoji") {
      renderKaomojiTab(container, query);
      return;
    }
    if (tabId === "recent") {
      renderStoredEmojiTab(container, EMOJI_RECENT_KEY, query, "最近使用");
      return;
    }
    if (tabId === "frequent") {
      renderFrequentTab(container, query);
      return;
    }
    if (tabId === "favorite") {
      renderStoredEmojiTab(container, EMOJI_FAVORITE_KEY, query, "收藏", true);
      return;
    }
    if (tabId === "packs") {
      renderPacksTab(container, query);
    }
  }

  // ── Panel open / close ────────────────────────────────────────────────────

  function openEmojiPanel() {
    if (_emojiPanelOpen) {
      closeEmojiPanel();
      return;
    }
    _emojiPanelOpen = true;
    _emojiPanelMode = "browse";

    // Enforce mutual exclusion via state machine
    if (typeof window.setChatInputMode === "function") window.setChatInputMode("emoji");
    if (typeof window.closeV2PlusPanel === "function") window.closeV2PlusPanel();

    const panel = document.createElement("div");
    panel.id = "emojiPanel";
    panel.className = "emoji-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "表情面板");

    const header = document.createElement("div");
    header.className = "emoji-panel-header";

    const searchWrap = document.createElement("div");
    searchWrap.className = "emoji-search-wrap";

    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "emoji-search";
    searchInput.placeholder = "搜索表情…";
    searchInput.setAttribute("aria-label", "搜索表情");
    searchWrap.appendChild(searchInput);
    header.appendChild(searchWrap);

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "emoji-search-cancel";
    cancelBtn.setAttribute("aria-label", "取消搜索");
    cancelBtn.textContent = "取消";
    header.appendChild(cancelBtn);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "emoji-panel-close";
    closeBtn.setAttribute("aria-label", "关闭表情面板");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", closeEmojiPanel);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const TAB_DEFS = [
      { id: "frequent", label: "常用" },
      { id: "kaomoji",  label: "颜文字" },
      { id: "packs",    label: "表情包" },
    ];
    let activeTab = "frequent";

    const tabBar = document.createElement("div");
    tabBar.className = "emoji-tab-bar";
    tabBar.setAttribute("role", "tablist");

    const browseArea = document.createElement("div");
    browseArea.className = "emoji-content emoji-browse-area";

    const searchArea = document.createElement("div");
    searchArea.className = "emoji-content emoji-search-area";
    searchArea.hidden = true;

    function switchTab(tabId) {
      if (_emojiPanelMode === "search") exitSearchMode(false);
      activeTab = tabId;
      tabBar.querySelectorAll(".emoji-tab").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tabId);
        btn.setAttribute("aria-selected", String(btn.dataset.tab === tabId));
      });
      renderTabContent(browseArea, tabId, "");
    }

    TAB_DEFS.forEach(({ id, label }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-tab";
      btn.dataset.tab = id;
      btn.textContent = label;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(id === activeTab));
      btn.addEventListener("click", () => switchTab(id));
      tabBar.appendChild(btn);
    });

    panel.appendChild(tabBar);
    panel.appendChild(browseArea);
    panel.appendChild(searchArea);

    function enterSearchMode() {
      if (_emojiPanelMode === "search") return;
      _emojiPanelMode = "search";
      if (typeof window.setChatInputMode === "function") window.setChatInputMode("emojiSearch");
      panel.classList.add("emoji-panel--search");
      tabBar.classList.add("emoji-tab-bar--hidden");
      browseArea.hidden = true;
      searchArea.hidden = false;
      cancelBtn.classList.add("emoji-search-cancel--visible");
      chatShell?.classList.add("emoji-panel-search");
      renderSearchResults(searchArea, searchInput.value.trim());
    }

    function exitSearchMode(clearInput) {
      if (clearInput === undefined) clearInput = true;
      if (_emojiPanelMode === "browse") return;
      _emojiPanelMode = "browse";
      if (typeof window.setChatInputMode === "function") window.setChatInputMode("emoji");
      panel.classList.remove("emoji-panel--search");
      tabBar.classList.remove("emoji-tab-bar--hidden");
      browseArea.hidden = false;
      searchArea.hidden = true;
      searchArea.innerHTML = "";
      cancelBtn.classList.remove("emoji-search-cancel--visible");
      chatShell?.classList.remove("emoji-panel-search");
      if (clearInput) {
        searchInput.value = "";
        searchInput.blur();
      }
    }

    searchInput.addEventListener("focus", enterSearchMode);

    searchInput.addEventListener("input", () => {
      if (_emojiPanelMode !== "search") enterSearchMode();
      renderSearchResults(searchArea, searchInput.value.trim());
    });

    cancelBtn.addEventListener("click", () => {
      exitSearchMode(true);
    });

    const chatShell = document.querySelector(".chat-shell");
    const inputBar = document.getElementById("chatForm");
    const insertTarget = chatShell || inputBar?.parentNode;
    insertTarget?.appendChild(panel);
    requestAnimationFrame(() => {
      panel.classList.add("open");
      chatShell?.classList.add("emoji-panel-open");
      scrollChatToLatest();
    });

    const outsideHandler = (e) => {
      if (!panel.contains(e.target) && e.target.id !== "emojiButton") {
        closeEmojiPanel();
        document.removeEventListener("click", outsideHandler);
      }
    };
    setTimeout(() => document.addEventListener("click", outsideHandler), 100);

    document.getElementById("emojiButton")?.classList.add("active");
    switchTab("frequent");
  }

  function closeEmojiPanel() {
    _emojiPanelOpen = false;
    _emojiPanelMode = "browse";
    const panel = document.getElementById("emojiPanel");
    const chatShell = document.querySelector(".chat-shell");
    chatShell?.classList.remove("emoji-panel-open");
    chatShell?.classList.remove("emoji-panel-search");
    if (panel) {
      panel.classList.remove("open");
      panel.addEventListener("transitionend", () => panel.remove(), { once: true });
      setTimeout(() => panel.remove(), 350);
    }
    document.getElementById("emojiButton")?.classList.remove("active");
    // Reset state machine only if we own the current mode
    if (typeof window._chatInputMode !== "undefined" &&
        (window._chatInputMode === "emoji" || window._chatInputMode === "emojiSearch")) {
      window._chatInputMode = "plain";
    }
    if (typeof window.maintainBottomAnchor === "function") {
      window.maintainBottomAnchor("close-panel");
    } else if (typeof scrollChatToLatest === "function") {
      scrollChatToLatest();
    }
  }

  // ── Namespace export ──────────────────────────────────────────────────────
  window.SPEmojiPanel = {
    openEmojiPanel,
    closeEmojiPanel,
    renderTabContent,
    renderSearchResults,
    renderPacksTab,
    makeEmojiItem,
    makeEmptyNotice,
  };

})();
