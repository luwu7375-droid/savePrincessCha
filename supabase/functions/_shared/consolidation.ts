// ── consolidation.ts ──────────────────────────────────────────────────────────
//
// Nightly memory consolidation: cluster candidates into narrative episodes

import type {
  MemoryCandidate,
  NarrativeEpisode,
  ConsolidationInput,
  ConsolidationResult,
  CandidateCluster,
  EpisodeType,
} from "./consolidation-types.ts";

function dbHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Fetch memory candidates since last consolidation
 */
async function fetchCandidates(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  sinceTimestamp: string,
  untilTimestamp?: string
): Promise<MemoryCandidate[]> {
  const query = new URLSearchParams({
    select: "*",
    user_id: `eq.${userId}`,
    created_at: `gte.${sinceTimestamp}`,
    promoted_to_memory: "eq.false", // Only unprocessed candidates
    order: "created_at.asc",
  });

  if (untilTimestamp) {
    query.append("created_at", `lte.${untilTimestamp}`);
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/auto_memory_candidates?${query}`,
    { headers: dbHeaders(serviceRoleKey) }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch candidates: ${res.status}`);
  }

  const candidates = await res.json() as MemoryCandidate[];
  return Array.isArray(candidates) ? candidates : [];
}

/**
 * Simple clustering by time windows and keywords
 */
function clusterCandidates(candidates: MemoryCandidate[]): CandidateCluster[] {
  if (candidates.length === 0) return [];

  const clusters: CandidateCluster[] = [];
  const TIME_WINDOW_HOURS = 24; // Group candidates within 24 hours

  // Sort by time
  const sorted = [...candidates].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  let currentCluster: MemoryCandidate[] = [sorted[0]];
  let clusterStart = new Date(sorted[0].created_at);

  for (let i = 1; i < sorted.length; i++) {
    const candidate = sorted[i];
    const candidateTime = new Date(candidate.created_at);
    const hoursSinceClusterStart =
      (candidateTime.getTime() - clusterStart.getTime()) / (1000 * 60 * 60);

    // Check if within time window
    if (hoursSinceClusterStart <= TIME_WINDOW_HOURS) {
      currentCluster.push(candidate);
    } else {
      // Finalize current cluster
      if (currentCluster.length > 0) {
        clusters.push(buildCluster(currentCluster));
      }
      // Start new cluster
      currentCluster = [candidate];
      clusterStart = candidateTime;
    }
  }

  // Add final cluster
  if (currentCluster.length > 0) {
    clusters.push(buildCluster(currentCluster));
  }

  return clusters;
}

/**
 * Build a cluster from candidates
 */
function buildCluster(candidates: MemoryCandidate[]): CandidateCluster {
  const mergedContent = candidates.map((c) => c.content).join("\n");
  const avgConfidence =
    candidates.reduce((sum, c) => sum + c.confidence, 0) / candidates.length;

  // Determine episode type based on categories
  const categories = candidates.map((c) => c.category.toLowerCase());
  const episodeType = inferEpisodeType(categories, mergedContent);

  // Extract theme
  const theme = extractTheme(candidates);

  return {
    theme,
    candidates,
    merged_content: mergedContent,
    episode_type: episodeType,
    significance: Math.round(avgConfidence),
  };
}

/**
 * Infer episode type from categories and content
 */
function inferEpisodeType(
  categories: string[],
  content: string
): EpisodeType {
  const contentLower = content.toLowerCase();

  // Check for preferences
  if (
    categories.some((cat) => cat.includes("preference")) ||
    /喜欢|不喜欢|偏好|习惯/.test(contentLower)
  ) {
    return "preference";
  }

  // Check for relationship events
  if (
    categories.some((cat) => cat.includes("relationship")) ||
    /一起|共同|我们|约定/.test(contentLower)
  ) {
    return "relationship_event";
  }

  // Check for unfinished threads
  if (
    /未完成|待办|下次|以后|打算/.test(contentLower)
  ) {
    return "unfinished_thread";
  }

  // Check for shared experiences
  if (
    /经历|体验|发生|遇到/.test(contentLower)
  ) {
    return "shared_experience";
  }

  // Default to fact
  return "fact";
}

