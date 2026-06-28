// ============================================================================
// Chat Navigation Module - Multi-page Navigation System
// ============================================================================
// Manages navigation between three chat sub-pages:
// 1. chat-contacts - Contact list page
// 2. chat-detail - Chat detail page
// 3. contact-profile - Contact profile page

(function() {
  "use strict";

  // ── Navigation State ────────────────────────────────────────────────────────

  const navigationHistory = [];
  let currentPage = null;
  let scrollPositions = {};

  // ── Page Elements ───────────────────────────────────────────────────────────

  function getPageElements() {
    return {
      contactsPage: document.getElementById('page-chat-contacts'),
      detailPage: document.getElementById('page-chat-detail'),
      profilePage: document.getElementById('page-contact-profile')
    };
  }

  // ── Core Navigation Functions ───────────────────────────────────────────────

  /**
   * Navigate to a specific chat sub-page
   * @param {string} pageId - Page ID ('chat-contacts', 'chat-detail', 'contact-profile')
   * @param {Object} options - Navigation options
   * @param {string} options.contactId - Contact ID for profile page
   * @param {boolean} options.replaceHistory - Replace current history entry instead of push
   */
  function navigateToChatPage(pageId, options = {}) {
    const pages = getPageElements();
    const validPages = ['chat-contacts', 'chat-detail', 'contact-profile'];

    if (!validPages.includes(pageId)) {
      console.error(`Invalid page ID: ${pageId}`);
      return;
    }

    // Save scroll position of current page
    if (currentPage) {
      saveScrollPosition(currentPage);
    }

    // Update navigation history
    if (options.replaceHistory && navigationHistory.length > 0) {
      navigationHistory[navigationHistory.length - 1] = { pageId, options };
    } else {
      navigationHistory.push({ pageId, options });
    }

    // Hide all pages
    if (pages.contactsPage) pages.contactsPage.hidden = true;
    if (pages.detailPage) pages.detailPage.hidden = true;
    if (pages.profilePage) pages.profilePage.hidden = true;

    // Show target page
    switch (pageId) {
      case 'chat-contacts':
        if (pages.contactsPage) {
          pages.contactsPage.hidden = false;
          // Trigger contact list render
          if (window.renderChatContactsList) {
            window.renderChatContactsList();
          }
        }
        break;

      case 'chat-detail':
        if (pages.detailPage) {
          pages.detailPage.hidden = false;
          // Restore scroll position if available
          restoreScrollPosition(pageId);
        }
        break;

      case 'contact-profile':
        if (pages.profilePage) {
          pages.profilePage.hidden = false;
          // Load profile data
          if (window.loadContactProfilePage && options.contactId) {
            window.loadContactProfilePage(options.contactId);
          }
        }
        break;
    }

    currentPage = pageId;

    // Emit navigation event for other modules to react
    const event = new CustomEvent('chat-page-changed', {
      detail: { pageId, options }
    });
    window.dispatchEvent(event);
  }

  /**
   * Go back in navigation history
   * @returns {boolean} True if navigation occurred, false if at root
   */
  function goBackInChatHistory() {
    if (navigationHistory.length <= 1) {
      // At root, can't go back further
      return false;
    }

    // Remove current page from history
    navigationHistory.pop();

    // Get previous page
    const previous = navigationHistory[navigationHistory.length - 1];

    if (previous) {
      // Navigate to previous page (replace history to avoid infinite loop)
      navigateToChatPage(previous.pageId, { ...previous.options, replaceHistory: true });
      // Remove the duplicate we just added
      navigationHistory.pop();
      return true;
    }

    return false;
  }

  /**
   * Get current chat page
   * @returns {string|null} Current page ID
   */
  function getCurrentChatPage() {
    return currentPage;
  }

  /**
   * Clear navigation history and reset to contact list
   */
  function resetChatNavigation() {
    navigationHistory.length = 0;
    scrollPositions = {};
    currentPage = null;
    navigateToChatPage('chat-contacts');
  }

  // ── Scroll Position Management ──────────────────────────────────────────────

  function saveScrollPosition(pageId) {
    const pages = getPageElements();
    let scrollContainer = null;

    switch (pageId) {
      case 'chat-contacts':
        scrollContainer = pages.contactsPage?.querySelector('.chat-contacts-list');
        break;
      case 'chat-detail':
        scrollContainer = document.getElementById('messageList');
        break;
      case 'contact-profile':
        scrollContainer = pages.profilePage?.querySelector('.contact-profile-scroll');
        break;
    }

    if (scrollContainer) {
      scrollPositions[pageId] = scrollContainer.scrollTop;
    }
  }

  function restoreScrollPosition(pageId) {
    if (scrollPositions[pageId] === undefined) return;

    const pages = getPageElements();
    let scrollContainer = null;

    switch (pageId) {
      case 'chat-contacts':
        scrollContainer = pages.contactsPage?.querySelector('.chat-contacts-list');
        break;
      case 'chat-detail':
        scrollContainer = document.getElementById('messageList');
        break;
      case 'contact-profile':
        scrollContainer = pages.profilePage?.querySelector('.contact-profile-scroll');
        break;
    }

    if (scrollContainer) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollPositions[pageId];
      });
    }
  }

  // ── Initialization ──────────────────────────────────────────────────────────

  function init() {
    // Start on contact list page by default
    currentPage = 'chat-contacts';
    navigationHistory.push({ pageId: 'chat-contacts', options: {} });
  }

  // ── Module Exports ──────────────────────────────────────────────────────────

  window.ChatNavigation = {
    init,
    navigateToChatPage,
    goBackInChatHistory,
    getCurrentChatPage,
    resetChatNavigation
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
