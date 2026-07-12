// Run this in the savePrincessCha chat page browser console.
// It exports the existing chat TTS configuration for ChaBridge.
// Do not invent or edit voice_id values here; this reads current chat settings.

(async () => {
  function parseJson(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function hasVoiceId(cfg) {
    const text = JSON.stringify(cfg || {});
    return /voice[_-]?id|voiceId|selectedVoiceId|selected_voice_id/.test(text);
  }

  let source = "";
  let ttsConfig = null;

  if (window.SPVoice?.getTTSConfig) {
    ttsConfig = window.SPVoice.getTTSConfig();
    source = "SPVoice.getTTSConfig()";
  }

  if (!hasVoiceId(ttsConfig)) {
    const local = parseJson(localStorage.getItem("voice_tts_config"));
    if (local) {
      ttsConfig = local;
      source = "localStorage.voice_tts_config";
    }
  }

  if (!hasVoiceId(ttsConfig) && window.supabaseClient && window.currentUserId) {
    const { data, error } = await window.supabaseClient
      .from("user_preferences")
      .select("preferences")
      .eq("user_id", window.currentUserId)
      .maybeSingle();
    if (!error && data?.preferences?.voice_tts_config) {
      ttsConfig = data.preferences.voice_tts_config;
      source = "Supabase user_preferences.voice_tts_config";
    }
  }

  if (!ttsConfig) {
    console.warn("No chat TTS config found. Open Settings > 声音与朗读, save the voice settings, then run this again.");
    return;
  }

  const exported = { tts_config: ttsConfig };
  const json = JSON.stringify(exported, null, 2);

  console.log("ChaBridge TTS config source:", source || "unknown");
  console.log("Contains voice id field:", hasVoiceId(ttsConfig));
  console.log("Save this JSON as scripts/cha_bridge/data/chat_tts_config.json:");
  console.log(json);

  if (!hasVoiceId(ttsConfig)) {
    console.warn("The config was found, but it does not appear to contain a real voice id. Check Settings > 声音与朗读.");
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(json);
      console.log("Copied JSON to clipboard.");
    } catch {
      console.warn("Clipboard write failed. Copy the JSON printed above.");
    }
  }
})();
