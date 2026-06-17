export const APP_SETTINGS_SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

export type WebExploreFrequency = "hourly" | "daily" | "manual";
export type ReplyLength = "short" | "medium" | "long";
export type DiaryAutoFrequency = "daily" | "per_event" | "manual";
export type DreamTriggerMode = "manual" | "manual_and_nightly";
export type MastodonPostAudience = "followers_only" | "public";

export type DreamSourceDefaultWeights = {
  recent_favorite: number;
  recent_chat: number;
  random_memory: number;
  fully_random: number;
};

export type AppSettings = {
  id: typeof APP_SETTINGS_SINGLETON_ID;
  model_main: string;
  model_game: string;
  model_diary: string;
  tool_mastodon_enabled: boolean;
  tool_stardew_enabled: boolean;
  tool_music_enabled: boolean;
  tool_reading_enabled: boolean;
  tool_forum_enabled: boolean;
  tool_web_explore_enabled: boolean;
  tool_web_explore_frequency: WebExploreFrequency;
  tool_web_explore_token_cap: number;
  cha_activity_log_enabled: boolean;
  memory_enabled: boolean;
  hall_index_enabled: boolean;
  favorite_weight_enabled: boolean;
  theme_wallpaper: string;
  theme_avatar_user: string;
  theme_avatar_cha: string;
  theme_home_bg: string;
  theme_couple_space_bg: string;
  icon_overrides: Record<string, string>;
  bubble_css: Record<string, string>;
  sticker_pack_default: string;
  reply_length: ReplyLength;
  reply_style: string;
  proactive_chat_probability: number;
  diary_auto_frequency: DiaryAutoFrequency;
  favorite_prompt_strategy: string;
  dream_trigger_mode: DreamTriggerMode;
  dream_source_default_weights: DreamSourceDefaultWeights;
  mastodon_post_needs_approval: boolean;
  mastodon_post_delay: string;
  mastodon_post_audience: MastodonPostAudience;
  voice_enabled: boolean;
  voice_tone_prompt: string | null;
  voice_id: string | null;
  created_at: string;
  updated_at: string;
};
