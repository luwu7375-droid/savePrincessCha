// modules/game-center.js — 游戏中心 Module
// Phase 1 MVP: User-triggered single game (海龟汤)

(function () {
  "use strict";

  let currentSession = null;
  let currentGameGuide = null;

  // ── Utility Functions ──────────────────────────────────────────────────────

  function getCurrentUserId() {
    return typeof window.currentUserId === "string" ? window.currentUserId : "";
  }

  async function getSupabaseAuthHeaders() {
    try {
      const sc = window.supabaseClient || null;
      if (!sc) return {};
      const { data: { session } } = await sc.auth.getSession();
      return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
    } catch {
      return {};
    }
  }

  function getGameProxyEndpoint() {
    const cfg = window.SAVE_PRINCESS_CONFIG || {};
    const base = cfg["SUPABASE_URL"] || "";
    return base ? `${base}/functions/v1/game-proxy` : "";
  }

  // ── API Calls ──────────────────────────────────────────────────────────────

  async function callGameProxy(action, params = {}) {
    const endpoint = getGameProxyEndpoint();
    if (!endpoint) {
      throw new Error("Game proxy endpoint not configured");
    }

    const headers = await getSupabaseAuthHeaders();
    const userId = getCurrentUserId();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        action,
        userId,
        ...params,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to call game proxy: ${response.status}`);
    }

    return await response.json();
  }

  async function createSession(gameName, gameDisplayName) {
    const sc = window.supabaseClient;
    if (!sc) throw new Error("Supabase client not available");

    const userId = getCurrentUserId();
    const { data, error } = await sc
      .from("game_sessions")
      .insert({
        user_id: userId,
        game_name: gameName,
        game_display_name: gameDisplayName,
        status: "active",
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create session: ${error.message}`);
    return data;
  }

  async function recordAction(sessionId, action, result, metadata = {}) {
    const sc = window.supabaseClient;
    if (!sc) throw new Error("Supabase client not available");

    // Fetch current session
    const { data: session, error: fetchError } = await sc
      .from("game_sessions")
      .select("action_history, action_count, token_cost")
      .eq("id", sessionId)
      .single();

    if (fetchError) throw new Error(`Failed to fetch session: ${fetchError.message}`);

    const actionHistory = session.action_history || [];
    actionHistory.push({
      action,
      result,
      timestamp: new Date().toISOString(),
      metadata,
    });

    const { error: updateError } = await sc
      .from("game_sessions")
      .update({
        action_history: actionHistory,
        action_count: session.action_count + 1,
        token_cost: session.token_cost + (metadata.token_cost || 0),
      })
      .eq("id", sessionId);

    if (updateError) throw new Error(`Failed to record action: ${updateError.message}`);
  }

  async function completeSession(sessionId, status) {
    const sc = window.supabaseClient;
    if (!sc) throw new Error("Supabase client not available");

    const { error } = await sc
      .from("game_sessions")
      .update({
        status,
        ended_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) throw new Error(`Failed to complete session: ${error.message}`);
  }

  // ── UI Rendering ───────────────────────────────────────────────────────────

  function showGameCenter() {
    const container = document.createElement("div");
    container.id = "gameCenterOverlay";
    container.className = "game-center-overlay";
    container.innerHTML = `
      <div class="game-center-modal">
        <div class="game-center-header">
          <h2>游戏中心</h2>
          <button class="close-btn" id="closeGameCenter">✕</button>
        </div>
        <div class="game-center-content" id="gameCenterContent">
          <div class="loading">加载游戏列表...</div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    document.getElementById("closeGameCenter").addEventListener("click", closeGameCenter);
    loadGameList();
  }

  function closeGameCenter() {
    const overlay = document.getElementById("gameCenterOverlay");
    if (overlay) {
      overlay.remove();
    }
    currentSession = null;
    currentGameGuide = null;
  }

  async function loadGameList() {
    const content = document.getElementById("gameCenterContent");
    try {
      const result = await callGameProxy("list_games");
      const games = result.games || [];

      renderGameList(games);
    } catch (error) {
      content.innerHTML = `<div class="error">加载失败: ${error.message}</div>`;
    }
  }

  function renderGameList(games) {
    const content = document.getElementById("gameCenterContent");

    if (games.length === 0) {
      content.innerHTML = '<div class="empty">暂无可用游戏</div>';
      return;
    }

    const html = `
      <div class="game-grid">
        ${games.map(game => `
          <button class="game-card" data-game="${game.name}">
            <div class="game-name">${game.display_name || game.name}</div>
            ${game.description ? `<div class="game-desc">${game.description}</div>` : ''}
          </button>
        `).join('')}
      </div>
    `;

    content.innerHTML = html;

    // Attach event listeners
    document.querySelectorAll('.game-card').forEach(card => {
      card.addEventListener('click', () => {
        const gameName = card.dataset.game;
        const gameDisplayName = card.querySelector('.game-name').textContent;
        startGame(gameName, gameDisplayName);
      });
    });
  }

  async function startGame(gameName, gameDisplayName) {
    const content = document.getElementById("gameCenterContent");
    content.innerHTML = '<div class="loading">正在启动游戏...</div>';

    try {
      // 1. Get game guide
      const guideResult = await callGameProxy("get_guide", { game: gameName });
      currentGameGuide = guideResult.guide || "暂无游戏说明";

      // 2. Create session
      currentSession = await createSession(gameName, gameDisplayName);

      // 3. Start game
      const playResult = await callGameProxy("play", {
        game: gameName,
        gameAction: "start",
        slotId: currentSession.slot_id,
      });

      await recordAction(currentSession.id, "start", playResult);

      // 4. Show active session view
      showActiveSessionView(playResult);
    } catch (error) {
      content.innerHTML = `<div class="error">启动失败: ${error.message}</div>`;
    }
  }

  function showActiveSessionView(gameState) {
    const content = document.getElementById("gameCenterContent");

    const stateText = typeof gameState === 'string' ? gameState :
                      gameState.state || gameState.message || JSON.stringify(gameState, null, 2);

    content.innerHTML = `
      <div class="active-game-view">
        <div class="game-header">
          <h3>${currentSession.game_display_name || currentSession.game_name}</h3>
          <button class="btn-secondary" id="btnEndGame">结束游戏</button>
        </div>

        <div class="game-guide">
          <details>
            <summary>游戏说明</summary>
            <div class="guide-content">${currentGameGuide}</div>
          </details>
        </div>

        <div class="game-state">
          <pre>${stateText}</pre>
        </div>

        <div class="game-history" id="gameHistory">
          <h4>操作历史</h4>
          <div class="history-list"></div>
        </div>

        <div class="game-input">
          <input type="text" id="gameActionInput" placeholder="输入你的操作或问题..." />
          <button id="btnSendAction">发送</button>
        </div>
      </div>
    `;

    document.getElementById("btnSendAction").addEventListener("click", sendGameAction);
    document.getElementById("gameActionInput").addEventListener("keypress", (e) => {
      if (e.key === "Enter") sendGameAction();
    });
    document.getElementById("btnEndGame").addEventListener("click", endGame);

    updateHistoryView();
  }

  async function sendGameAction() {
    const input = document.getElementById("gameActionInput");
    const action = input.value.trim();

    if (!action || !currentSession) return;

    input.value = "";
    input.disabled = true;
    document.getElementById("btnSendAction").disabled = true;

    try {
      const playResult = await callGameProxy("play", {
        game: currentSession.game_name,
        gameAction: action,
        slotId: currentSession.slot_id,
      });

      await recordAction(currentSession.id, action, playResult);

      updateGameStateView(playResult);
      updateHistoryView();
    } catch (error) {
      alert(`操作失败: ${error.message}`);
    } finally {
      input.disabled = false;
      document.getElementById("btnSendAction").disabled = false;
      input.focus();
    }
  }

  function updateGameStateView(gameState) {
    const stateDiv = document.querySelector(".game-state pre");
    if (!stateDiv) return;

    const stateText = typeof gameState === 'string' ? gameState :
                      gameState.state || gameState.message || JSON.stringify(gameState, null, 2);

    stateDiv.textContent = stateText;
  }

  function updateHistoryView() {
    const sc = window.supabaseClient;
    if (!sc || !currentSession) return;

    sc.from("game_sessions")
      .select("action_history")
      .eq("id", currentSession.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to fetch history:", error);
          return;
        }

        const history = data.action_history || [];
        const historyList = document.querySelector(".history-list");
        if (!historyList) return;

        historyList.innerHTML = history.map((entry, idx) => `
          <div class="history-entry">
            <div class="history-action"><strong>${idx + 1}.</strong> ${entry.action}</div>
            <div class="history-result">${formatResult(entry.result)}</div>
            <div class="history-time">${new Date(entry.timestamp).toLocaleTimeString()}</div>
          </div>
        `).join('');
      });
  }

  function formatResult(result) {
    if (typeof result === 'string') return result;
    if (result && typeof result === 'object') {
      return result.message || result.state || JSON.stringify(result);
    }
    return String(result);
  }

  async function endGame() {
    if (!currentSession) return;

    const confirmed = confirm("确定要结束游戏吗？");
    if (!confirmed) return;

    try {
      await completeSession(currentSession.id, "completed");
      alert("游戏已结束");
      closeGameCenter();
    } catch (error) {
      alert(`结束游戏失败: ${error.message}`);
    }
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  function init() {
    const gameCenterBtn = document.getElementById("gameCenterEntry");
    if (gameCenterBtn) {
      gameCenterBtn.addEventListener("click", showGameCenter);
    }
  }

  // Wait for DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Export API
  window.GameCenter = {
    showGameCenter,
    closeGameCenter,
  };
})();
