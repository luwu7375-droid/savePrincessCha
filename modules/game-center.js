// modules/game-center.js — 游戏中心 Module
// Phase 1 MVP: iframe embed CedarToy for human player

(function () {
  "use strict";

  // ── UI Rendering ───────────────────────────────────────────────────────────

  function showGameCenter() {
    const container = document.createElement("div");
    container.id = "gameCenterOverlay";
    container.className = "game-center-overlay";
    container.innerHTML = `
      <div class="game-center-modal">
        <div class="game-center-header">
          <h2>游戏中心 - CedarToy</h2>
          <button class="close-btn" id="closeGameCenter">✕</button>
        </div>
        <div class="game-center-content">
          <iframe
            src="https://toy.cedarstar.org/"
            frameborder="0"
            allow="fullscreen"
            style="width: 100%; height: 100%; border: none;"
          ></iframe>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    document.getElementById("closeGameCenter").addEventListener("click", closeGameCenter);
  }

  function closeGameCenter() {
    const overlay = document.getElementById("gameCenterOverlay");
    if (overlay) {
      overlay.remove();
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
