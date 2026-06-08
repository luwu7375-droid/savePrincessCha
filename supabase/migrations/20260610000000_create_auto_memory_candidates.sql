-- Auto Memory Vault P1: candidate pool only.
-- Candidates are never auto-promoted to memories in this phase.
-- promoted_memory_id kept nullable for future P2 promotion flow.
--
-- recommended_action: output of LLM + rule classification
-- status: lifecycle state managed by admin/future automation
-- content_hash: SHA-256 prefix (16 hex chars) for dedup per user

CREATE TABLE IF NOT EXISTS auto_memory_candidates (
  id                  text         PRIMARY KEY,
  user_id             uuid         NOT NULL,
  conversation_id     uuid         NULL,
  source_msg_ids      bigint[]     DEFAULT NULL,
  candidate_type      text         NOT NULL CHECK (candidate_type IN (
                        'fact', 'preference', 'relationship', 'event', 'emotion', 'project'
                      )),
  content             text         NOT NULL,
  content_hash        text         NULL,
  confidence          numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  sensitivity         numeric(4,3) NOT NULL CHECK (sensitivity BETWEEN 0 AND 1),
  recommended_action  text         NOT NULL CHECK (recommended_action IN (
                        'auto_accept', 'pending', 'quarantine', 'reject'
                      )),
  status              text         NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new', 'promoted', 'rejected', 'quarantined', 'ignored')),
  reason              text         NULL,
  promoted_memory_id  text         NULL,
  created_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amc_user_id
  ON auto_memory_candidates(user_id);

CREATE INDEX IF NOT EXISTS idx_amc_user_status
  ON auto_memory_candidates(user_id, status);

CREATE INDEX IF NOT EXISTS idx_amc_content_hash
  ON auto_memory_candidates(user_id, content_hash)
  WHERE content_hash IS NOT NULL;
