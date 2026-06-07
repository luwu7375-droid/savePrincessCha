-- ─────────────────────────────────────────────────────────────────────────────
-- Ombre Brain: 3-layer personality evolution system (Phase C)
-- Tables: persona_layer1_contexts, persona_layer2_dynamic_features,
--         persona_extraction_log
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Layer 1: human-maintained long-term features ─────────────────────────────
CREATE TABLE IF NOT EXISTS persona_layer1_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,

  -- Feature definition
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('context', 'preference', 'shared_memory', 'guideline')),
  content TEXT NOT NULL,

  -- Metadata
  importance INT DEFAULT 8 CHECK (importance BETWEEN 1 AND 10),
  reason TEXT,
  examples JSONB DEFAULT '[]'::jsonb,

  -- Decay parameters
  decay_factor FLOAT DEFAULT 0.02,
  resolved BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,

  CONSTRAINT user_l1_unique UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_l1_user_resolved
  ON persona_layer1_contexts (user_id, resolved);

-- ── Layer 2: LLM auto-extracted dynamic features ──────────────────────────────
CREATE TABLE IF NOT EXISTS persona_layer2_dynamic_features (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT,

  -- Feature definition
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('emotion', 'energy', 'style', 'obsession', 'relationship')),
  content TEXT,

  -- Strength and activation
  strength FLOAT DEFAULT 0.3 CHECK (strength BETWEEN 0.0 AND 1.0),
  importance INT DEFAULT 4 CHECK (importance BETWEEN 1 AND 7),
  activation_count INT DEFAULT 0,
  confidence FLOAT DEFAULT 0.0 CHECK (confidence BETWEEN 0.0 AND 1.0),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  first_detected_at TIMESTAMPTZ DEFAULT now(),
  last_reinforced_at TIMESTAMPTZ DEFAULT now(),

  -- Decay
  decay_rate FLOAT DEFAULT 0.95,
  calculated_score FLOAT DEFAULT 0.3,

  -- Emotion weight (from Chat Status at extraction time)
  valence FLOAT,
  arousal FLOAT,

  -- Context
  contexts JSONB DEFAULT '[]'::jsonb,
  examples JSONB DEFAULT '[]'::jsonb,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  reason_for_status TEXT,
  resolved BOOLEAN DEFAULT false,

  -- Misc
  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT user_feature_unique UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_l2_user_active_score
  ON persona_layer2_dynamic_features (user_id, status, calculated_score DESC);

CREATE INDEX IF NOT EXISTS idx_l2_user_decay
  ON persona_layer2_dynamic_features (user_id, last_reinforced_at);

-- ── Extraction log (debug) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS persona_extraction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  conversation_id TEXT,

  -- Extraction result
  raw_llm_response TEXT,
  extracted_features JSONB,
  features_accepted INT DEFAULT 0,
  features_skipped_low_confidence INT DEFAULT 0,
  processing_time_ms INT,

  -- Context
  route TEXT,
  valence FLOAT,
  arousal FLOAT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extraction_log_user_conv
  ON persona_extraction_log (user_id, conversation_id);

-- ── RLS: service-role only (Edge Functions bypass RLS with service_role key) ──
ALTER TABLE persona_layer1_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_layer2_dynamic_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_extraction_log ENABLE ROW LEVEL SECURITY;

-- Service role key bypasses RLS, so no policies needed for Edge Function access.
-- Add user-facing policies here if these tables are ever exposed via client SDK.
