create table if not exists public.app_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000001',
  model_main text not null default 'general',
  model_game text not null default 'general',
  model_diary text not null default 'general',
  tool_mastodon_enabled boolean not null default false,
  tool_stardew_enabled boolean not null default false,
  tool_music_enabled boolean not null default false,
  tool_reading_enabled boolean not null default false,
  tool_forum_enabled boolean not null default false,
  tool_web_explore_enabled boolean not null default false,
  tool_web_explore_frequency text not null default 'daily',
  tool_web_explore_token_cap integer not null default 0,
  cha_activity_log_enabled boolean not null default true,
  memory_enabled boolean not null default true,
  hall_index_enabled boolean not null default true,
  favorite_weight_enabled boolean not null default true,
  theme_wallpaper text not null default '',
  theme_avatar_user text not null default '',
  theme_avatar_cha text not null default '',
  theme_home_bg text not null default '',
  theme_couple_space_bg text not null default '',
  icon_overrides jsonb not null default '{}'::jsonb,
  bubble_css jsonb not null default '{}'::jsonb,
  sticker_pack_default text not null default 'default',
  reply_length text not null default 'medium',
  reply_style text not null default '',
  proactive_chat_probability numeric(4,3) not null default 0,
  diary_auto_frequency text not null default 'manual',
  favorite_prompt_strategy text not null default 'conservative',
  dream_trigger_mode text not null default 'manual',
  dream_source_default_weights jsonb not null default
    '{"recent_favorite":0.35,"recent_chat":0.35,"random_memory":0.20,"fully_random":0.10}'::jsonb,
  mastodon_post_needs_approval boolean not null default true,
  mastodon_post_delay text not null default 'next_day_same_time',
  mastodon_post_audience text not null default 'followers_only',
  voice_enabled boolean not null default false,
  voice_tone_prompt text default null,
  voice_id text default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton_id_check
    check (id = '00000000-0000-0000-0000-000000000001'),
  constraint app_settings_web_frequency_check
    check (tool_web_explore_frequency in ('hourly', 'daily', 'manual')),
  constraint app_settings_web_token_cap_check
    check (tool_web_explore_token_cap >= 0),
  constraint app_settings_icon_overrides_object_check
    check (jsonb_typeof(icon_overrides) = 'object'),
  constraint app_settings_bubble_css_object_check
    check (jsonb_typeof(bubble_css) = 'object'),
  constraint app_settings_reply_length_check
    check (reply_length in ('short', 'medium', 'long')),
  constraint app_settings_proactive_probability_check
    check (proactive_chat_probability >= 0 and proactive_chat_probability <= 1),
  constraint app_settings_diary_frequency_check
    check (diary_auto_frequency in ('daily', 'per_event', 'manual')),
  constraint app_settings_dream_trigger_mode_check
    check (dream_trigger_mode in ('manual', 'manual_and_nightly')),
  constraint app_settings_dream_weights_object_check
    check (jsonb_typeof(dream_source_default_weights) = 'object'),
  constraint app_settings_mastodon_audience_check
    check (mastodon_post_audience in ('followers_only', 'public'))
);

create or replace function public.set_app_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_app_settings_updated_at on public.app_settings;

create trigger set_app_settings_updated_at
  before update on public.app_settings
  for each row
  execute function public.set_app_settings_updated_at();

alter table public.app_settings enable row level security;

drop policy if exists "authenticated can manage app settings" on public.app_settings;
drop policy if exists "service_role full access to app settings" on public.app_settings;

create policy "authenticated can manage app settings"
  on public.app_settings
  for all
  to authenticated
  using (true)
  with check (true);

create policy "service_role full access to app settings"
  on public.app_settings
  for all
  to service_role
  using (true)
  with check (true);

insert into public.app_settings (id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;
