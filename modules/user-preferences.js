// ============================================================================
// User Preferences Sync Module
// ============================================================================
// Syncs device-level localStorage settings to Supabase user_preferences table
// so they persist across devices.

(function() {
  "use strict";

  // Keys that should sync across devices
  const SYNC_KEYS = [
    "custom_providers",
    "spc_model_role_mapping_v1",
    "voice_tts_engine",
    "voice_tts_rate",
    "voice_tts_volume",
    "voice_tts_config",
  ];

  /**
   * Load preferences from Supabase and merge into localStorage.
   * Called on login. Remote values win over local (remote is source of truth).
   */
  async function pullPreferences() {
    const client = window.supabaseClient;
    const userId = window.currentUserId;
    if (!client || !userId) {
      console.warn("[user-prefs] Pull skipped: no client or userId");
      return;
    }

    try {
      const { data, error } = await client
        .from("user_preferences")
        .select("preferences")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.warn("[user-prefs] Failed to pull preferences:", error.message);
        _toast("偏好同步失败: " + error.message);
        return;
      }

      if (!data || !data.preferences || Object.keys(data.preferences).length === 0) {
        // No remote preferences yet — push current local state
        console.log("[user-prefs] No remote data, pushing local state...");
        await pushPreferences();
        return;
      }

      const remote = data.preferences;
      let pulled = 0;
      SYNC_KEYS.forEach(key => {
        if (remote[key] !== undefined && remote[key] !== null) {
          localStorage.setItem(key, typeof remote[key] === "string" ? remote[key] : JSON.stringify(remote[key]));
          pulled++;
        }
      });

      // Reload PROVIDER_GROUPS from updated localStorage
      _reloadProviderGroups();

      console.log("[user-prefs] Pulled " + pulled + " keys from server");
    } catch (err) {
      console.warn("[user-prefs] Pull error:", err);
    }
  }

  /**
   * Push current localStorage preferences to Supabase.
   * Called after saving settings (providers, voice, model mapping).
   */
  async function pushPreferences() {
    const client = window.supabaseClient;
    const userId = window.currentUserId;
    if (!client || !userId) {
      console.warn("[user-prefs] Push skipped: no client or userId");
      return;
    }

    const prefs = {};
    SYNC_KEYS.forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw === null) return;
      try {
        prefs[key] = JSON.parse(raw);
      } catch (_) {
        prefs[key] = raw;
      }
    });

    if (Object.keys(prefs).length === 0) {
      console.log("[user-prefs] Nothing to push (all keys empty)");
      return;
    }

    try {
      const { error } = await client
        .from("user_preferences")
        .upsert({ user_id: userId, preferences: prefs }, { onConflict: "user_id" });

      if (error) {
        console.warn("[user-prefs] Failed to push preferences:", error.message, error);
        _toast("偏好推送失败: " + error.message);
      } else {
        console.log("[user-prefs] Pushed preferences to server", Object.keys(prefs));
        _toast("设置已同步到云端");
      }
    } catch (err) {
      console.warn("[user-prefs] Push error:", err);
      _toast("偏好推送异常: " + (err.message || err));
    }
  }

  /**
   * Reload PROVIDER_GROUPS from localStorage after pull.
   */
  function _reloadProviderGroups() {
    if (!window.PROVIDER_GROUPS) window.PROVIDER_GROUPS = {};
    try {
      const cpData = JSON.parse(localStorage.getItem("custom_providers") || "{}");
      Object.entries(cpData).forEach(([pid, p]) => {
        window.PROVIDER_GROUPS[pid] = {
          name: p.name,
          endpoint: p.endpoint,
          models: p.models,
          description: p.description || "自定义配置",
          requiresAuth: true
        };
      });
    } catch (_) {}
  }

  function _toast(msg) {
    if (typeof window.showToast === "function") window.showToast(msg);
    else console.log("[user-prefs]", msg);
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  window.SPUserPreferences = {
    pullPreferences,
    pushPreferences,
  };

})();
