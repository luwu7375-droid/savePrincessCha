-- Migration: Create push_subscriptions table for Web Push delivery
-- Stores PushSubscription objects from browser pushManager.subscribe() calls.
-- One user may have multiple devices/browsers subscribed.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- PushSubscription.endpoint (unique per device/browser)
  endpoint TEXT NOT NULL UNIQUE,

  -- PushSubscription.keys.p256dh and .auth (base64 encoded)
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,

  -- Optional device/browser fingerprint for debugging
  user_agent TEXT,

  -- Subscription validity tracking
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_success_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast user lookup
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id) WHERE enabled = true;

-- Index for endpoint uniqueness check
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON public.push_subscriptions(endpoint);

-- RLS policies
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can insert their own subscriptions
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can insert own subscriptions" ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own subscriptions
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view own subscriptions" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own subscriptions (e.g., disable)
DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can update own subscriptions" ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own subscriptions
DROP POLICY IF EXISTS "Users can delete own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete own subscriptions" ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Service role can read all (for push-send function)
DROP POLICY IF EXISTS "Service role can read all subscriptions" ON public.push_subscriptions;
CREATE POLICY "Service role can read all subscriptions" ON public.push_subscriptions
  FOR SELECT TO service_role
  USING (true);

-- Service role can update subscription status (failure tracking)
DROP POLICY IF EXISTS "Service role can update subscription status" ON public.push_subscriptions;
CREATE POLICY "Service role can update subscription status" ON public.push_subscriptions
  FOR UPDATE TO service_role
  USING (true);

COMMENT ON TABLE public.push_subscriptions IS
  'Web Push subscriptions for proactive notifications. Each row represents one device/browser subscription. Subscriptions are automatically cleaned up when the user is deleted.';

COMMENT ON COLUMN public.push_subscriptions.endpoint IS
  'Unique push service endpoint from PushSubscription.endpoint';

COMMENT ON COLUMN public.push_subscriptions.p256dh IS
  'Public key for message encryption (PushSubscription.keys.p256dh), base64 encoded';

COMMENT ON COLUMN public.push_subscriptions.auth IS
  'Authentication secret for message encryption (PushSubscription.keys.auth), base64 encoded';

COMMENT ON COLUMN public.push_subscriptions.failure_count IS
  'Incremented on delivery failure (410 Gone, network error). Subscription disabled after 3 failures.';
