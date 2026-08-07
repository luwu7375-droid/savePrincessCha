// ── Web Push Subscription Manager ────────────────────────────────────────────
//
// Handles browser push notification subscription flow:
// 1. Request notification permission from user
// 2. Subscribe via Service Worker Push API
// 3. Save subscription to push_subscriptions table
//
// Usage:
//   await window.PushSubscription.init(supabaseClient, userId);
//   await window.PushSubscription.subscribe();
//   await window.PushSubscription.unsubscribe();
// ──────────────────────────────────────────────────────────────────────────────

(function () {
  "use strict";

  // VAPID public key (must match push-send Edge Function)
  const VAPID_PUBLIC_KEY =
    "BKT3lETzzUJ9Qw0VHFAr78whHwpXOvae8lnM_EE_tra_S2uIbhyCAHb4bo98W37L-YguYPw3iT017bterXlJNm4";

  let _supabaseClient = null;
  let _userId = null;
  let _swRegistration = null;

  /**
   * Convert VAPID public key from base64url to Uint8Array
   */
  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Check if push notifications are supported
   */
  function isSupported() {
    return (
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
  }

  /**
   * Get current notification permission status
   */
  function getPermission() {
    if (!isSupported()) return "unsupported";
    return Notification.permission;
  }

  /**
   * Request notification permission from user
   */
  async function requestPermission() {
    if (!isSupported()) {
      throw new Error("Push notifications not supported");
    }

    if (Notification.permission === "granted") {
      return "granted";
    }

    if (Notification.permission === "denied") {
      throw new Error("Notification permission denied by user");
    }

    const permission = await Notification.requestPermission();
    console.log("[push] Permission result:", permission);
    return permission;
  }

  /**
   * Subscribe to push notifications
   */
  async function subscribe() {
    if (!_supabaseClient || !_userId) {
      throw new Error("PushSubscription not initialized. Call init() first.");
    }

    if (!isSupported()) {
      throw new Error("Push notifications not supported");
    }

    // Request permission
    const permission = await requestPermission();
    if (permission !== "granted") {
      throw new Error(`Permission ${permission}, cannot subscribe`);
    }

    // Get or wait for Service Worker registration
    if (!_swRegistration) {
      _swRegistration = await navigator.serviceWorker.ready;
    }

    // Check if already subscribed
    let subscription = await _swRegistration.pushManager.getSubscription();

    if (!subscription) {
      // Subscribe to push
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      subscription = await _swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      console.log("[push] New subscription created:", subscription.endpoint);
    } else {
      console.log("[push] Already subscribed:", subscription.endpoint);
    }

    // Save to database
    await saveSubscriptionToDatabase(subscription);

    return subscription;
  }

  /**
   * Unsubscribe from push notifications
   */
  async function unsubscribe() {
    if (!_supabaseClient || !_userId) {
      throw new Error("PushSubscription not initialized. Call init() first.");
    }

    if (!isSupported()) {
      throw new Error("Push notifications not supported");
    }

    if (!_swRegistration) {
      _swRegistration = await navigator.serviceWorker.ready;
    }

    const subscription = await _swRegistration.pushManager.getSubscription();
    if (!subscription) {
      console.log("[push] No active subscription");
      return;
    }

    // Unsubscribe from browser
    await subscription.unsubscribe();
    console.log("[push] Unsubscribed from push");

    // Delete from database
    await deleteSubscriptionFromDatabase(subscription.endpoint);
  }

  /**
   * Save subscription to push_subscriptions table
   */
  async function saveSubscriptionToDatabase(subscription) {
    const endpoint = subscription.endpoint;
    const keys = subscription.toJSON().keys;

    if (!keys || !keys.p256dh || !keys.auth) {
      throw new Error("Invalid subscription keys");
    }

    const payload = {
      user_id: _userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: navigator.userAgent,
      enabled: true,
    };

    // Upsert: if endpoint already exists, update it
    const { data, error } = await _supabaseClient
      .from("push_subscriptions")
      .upsert(payload, { onConflict: "endpoint" })
      .select();

    if (error) {
      console.error("[push] Failed to save subscription:", error);
      throw new Error(`Failed to save subscription: ${error.message}`);
    }

    console.log("[push] Subscription saved to database:", data);
  }

  /**
   * Delete subscription from database
   */
  async function deleteSubscriptionFromDatabase(endpoint) {
    const { error } = await _supabaseClient
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("user_id", _userId);

    if (error) {
      console.error("[push] Failed to delete subscription:", error);
      throw new Error(`Failed to delete subscription: ${error.message}`);
    }

    console.log("[push] Subscription deleted from database");
  }

  /**
   * Check if user is currently subscribed
   */
  async function isSubscribed() {
    if (!isSupported()) return false;

    if (!_swRegistration) {
      try {
        _swRegistration = await navigator.serviceWorker.ready;
      } catch {
        return false;
      }
    }

    const subscription = await _swRegistration.pushManager.getSubscription();
    return subscription !== null;
  }

  /**
   * Initialize module
   */
  function init(supabaseClient, userId) {
    if (!supabaseClient) {
      throw new Error("Supabase client is required");
    }
    if (!userId) {
      throw new Error("User ID is required");
    }

    _supabaseClient = supabaseClient;
    _userId = userId;

    // Try to get SW registration if available
    if (isSupported()) {
      navigator.serviceWorker.ready.then((registration) => {
        _swRegistration = registration;
        console.log("[push] Module initialized, SW ready");
      });
    }

    console.log("[push] Module initialized for user:", userId.slice(0, 6));
  }

  // Expose API
  window.PushSubscription = {
    init,
    subscribe,
    unsubscribe,
    isSupported,
    isSubscribed,
    getPermission,
    requestPermission,
  };
})();
