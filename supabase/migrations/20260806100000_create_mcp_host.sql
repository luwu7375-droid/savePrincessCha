CREATE TABLE IF NOT EXISTS public.mcp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  transport TEXT NOT NULL DEFAULT 'streamable_http'
    CHECK (transport IN ('streamable_http')),
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (status IN ('unverified', 'connected', 'error')),
  server_name TEXT,
  server_version TEXT,
  last_error TEXT,
  last_connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS public.mcp_connection_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.mcp_connections(id) ON DELETE CASCADE,
  remote_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  input_schema JSONB NOT NULL DEFAULT '{"type":"object","properties":{}}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  risk_level TEXT NOT NULL DEFAULT 'write'
    CHECK (risk_level IN ('read', 'write', 'high_risk')),
  requires_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, remote_name)
);

CREATE INDEX IF NOT EXISTS idx_mcp_connections_user
  ON public.mcp_connections(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_mcp_tools_connection
  ON public.mcp_connection_tools(connection_id, enabled);

ALTER TABLE public.mcp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_connection_tools ENABLE ROW LEVEL SECURITY;

-- Credentials are intentionally server-only. The mcp-host Edge Function
-- authenticates the user and returns a redacted view; clients never select
-- these tables directly.
REVOKE ALL ON public.mcp_connections FROM anon, authenticated;
REVOKE ALL ON public.mcp_connection_tools FROM anon, authenticated;
