// ── source-backed-memory-types.ts ─────────────────────────────────────────────
//
// Type definitions for source-backed memory retrieval

export interface SourceExcerpt {
  message_id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  conversation_id: string;
  author?: string; // "kk" or "小cha"
}

export interface RetrieveSourcesInput {
  memoryIds: string[];
  maxExcerptsPerMemory?: number;
  includeConversationContext?: boolean;
}

export interface RetrieveSourcesResult {
  sources: Record<string, SourceExcerpt[]>; // memoryId -> excerpts
  unavailable: string[]; // memoryIds with no sources
  errors: Record<string, string>; // memoryId -> error reason
}

export interface MemoryWithSources {
  id: string;
  content: string;
  category: string;
  created_at: string;
  source_msg_ids: number[] | null;
  source_conversation_id: string | null;
  source_start_at: string | null;
  source_end_at: string | null;
  extraction_model: string | null;
  extraction_version: string | null;
  sources?: SourceExcerpt[]; // Populated by retrieveMemorySources
  source_unavailable?: boolean;
}