/**
 * Extract theme from candidates
 */
function extractTheme(candidates: MemoryCandidate[]): string {
  // Simple approach: use first candidate's category or extract from content
  if (candidates.length === 0) return "未分类";

  const firstCandidate = candidates[0];
  if (firstCandidate.category && firstCandidate.category !== "general") {
    return firstCandidate.category;
  }

  // Extract from content (very simple keyword matching)
  const content = candidates.map((c) => c.content).join(" ");
  const keywords = [
    "工作",
    "学习",
    "生活",
    "情感",
    "健康",
    "娱乐",
    "旅行",
    "计划",
  ];

  for (const keyword of keywords) {
    if (content.includes(keyword)) {
      return keyword;
    }
  }

  return "日常";
}

/**
 * Generate narrative episode from cluster
 */
function generateEpisode(
  cluster: CandidateCluster,
  userId: string,
  consolidationRunId: string
): Omit<NarrativeEpisode, "id" | "created_at" | "updated_at"> {
  const sourceMemoryIds = cluster.candidates.map((c) => c.id);
  const sourceMsgIds = cluster.candidates
    .flatMap((c) => c.source_msg_ids || [])
    .filter((id, index, arr) => arr.indexOf(id) === index); // Dedupe

  const sourceConversations = cluster.candidates
    .map((c) => c.source_conversation_id)
    .filter((id) => id !== null) as string[];

  // Generate title
  const title = generateTitle(cluster);

  // Generate narrative content
  const narrativeContent = generateNarrative(cluster);

  // Extract Cha's feeling
  const chaFeeling = extractChaFeeling(cluster);

  return {
    user_id: userId,
    episode_type: cluster.episode_type,
    title,
    narrative_content: narrativeContent,
    facts_extracted: null, // TODO: Extract structured facts
    cha_feeling: chaFeeling,
    source_memory_ids: sourceMemoryIds,
    source_msg_ids: sourceMsgIds,
    source_conversations: sourceConversations.length > 0 ? sourceConversations : null,
    source_time_range: null, // TODO: Format as TSTZRANGE
    themes: [cluster.theme],
    related_episodes: [],
    significance: cluster.significance,
    user_confirmed: false,
    user_favorited: false,
    consolidation_run_id: consolidationRunId,
    consolidation_batch: new Date().toISOString().split("T")[0], // YYYY-MM-DD
    consolidation_model: "simple-clustering-v1",
    reality_layer: "shared_reality",
    reliability: "verified",
    source_event_ids: [],
  };
}

/**
 * Generate title for episode
 */
function generateTitle(cluster: CandidateCluster): string {
  const maxLength = 50;
  const firstContent = cluster.candidates[0].content;

  // Extract first sentence or meaningful phrase
  const firstSentence = firstContent.split(/[。！？\n]/)[0];
  const title = firstSentence.length > maxLength
    ? firstSentence.slice(0, maxLength) + "..."
    : firstSentence;

  return title || "记忆片段";
}

/**
 * Generate narrative content
 */
function generateNarrative(cluster: CandidateCluster): string {
  // Combine all candidate contents with deduplication
  const uniqueContents = [...new Set(cluster.candidates.map((c) => c.content))];
  return uniqueContents.join("\n\n");
}

/**
 * Extract Cha's feeling from candidates
 */
function extractChaFeeling(cluster: CandidateCluster): string | null {
  // Look for Cha's perspective in the content
  const contents = cluster.candidates.map((c) => c.content).join(" ");

  const feelingPatterns = [
    /小cha.*?(感觉|觉得|认为|想).{1,50}/g,
    /cha.*?(开心|难过|担心|期待).{1,30}/g,
  ];

  for (const pattern of feelingPatterns) {
    const matches = contents.match(pattern);
    if (matches && matches.length > 0) {
      return matches[0];
    }
  }

  return null;
}

