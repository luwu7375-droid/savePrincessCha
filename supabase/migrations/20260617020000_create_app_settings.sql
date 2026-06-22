-- Create the singleton app_settings table for global live configuration.
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  model_main text NOT NULL DEFAULT 'general',
  model_game text NOT NULL DEFAULT 'general',
  model_diary text NOT NULL DEFAULT 'general',
  tool_mastodon_enabled boolean NOT NULL DEFAULT false,
  tool_stardew_enabled boolean NOT NULL DEFAULT false,
  tool_music_enabled boolean NOT NULL DEFAULT false,
  tool_reading_enabled boolean NOT NULL DEFAULT false,
  tool_forum_enabled boolean NOT NULL DEFAULT false,
  tool_web_explore_enabled boolean NOT NULL DEFAULT false,
  tool_web_explore_frequency text NOT NULL DEFAULT 'daily',
  tool_web_explore_token_cap integer NOT NULL DEFAULT 0,
  cha_activity_log_enabled boolean NOT NULL DEFAULT true,
  memory_enabled boolean NOT NULL DEFAULT true,
  hall_index_enabled boolean NOT NULL DEFAULT true,
  favorite_weight_enabled boolean NOT NULL DEFAULT true,
  theme_wallpaper text NOT NULL DEFAULT '',
  theme_avatar_user text NOT NULL DEFAULT '',
  theme_avatar_cha text NOT NULL DEFAULT '',
  theme_home_bg text NOT NULL DEFAULT '',
  theme_couple_space_bg text NOT NULL DEFAULT '',
  icon_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  bubble_css jsonb NOT NULL DEFAULT '{}'::jsonb,
  sticker_pack_default text NOT NULL DEFAULT 'default',
  reply_length text NOT NULL DEFAULT 'medium',
  reply_style text NOT NULL DEFAULT '',
  proactive_chat_probability numeric(4,3) NOT NULL DEFAULT 0,
  diary_auto_frequency text NOT NULL DEFAULT 'manual',
  favorite_prompt_strategy text NOT NULL DEFAULT 'conservative',
  dream_trigger_mode text NOT NULL DEFAULT 'manual',
  dream_source_default_weights jsonb NOT NULL DEFAULT
    '{"recent_favorite":0.35,"recent_chat":0.35,"random_memory":0.20,"fully_random":0.10}'::jsonb,
  mastodon_post_needs_approval boolean NOT NULL DEFAULT true,
  mastodon_post_delay text NOT NULL DEFAULT 'next_day_same_time',
  mastodon_post_audience text NOT NULL DEFAULT 'followers_only',
  voice_enabled boolean NOT NULL DEFAULT false,
  voice_tone_prompt text DEFAULT NULL,
  voice_id text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton_id_check
    CHECK (id = '00000000-0000-0000-0000-000000000001'),
  CONSTRAINT app_settings_web_frequency_check
    CHECK (tool_web_explore_frequency IN ('hourly', 'daily', 'manual')),
  CONSTRAINT app_settings_web_token_cap_check
    CHECK (tool_web_explore_token_cap >= 0),
  CONSTRAINT app_settings_icon_overrides_object_check
    CHECK (jsonb_typeof(icon_overrides) = 'object'),
  CONSTRAINT app_settings_bubble_css_object_check
    CHECK (jsonb_typeof(bubble_css) = 'object'),
  CONSTRAINT app_settings_reply_length_check
    CHECK (reply_length IN ('short', 'medium', 'long')),
  CONSTRAINT app_settings_proactive_probability_check
    CHECK (proactive_chat_probability >= 0 AND proactive_chat_probability <= 1),
  CONSTRAINT app_settings_diary_frequency_check
    CHECK (diary_auto_frequency IN ('daily', 'per_event', 'manual')),
  CONSTRAINT app_settings_dream_trigger_mode_check
    CHECK (dream_trigger_mode IN ('manual', 'manual_and_nightly')),
  CONSTRAINT app_settings_dream_weights_object_check
    CHECK (jsonb_typeof(dream_source_default_weights) = 'object'),
  CONSTRAINT app_settings_mastodon_audience_check
    CHECK (mastodon_post_audience IN ('followers_only', 'public'))
);

CREATE OR REPLACE FUNCTION public.set_app_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_app_settings_updated_at ON public.app_settings;

CREATE TRIGGER set_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_app_settings_updated_at();

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can manage app settings" ON public.app_settings;
DROP POLICY IF EXISTS "service_role full access to app settings" ON public.app_settings;

CREATE POLICY "authenticated can manage app settings"
  ON public.app_settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role full access to app settings"
  ON public.app_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.app_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
