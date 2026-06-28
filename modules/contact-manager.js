// ============================================================================
// Contact Manager Module - Contact Abstraction Layer
// ============================================================================
// Abstracts "contacts" from "conversations" for UI purposes
// Maps one contact (Cha) to the active or most recent conversation
// Stores contact metadata (nickname, status, intro, notes) in localStorage

(function() {
  "use strict";

  // ── Contact Metadata Structure ──────────────────────────────────────────────

  const DEFAULT_CONTACT_METADATA = {
    id: 'cha',
    nickname: 'Cha',
    nicknameCalled: 'kk',
    intro: '幸福是两双眼睛望向同一个明天',
    avatar: 'assets/avatars/cha.png',
    status: 'online',
    notes: '',
    chatBackground: 'default'
  };

  const STORAGE_KEY = 'contact_cha_metadata';

  // ── Private State ───────────────────────────────────────────────────────────

  let contactMetadata = null;
  let isInitialized = false;

  // ── Initialization ──────────────────────────────────────────────────────────

  function init() {
    if (isInitialized) return;

    // Load contact metadata from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        contactMetadata = JSON.parse(stored);
        // Merge with defaults for any missing fields
        contactMetadata = { ...DEFAULT_CONTACT_METADATA, ...contactMetadata };
      } else {
        contactMetadata = { ...DEFAULT_CONTACT_METADATA };
        saveContactMetadata();
      }
    } catch (error) {
      console.error('Failed to load contact metadata:', error);
      contactMetadata = { ...DEFAULT_CONTACT_METADATA };
    }

    isInitialized = true;
  }

  // ── Private Helper Functions ────────────────────────────────────────────────

  function saveContactMetadata() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contactMetadata));
    } catch (error) {
      console.error('Failed to save contact metadata:', error);
    }
  }

  async function getLastMessageForConversation(conversationId) {
    if (!window.supabaseClient) return null;

    try {
      const { data, error } = await window.supabaseClient
        .from('messages')
        .select('content, role, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) return null;
      return data;
    } catch (error) {
      return null;
    }
  }

  function getUnreadCountForConversation(conversationId) {
    // For MVP, return 0. In future, can track unread messages
    return 0;
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return '';

    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;

    // Format as date
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  }

  function truncateText(text, maxLength = 30) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Get the list of contacts (currently always returns just Cha)
   * @returns {Promise<Array>} Array of contact objects with preview data
   */
  async function getContactList() {
    if (!isInitialized) init();

    // Get the active conversation or most recent conversation
    const activeConvId = window.getActiveConversationId?.();
    const conversationId = activeConvId || null;

    // Get last message preview
    let lastMessage = null;
    let lastMessageTime = null;
    let lastMessagePreview = '开始聊天...';

    if (conversationId) {
      lastMessage = await getLastMessageForConversation(conversationId);
      if (lastMessage) {
        lastMessageTime = lastMessage.created_at;
        // Format preview based on role
        if (lastMessage.role === 'user') {
          lastMessagePreview = truncateText(lastMessage.content);
        } else {
          lastMessagePreview = truncateText(lastMessage.content);
        }
      }
    }

    // Get unread count
    const unreadCount = conversationId ? getUnreadCountForConversation(conversationId) : 0;

    // Return single Cha contact with enriched data
    return [{
      ...contactMetadata,
      conversationId,
      lastMessage: lastMessagePreview,
      lastMessageTime: formatTimeAgo(lastMessageTime),
      unreadCount
    }];
  }

  /**
   * Get a single contact by ID
   * @param {string} contactId - Contact ID (currently only 'cha')
   * @returns {Object|null} Contact metadata
   */
  function getContactById(contactId) {
    if (!isInitialized) init();

    if (contactId === 'cha') {
      return { ...contactMetadata };
    }
    return null;
  }

  /**
   * Get the conversation ID associated with a contact
   * @param {string} contactId - Contact ID
   * @returns {string|null} Conversation ID
   */
  function getChatThreadForContact(contactId) {
    if (contactId !== 'cha') return null;

    // Return active conversation ID
    return window.getActiveConversationId?.() || null;
  }

  /**
   * Update contact metadata
   * @param {string} contactId - Contact ID
   * @param {Object} updates - Fields to update
   */
  function updateContactMetadata(contactId, updates) {
    if (!isInitialized) init();

    if (contactId !== 'cha') return;

    // Update metadata
    contactMetadata = { ...contactMetadata, ...updates };

    // Save to localStorage
    saveContactMetadata();
  }

  /**
   * Get contact avatar URL
   * @param {string} contactId - Contact ID
   * @returns {string} Avatar URL
   */
  function getContactAvatar(contactId) {
    if (!isInitialized) init();

    if (contactId === 'cha') {
      return contactMetadata.avatar || DEFAULT_CONTACT_METADATA.avatar;
    }
    return '';
  }

  /**
   * Get contact display name
   * @param {string} contactId - Contact ID
   * @returns {string} Display name
   */
  function getContactDisplayName(contactId) {
    if (!isInitialized) init();

    if (contactId === 'cha') {
      return contactMetadata.nickname || DEFAULT_CONTACT_METADATA.nickname;
    }
    return '';
  }

  /**
   * Get contact status
   * @param {string} contactId - Contact ID
   * @returns {string} Status ('online' or 'offline')
   */
  function getContactStatus(contactId) {
    if (!isInitialized) init();

    if (contactId === 'cha') {
      return contactMetadata.status || 'online';
    }
    return 'offline';
  }

  // ── Module Exports ──────────────────────────────────────────────────────────

  window.ContactManager = {
    init,
    getContactList,
    getContactById,
    getChatThreadForContact,
    updateContactMetadata,
    getContactAvatar,
    getContactDisplayName,
    getContactStatus
  };

})();