/**
 * Insert episode into database
 */
async function insertEpisode(
  supabaseUrl: string,
  serviceRoleKey: string,
  episode: Omit<NarrativeEpisode, "id" | "created_at" | "updated_at">
): Promise<string> {
  const res = await fetch(`${supabaseUrl}/rest/v1/narrative_episodes`, {
    method: "POST",
    headers: { ...dbHeaders(serviceRoleKey), Prefer: "return=representation" },
    body: JSON.stringify(episode),
  });

  if (!res.ok) {
    throw new Error(`Failed to insert episode: ${res.status} ${await res.text()}`);
  }

  const created = await res.json() as NarrativeEpisode[];
  return created[0].id;
}

/**
 * Mark candidates as consolidated
 */
async function markCandidatesConsolidated(
  supabaseUrl: string,
  serviceRoleKey: string,
  candidateIds: string[],
  episodeId: string
): Promise<void> {
  if (candidateIds.length === 0) return;

  // Update candidates to mark as promoted
  const res = await fetch(`${supabaseUrl}/rest/v1/auto_memory_candidates`, {
    method: "PATCH",
    headers: dbHeaders(serviceRoleKey),
    body: JSON.stringify({
      promoted_to_memory: true,
      promoted_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    console.error(`Failed to mark candidates as consolidated: ${res.status}`);
  }
}

/**
 * Main consolidation function
 */
export async function consolidateMemoryCandidates(
  supabaseUrl: string,
  serviceRoleKey: string,
  input: ConsolidationInput
): Promise<ConsolidationResult> {
  const result: ConsolidationResult = {
    candidates_processed: 0,
    episodes_created: 0,
    duplicates_merged: 0,
    unchanged: 0,
    errors: [],
    created_episode_ids: [],
  };

  const consolidationRunId = crypto.randomUUID();

  try {
    // Fetch candidates
    const candidates = await fetchCandidates(
      supabaseUrl,
      serviceRoleKey,
      input.userId,
      input.sinceTimestamp,
      input.untilTimestamp
    );

    result.candidates_processed = candidates.length;

    if (candidates.length === 0) {
      return result;
    }

    // Cluster candidates
    const clusters = clusterCandidates(candidates);

    console.log(JSON.stringify({
      fn: "consolidateMemoryCandidates",
      event: "clusters_created",
      userId: input.userId.slice(0, 6),
      clusters_count: clusters.length,
      candidates_count: candidates.length,
    }));

    // Generate and insert episodes
    for (const cluster of clusters) {
      try {
        const episode = generateEpisode(cluster, input.userId, consolidationRunId);

        if (input.dryRun) {
          console.log(JSON.stringify({
            fn: "consolidateMemoryCandidates",
            event: "dry_run_episode",
            title: episode.title,
            type: episode.episode_type,
            candidates: cluster.candidates.length,
          }));
          result.episodes_created++;
          continue;
        }

        // Insert episode
        const episodeId = await insertEpisode(supabaseUrl, serviceRoleKey, episode);
        result.created_episode_ids.push(episodeId);
        result.episodes_created++;

        // Mark candidates as consolidated
        await markCandidatesConsolidated(
          supabaseUrl,
          serviceRoleKey,
          cluster.candidates.map((c) => c.id),
          episodeId
        );

        console.log(JSON.stringify({
          fn: "consolidateMemoryCandidates",
          event: "episode_created",
          episodeId: episodeId.slice(0, 8),
          title: episode.title,
          type: episode.episode_type,
        }));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Cluster ${cluster.theme}: ${errorMsg}`);
        console.error(JSON.stringify({
          fn: "consolidateMemoryCandidates",
          event: "episode_creation_error",
          error: errorMsg,
        }));
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Fatal: ${errorMsg}`);
    console.error(JSON.stringify({
      fn: "consolidateMemoryCandidates",
      event: "fatal_error",
      error: errorMsg,
    }));
  }

  return result;
}
