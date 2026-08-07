CREATE TABLE IF NOT EXISTS public.mcp_tool_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  tool_alias TEXT NOT NULL,
  remote_name TEXT NOT NULL,
  arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('read', 'write', 'high_risk')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'executing', 'completed', 'failed')),
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_tool_approvals_claim
  ON public.mcp_tool_approvals (id, user_id, conversation_id, status, expires_at);

ALTER TABLE public.mcp_tool_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_tool_approvals FROM anon, authenticated;
