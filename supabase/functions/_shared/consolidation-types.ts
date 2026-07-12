// ── consolidation-types.ts ────────────────────────────────────────────────────
//
// Type definitions for nightly memory consolidation

export type EpisodeType =
  | "fact"
  | "preference"
  | "relationship_event"
  | "unfinished_thread"
  | "shared_experience"
  | "cha_reflection";

export interface MemoryCandidate {
  id: string;
  user_id: string;
  content: string;
  category: string;
  confidence: number;
  sensitivity: number;
  source_msg_ids: number[] | null;
  source_conversation_id: string | null;
  source_start_at: string | null;
  source_end_at: string | null;
  created_at: string;
}

export interface NarrativeEpisode {
  id: string;
  user_id: string;
  episode_type: EpisodeType;
  title: string;
  narrative_content: string;
  facts_extracted: Record<string, unknown> | null;
  cha_feeling: string | null;
  source_memory_ids: string[];
  source_msg_ids: number[];
  source_conversations: string[] | null;
  source_time_range: string | null; // TSTZRANGE as string
  themes: string[];
  related_episodes: string[];
  significance: number | null;
  user_confirmed: boolean;
  user_favorited: boolean;
  consolidation_run_id: string | null;
  consolidation_batch: string | null;
  consolidation_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsolidationInput {
  userId: string;
  sinceTimestamp: string;
  untilTimestamp?: string;
  dryRun?: boolean;
}

export interface ConsolidationResult {
  candidates_processed: number;
  episodes_created: number;
  duplicates_merged: number;
  unchanged: number;
  errors: string[];
  created_episode_ids: string[];
}

export interface CandidateCluster {
  theme: string;
  candidates: MemoryCandidate[];
  merged_content: string;
  episode_type: EpisodeType;
  significance: number;
}
