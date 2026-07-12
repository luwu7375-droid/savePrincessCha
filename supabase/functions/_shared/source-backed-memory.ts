// ── source-backed-memory.ts ───────────────────────────────────────────────────
//
// Core implementation for retrieving source messages from memories
// Used by memories API endpoint and chat context compilation

import type {
  SourceExcerpt,
  RetrieveSourcesInput,
  RetrieveSourcesResult,
  MemoryWithSources,
} from "./source-backed-memory-types.ts";

const MAX_EXCERPTS_DEFAULT = 5;
const MAX_EXCERPT_LENGTH = 200;

/**
 * Retrieve source message excerpts for given memory IDs
 */
export async function retrieveMemorySources(
  supabaseUrl: string,
  serviceRoleKey: string,
  input: RetrieveSourcesInput
): Promise<RetrieveSourcesResult> {
  const { memoryIds, maxExcerptsPerMemory = MAX_EXCERPTS_DEFAULT } = input;

  const result: RetrieveSourcesResult = {
    sources: {},
    unavailable: [],
    errors: {},
  };

  if (!memoryIds || memoryIds.length === 0) {
    return result;
  }

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  try {
    // Step 1: Fetch memories with source_msg_ids
    const memoriesUrl = `${supabaseUrl}/rest/v1/memories?select=id,source_msg_ids,source_conversation_id&id=in.(${memoryIds.join(",")})`;
    const memoriesRes = await fetch(memoriesUrl, { headers });

    if (!memoriesRes.ok) {
      const errorText = await memoriesRes.text();
      throw new Error(`Failed to fetch memories: ${memoriesRes.status} ${errorText}`);
    }

    const memories = await memoriesRes.json() as Array<{
      id: string;
      source_msg_ids: number[] | null;
      source_conversation_id: string | null;
    }>;

    // Step 2: For each memory, fetch source messages
    for (const memory of memories) {
      if (!memory.source_msg_ids || memory.source_msg_ids.length === 0) {
        result.unavailable.push(memory.id);
        continue;
      }

      try {
        const msgIds = memory.source_msg_ids.slice(0, maxExcerptsPerMemory);
        const messagesUrl = `${supabaseUrl}/rest/v1/messages?select=id,role,content,created_at,conversation_id&id=in.(${msgIds.join(",")})&order=created_at.asc`;
        const messagesRes = await fetch(messagesUrl, { headers });

        if (!messagesRes.ok) {
          result.errors[memory.id] = `HTTP ${messagesRes.status}`;
          continue;
        }

        const messages = await messagesRes.json() as Array<{
          id: number;
          role: string;
          content: string;
          created_at: string;
          conversation_id: string;
        }>;

        if (messages.length === 0) {
          result.unavailable.push(memory.id);
          continue;
        }

        // Map to SourceExcerpt format
        const excerpts: SourceExcerpt[] = messages.map((msg) => ({
          message_id: msg.id,
          role: msg.role as "user" | "assistant",
          content: truncateExcerpt(msg.content),
          created_at: msg.created_at,
          conversation_id: msg.conversation_id,
          author: msg.role === "user" ? "kk" : "小cha",
        }));

        result.sources[memory.id] = excerpts;
      } catch (err) {
        result.errors[memory.id] = err instanceof Error ? err.message : String(err);
      }
    }

    // Step 3: Mark any requested IDs that weren't found
    for (const memId of memoryIds) {
      if (!result.sources[memId] && !result.unavailable.includes(memId) && !result.errors[memId]) {
        result.unavailable.push(memId);
      }
    }
  } catch (err) {
    console.error("retrieveMemorySources error:", err);
    // Mark all as errors if the entire operation fails
    for (const memId of memoryIds) {
      if (!result.sources[memId] && !result.unavailable.includes(memId)) {
        result.errors[memId] = err instanceof Error ? err.message : String(err);
      }
    }
  }

  return result;
}

/**
 * Truncate excerpt to max length
 */
function truncateExcerpt(content: string, maxLen = MAX_EXCERPT_LENGTH): string {
  if (!content) return "";
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen) + "…";
}

/**
 * Enrich memories with their source excerpts
 */
export async function enrichMemoriesWithSources(
  supabaseUrl: string,
  serviceRoleKey: string,
  memories: MemoryWithSources[]
): Promise<MemoryWithSources[]> {
  if (memories.length === 0) return memories;

  const memoryIds = memories.map((m) => m.id);
  const sourcesResult = await retrieveMemorySources(supabaseUrl, serviceRoleKey, {
    memoryIds,
    maxExcerptsPerMemory: 5,
  });

  return memories.map((memory) => {
    if (sourcesResult.sources[memory.id]) {
      return {
        ...memory,
        sources: sourcesResult.sources[memory.id],
        source_unavailable: false,
      };
    } else if (sourcesResult.unavailable.includes(memory.id)) {
      return {
        ...memory,
        sources: [],
        source_unavailable: true,
      };
    } else {
      return {
        ...memory,
        sources: [],
        source_unavailable: memory.source_msg_ids === null, // Legacy memories
      };
    }
  });
}

/**
 * Format source excerpts for prompt injection
 * Clearly distinguishes between "original conversation" and "AI extraction"
 */
export function formatSourcesForPrompt(memory: MemoryWithSources): string {
  if (!memory.sources || memory.sources.length === 0) {
    if (memory.source_unavailable) {
      return `[记忆来源：原始消息不可用]`;
    }
    return `[记忆来源：未关联原始消息（旧记忆）]`;
  }

  const excerptLines = memory.sources.map((src) => {
    const timestamp = new Date(src.created_at).toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `  ${timestamp} ${src.author}: ${src.content}`;
  });

  return [
    `[记忆来源：原始对话片段]`,
    ...excerptLines,
    `[AI 提炼内容]`,
    `  ${memory.content}`,
  ].join("\n");
}
