// modules/game-center.js — 游戏中心 Module
// Phase 1 MVP: iframe embed CedarToy for human player
// Refactored to use v2-page system instead of modal overlay

(function () {
  "use strict";

  // ── Page Navigation ────────────────────────────────────────────────────────

  function showGameCenter() {
    // Use v2-shell's showPage function to navigate to game-center page
    if (window.SPV2Shell && typeof window.SPV2Shell.showPage === "function") {
      window.SPV2Shell.showPage("game-center");
    } else {
      // Fallback: manually trigger page navigation
      const pages = document.querySelectorAll(".v2-page");
      const tabs = document.querySelectorAll(".bottom-tab");
      const target = document.querySelector('.v2-page[data-page="game-center"]');

      if (target) {
        pages.forEach(p => p.classList.remove("v2-active"));
        tabs.forEach(t => t.classList.remove("active"));
        target.classList.add("v2-active");
      }
    }
  }

  function closeGameCenter() {
    // Navigate back to playground page
    if (window.SPV2Shell && typeof window.SPV2Shell.showPage === "function") {
      window.SPV2Shell.showPage("playground");
    } else {
      // Fallback: manually trigger page navigation
      const pages = document.querySelectorAll(".v2-page");
      const tabs = document.querySelectorAll(".bottom-tab");
      const playgroundPage = document.querySelector('.v2-page[data-page="playground"]');
      const playgroundTab = document.querySelector('.bottom-tab[data-tab="playground"]');

      if (playgroundPage) {
        pages.forEach(p => p.classList.remove("v2-active"));
        tabs.forEach(t => t.classList.remove("active"));
        playgroundPage.classList.add("v2-active");
        if (playgroundTab) playgroundTab.classList.add("active");
      }
    }
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  function init() {
    // Wire up game center entry button
    const gameCenterBtn = document.getElementById("gameCenterEntry");
    if (gameCenterBtn) {
      gameCenterBtn.addEventListener("click", showGameCenter);
    }

    // Wire up back button on game center page
    const backBtn = document.getElementById("gameCenterBackBtn");
    if (backBtn) {
      backBtn.addEventListener("click", closeGameCenter);
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
