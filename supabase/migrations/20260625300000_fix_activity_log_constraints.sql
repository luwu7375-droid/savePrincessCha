-- Fix cha_activity_log field constraints for phone/web feature
-- 1. want_to_share: remove enum constraint, allow free TEXT
-- 2. source_type: add 'system_action' to allowed values

-- Remove want_to_share enum constraint
ALTER TABLE public.cha_activity_log
  DROP CONSTRAINT IF EXISTS cha_activity_log_want_to_share_check;

COMMENT ON COLUMN public.cha_activity_log.want_to_share IS
  'Cha想跟KK分享这个的想法，一句话，可为空（自由TEXT，不是枚举）';

-- Update source_type constraint to include system_action
ALTER TABLE public.cha_activity_log
  DROP CONSTRAINT IF EXISTS cha_activity_log_source_type_check;

ALTER TABLE public.cha_activity_log
  ADD CONSTRAINT cha_activity_log_source_type_check
  CHECK (source_type IN ('user_link', 'chat_search', 'background_explore', 'system_action'));

COMMENT ON COLUMN public.cha_activity_log.source_type IS
  'Source of the activity: user_link (KK paste URL), chat_search (Cha search per chat), background_explore (Cha auto-browse), system_action (scheduler/system/failure log)';
