// modules/v2-shell.js
// Handles page navigation (showPage), bottom tab clicks, and settings subpages.
// Must NOT handle visualViewport, keyboard inset, or scroll position.
// On mobile, switching to chat does NOT focus messageInput (no keyboard pop).

(function () {
  "use strict";

  // ── Settings subpage state ───────────────────────────────────────────────────

  var _currentSettingsSubpage = null;

  var SETTINGS_SUBPAGE_META = {
    "appearance-resources": { title: "外观与资源",       subtitle: "头像、壁纸、开屏图与表情包来源" },
    "prompt-worldbook":     { title: "Prompt 与世界书",  subtitle: "提示词、世界书与注入规则" },
    worldbook:              { title: "世界书管理",        subtitle: "上传后手动启用才会注入 Prompt" },
    memory:                 { title: "记忆管理",          subtitle: "查看、禁用与清理记忆" },
    voice:                  { title: "小cha 的声音",      subtitle: "朗读引擎、语速与音量" },
    api:                    { title: "API 设置",          subtitle: "模型、接口与连接状态" },
    backup:                 { title: "备份与导入",        subtitle: "导出、恢复与记忆书上传" },
    debug:                  { title: "Debug",             subtitle: "日志、版本与诊断工具" },
    // legacy aliases
    beautify: { title: "外观与资源",      subtitle: "头像、壁纸、开屏图与表情包来源" },
    prompt:   { title: "Prompt 与世界书", subtitle: "提示词、世界书与注入规则" },
    emoji:    { title: "外观与资源",      subtitle: "头像、壁纸、开屏图与表情包来源" },
    chat:     { title: "聊天外观",        subtitle: "背景与气泡主题" },
  };

  function openSettingsSubpage(type) {
    var subpage    = document.getElementById("settingsSubpage");
    var mainView   = document.getElementById("settingsMainView");
    var titleEl    = document.getElementById("settingsSubpageTitle");
    var subtitleEl = document.getElementById("settingsSubpageSubtitle");
    var bodyEl     = document.getElementById("settingsSubpageBody");
    if (!subpage || !mainView || !titleEl || !subtitleEl || !bodyEl) return;

    if (_currentSettingsSubpage === "worldbook") {
      var mount = document.getElementById("wbSubpageMount");
      var store = document.getElementById("wbContentStore");
      if (mount && store) {
        while (mount.firstChild) store.appendChild(mount.firstChild);
      }
      if (typeof wbResetUploadForm === "function") wbResetUploadForm();
    }

    var meta = SETTINGS_SUBPAGE_META[type] || { title: type, subtitle: "" };
    titleEl.textContent    = meta.title;
    subtitleEl.textContent = meta.subtitle;
    if (typeof renderSettingsSubpage === "function") {
      bodyEl.innerHTML = renderSettingsSubpage(type);
    }

    _currentSettingsSubpage = type;
    mainView.hidden = true;
    subpage.hidden  = false;

    if (typeof _initSettingsSubpageEvents === "function") {
      _initSettingsSubpageEvents(bodyEl, type);
    }
  }

  function closeSettingsSubpage() {
    var subpage  = document.getElementById("settingsSubpage");
    var mainView = document.getElementById("settingsMainView");
    if (!subpage || !mainView) return;

    if (_currentSettingsSubpage === "worldbook") {
      var mount = document.getElementById("wbSubpageMount");
      var store = document.getElementById("wbContentStore");
      if (mount && store) {
        while (mount.firstChild) store.appendChild(mount.firstChild);
      }
      if (typeof wbResetUploadForm === "function") wbResetUploadForm();
    }

    subpage.hidden  = true;
    mainView.hidden = false;
    _currentSettingsSubpage = null;
  }

  // ── Shell init ───────────────────────────────────────────────────────────────

  // ── Asset upload slots ───────────────────────────────────────────────────────

  var ASSET_SLOTS = {
    "home-cover":           ".home-cover",
    "home-cha-avatar":      ".profile-avatar:not(.profile-avatar--kk), .header-avatar, .top-avatar",
    "home-kk-avatar":       ".profile-avatar.profile-avatar--kk",
    "home-today-image":     ".today-photo",
    "couple-memory-vortex": ".memory-vortex",
  };

  function _applyAsset(slot, url) {
    var sel = ASSET_SLOTS[slot];
    if (!sel) return;
    document.querySelectorAll(sel).forEach(function (el) {
      el.style.backgroundImage    = 'url("' + url + '")';
      el.style.backgroundSize     = "cover";
      el.style.backgroundPosition = "center";
      el.style.backgroundRepeat   = "no-repeat";
    });
  }

  function initV2Shell() {
    var pages = Array.from(document.querySelectorAll(".v2-page"));
    var tabs  = Array.from(document.querySelectorAll(".bottom-tab"));
    var shell = document.querySelector(".layout");

    function showPage(pageName) {
      var target = pages.find(function (p) { return p.dataset.page === pageName; }) || pages[0];
      if (!target) return;
      var activeName = target.dataset.page;

      pages.forEach(function (p) { p.classList.toggle("v2-active", p === target); });
      tabs.forEach(function (t)  { t.classList.toggle("active", t.dataset.tab === activeName); });
      if (shell) shell.setAttribute("data-active-page", activeName);

      // Close all chat overlays whenever page switches
      if (typeof closeAllChatPanels === "function") closeAllChatPanels();
      var _diaryOverlay = document.getElementById('diaryOverlay');
      if (_diaryOverlay) _diaryOverlay.classList.add('hidden');

      if (activeName === "chat") {
        requestAnimationFrame(function () {
          if (typeof maintainBottomAnchor === "function") maintainBottomAnchor("send");
          // Desktop only — mobile must not pop the keyboard on tab switch
          if (typeof isMobileLayout === "function" && !isMobileLayout()) {
            var mi = document.getElementById("messageInput");
            if (mi) mi.focus({ preventScroll: true });
          }
          if (typeof observeUnreadChaRows === "function")      observeUnreadChaRows();
          if (typeof markVisibleAssistantRowsRead === "function") markVisibleAssistantRowsRead();
        });

        // Skip reload if already rendered for this conversation with same message count
        if (typeof getActiveConversationId === "function" &&
            typeof chatRenderState !== "undefined" &&
            typeof chatMessages !== "undefined" &&
            typeof messageList !== "undefined") {
          var currentConvId = getActiveConversationId();
          if (
            chatRenderState.renderedConversationId === currentConvId &&
            chatRenderState.renderedMessageCount === chatMessages.length &&
            messageList.children.length > 0
          ) {
            return;
          }
          if (chatRenderState.renderedConversationId !== currentConvId) {
            if (typeof reloadHistory === "function") reloadHistory();
          }
        }
      }

      if (activeName !== "setting") {
        closeSettingsSubpage();
      }
    }

    // Event delegation on the tab bar (capturing phase) — avoids img/span stealing events
    var tabBar = document.querySelector(".bottom-tab-bar");
    if (tabBar) {
      tabBar.addEventListener("click", function (event) {
        var tab = event.target.closest(".bottom-tab");
        if (!tab || !tabBar.contains(tab)) return;
        event.preventDefault();
        event.stopPropagation();
        showPage(tab.dataset.tab);
      }, true);
    }

    // ── Settings subpage entries ─────────────────────────────────────────────
    document.querySelectorAll("[data-settings-subpage]").forEach(function (entry) {
      entry.addEventListener("click", function () {
        openSettingsSubpage(entry.dataset.settingsSubpage);
      });
    });

    var settingsBackBtn = document.getElementById("settingsBackBtn");
    if (settingsBackBtn) {
      settingsBackBtn.addEventListener("click", function () { closeSettingsSubpage(); });
    }

    // ── Legacy placeholder routes ────────────────────────────────────────────
    document.querySelectorAll("[data-placeholder-route]").forEach(function (entry) {
      entry.addEventListener("click", function () {
        var route = entry.dataset.placeholderRoute;

        if (route === "/settings/memory") {
          if (typeof openMemoryCenter === "function") openMemoryCenter();
          return;
        }
        if (route === "/playground/phone") {
          if (typeof openPhoneOverlay === "function") openPhoneOverlay();
          return;
        }
        if (route === "/home/diary") {
          if (window.SPDiary) {
            window.SPDiary.navigateToDiaryList();
          }
          return;
        }
        if (route === "/settings/api") {
          var tierLabel = { instant: "Instant", general: "General", advanced: "Advanced" }[
            typeof currentModelTier !== "undefined" ? currentModelTier : ""
          ] || (typeof currentModelTier !== "undefined" ? currentModelTier : "");
          if (typeof showDialog === "function") {
            showDialog({
              title: "API 设置 · 模型档位",
              body: "当前档位：" + tierLabel + "\n\n切换档位：聊天页底部的 Instant / General / Advanced 按钮（桌面），或聊天页 + 菜单上方的档位选择器（移动端）。",
              confirmLabel: "知道了",
            });
          }
          return;
        }

        if (typeof showDialog === "function") {
          showDialog({
            title: "入口已预留",
            body: route + " 将在后续版本接入。",
            confirmLabel: "知道了",
          });
        }
      });
    });

    document.querySelectorAll("[data-upload-slot]").forEach(function (entry) {
      var slot = entry.dataset.uploadSlot;
      // Apply any previously saved asset on load
      var saved = localStorage.getItem("asset_" + slot);
      if (saved) _applyAsset(slot, saved);
      // Wire real upload handler — always enabled so user can re-upload
      entry.addEventListener("click", function (event) {
        event.stopPropagation();
        var inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.addEventListener("change", function () {
          var file = inp.files && inp.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function () {
            try {
              localStorage.setItem("asset_" + slot, reader.result);
            } catch (e) {
              if (typeof showToast === "function") showToast("图片太大，无法持久化保存");
            }
            _applyAsset(slot, reader.result);
          };
          reader.readAsDataURL(file);
        });
        inp.click();
      });
    });

    document.querySelectorAll("[data-edit-field]").forEach(function (entry) {
      entry.addEventListener("click", function (event) {
        event.stopPropagation();
        if (typeof showDialog === "function") {
          showDialog({
            title: "编辑入口已预留",
            body: entry.dataset.editField + " 将复用统一编辑态组件接入，本轮先保留点击入口。",
            confirmLabel: "知道了",
          });
        }
      });
    });

    showPage("home");

    // Expose showPage for debug console (extend, don't replace)
    window.SPV2Shell.showPage = showPage;
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  window.SPV2Shell = {
    initV2Shell:          initV2Shell,
    openSettingsSubpage:  openSettingsSubpage,
    closeSettingsSubpage: closeSettingsSubpage,
  };
})();
