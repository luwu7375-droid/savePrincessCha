(function (window) {
  "use strict";

  const FALLBACK = {
    world_location: "北京",
    scene_location: "高层公寓的起居室",
    current_activity: "安静地待着",
    emotional_aftertone: "",
    kk_presence: "away",
    scene_detail: { light: "留着一盏暖色的灯" },
  };

  function render(state) {
    const root = document.getElementById("companionWorldNow");
    if (!root) return;
    const location = root.querySelector("[data-world-location]");
    const activity = root.querySelector("[data-world-activity]");
    const detail = root.querySelector("[data-world-detail]");
    if (location) location.textContent = `${state.world_location} · ${state.scene_location}`;
    if (activity) activity.textContent = state.current_activity;
    const details = [state.scene_detail?.light, state.emotional_aftertone].filter(Boolean);
    if (detail) detail.textContent = details.join(" · ") || "时间在他的世界里继续";
    root.dataset.presence = state.kk_presence || "away";
  }

  async function refresh() {
    const client = window.supabaseClient;
    const userId = window.currentUserId;
    if (!client || !userId) {
      render(FALLBACK);
      return FALLBACK;
    }
    try {
      await client.rpc("get_or_init_companion_world", { p_user_id: userId });
      const { data, error } = await client
        .from("companion_world_state")
        .select("world_location,scene_location,scene_detail,current_activity,emotional_aftertone,kk_presence,last_scene_change_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      const state = { ...FALLBACK, ...(data || {}) };
      render(state);
      return state;
    } catch (error) {
      console.warn("[companion-world] now card unavailable", error);
      render(FALLBACK);
      return FALLBACK;
    }
  }

  window.SPCompanionWorld = { refresh, render };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
})(window);
