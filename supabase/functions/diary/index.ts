// Diary Generation Function - First-person Diary Draft MVP
// Generates Cha's private diary entries from various sources
// Does NOT auto-promote to memories or inject into compileMemoryContext

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SourceEvent = {
  id: string;
  source_type: "chat" | "dream" | "mastodon" | "web_explore" | "book" | "movie" | "music";
  source_boundary: "current_experience" | "shared_activity" | "self_life" | "south_city_old_stories" | "project_reference" | "dream_imagination";
  role?: "user" | "assistant";
  content: string;
  created_at: string;
  with_kk?: boolean;
  reliability?: "experienced" | "archived" | "imagined";
  metadata?: Record<string, unknown>;
};

type DiaryGenerationRequest = {
  userId?: string;
  conversationId?: string;
  source_events: SourceEvent[];
  scene_context?: string;
  cha_status?: string;
  diary_length?: "tiny" | "short" | "normal" | "long";
  debug?: boolean;
};

type DiaryOutput = {
  diary_type: string;
  source_types: string[];
  source_event_ids: string[];
  source_boundary: string;
  title: string;
  private_body: string;
  memory_summary: string;
  felt_sense: string;
  stuck_point: string;
  insight: string;
  changed: string;
  want_to_share: string;
  should_promote_to_identity_brain: boolean;
  promotion_reason: string;
};

type CheckerOutput = {
  pass: boolean;
  problems: string[];
  suggested_fix: string;
  safe_to_promote: boolean;
  retry_instruction: string;
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const body: DiaryGenerationRequest = await req.json();
    const {
      userId = "default",
      conversationId,
      source_events,
      scene_context = "",
      cha_status = "",
      diary_length = "normal",
      debug = false,
    } = body;

    // Validate source_events
    if (!source_events || source_events.length === 0) {
      return new Response(
        JSON.stringify({ error: "source_events is required and must not be empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read prompts from files (stored in function directory)
    const diaryPromptPath = new URL("./xiaocha_diary_prompt.md", import.meta.url).pathname;
    const checkerPromptPath = new URL("./xiaocha_diary_checker_prompt.md", import.meta.url).pathname;

    const diaryPromptTemplate = await Deno.readTextFile(diaryPromptPath);
    const checkerPromptTemplate = await Deno.readTextFile(checkerPromptPath);

    // Build diary prompt
    const sourceEventsText = source_events.map((evt, idx) => {
      return `[事件 ${idx + 1}]
id: ${evt.id}
source_type: ${evt.source_type}
source_boundary: ${evt.source_boundary}
${evt.role ? `role: ${evt.role}` : ""}
with_kk: ${evt.with_kk ?? false}
reliability: ${evt.reliability ?? "experienced"}
created_at: ${evt.created_at}
content: ${evt.content}
---`;
    }).join("\n\n");

    const diaryPrompt = diaryPromptTemplate
      .replace("{{source_events}}", sourceEventsText)
      .replace("{{scene_context}}", scene_context)
      .replace("{{cha_status}}", cha_status)
      .replace("{{diary_length}}", diary_length);

    // Call LLM to generate diary
    const diaryResponse = await callLLM(diaryPrompt, "diary_generation");

    let diaryJson: DiaryOutput;
    try {
      diaryJson = JSON.parse(diaryResponse);
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: "Failed to parse diary JSON",
          raw_response: debug ? diaryResponse : undefined
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate diary JSON schema
    const validationError = validateDiarySchema(diaryJson);
    if (validationError) {
      return new Response(
        JSON.stringify({
          error: "Invalid diary schema",
          details: validationError,
          diary: debug ? diaryJson : undefined
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call checker
    const checkerPrompt = checkerPromptTemplate.replace(
      "{{diary_json}}",
      JSON.stringify(diaryJson, null, 2)
    );

    const checkerResponse = await callLLM(checkerPrompt, "diary_checker");

    let checkerJson: CheckerOutput;
    try {
      checkerJson = JSON.parse(checkerResponse);
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: "Failed to parse checker JSON",
          raw_response: debug ? checkerResponse : undefined
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine final status
    let finalStatus: "draft" | "checked" | "failed_check" = "draft";
    if (checkerJson.pass) {
      finalStatus = "checked";
    } else if (checkerJson.problems.length > 0) {
      finalStatus = "failed_check";
    }

    // Save to database only if checker passes OR if debug mode
    const shouldSave = checkerJson.pass || debug;

    if (shouldSave) {
      const { error: insertError } = await supabaseClient
        .from("xiaocha_diary_entries")
        .insert({
          user_id: userId,
          conversation_id: conversationId,
          source_event_ids: diaryJson.source_event_ids,
          source_types: diaryJson.source_types,
          source_boundary: diaryJson.source_boundary,
          diary_type: diaryJson.diary_type,
          diary_length,
          title: diaryJson.title,
          private_body: diaryJson.private_body,
          memory_summary: diaryJson.memory_summary,
          felt_sense: diaryJson.felt_sense,
          stuck_point: diaryJson.stuck_point,
          insight: diaryJson.insight,
          changed: diaryJson.changed,
          want_to_share: diaryJson.want_to_share,
          checker_pass: checkerJson.pass,
          checker_problems: checkerJson.problems,
          checker_suggested_fix: checkerJson.suggested_fix,
          checker_retry_instruction: checkerJson.retry_instruction,
          should_promote_to_identity_brain: diaryJson.should_promote_to_identity_brain,
          promotion_reason: diaryJson.promotion_reason,
          safe_to_promote: checkerJson.safe_to_promote,
          status: finalStatus,
        });

      if (insertError) {
        console.error("Failed to insert diary entry:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to save diary entry", details: insertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        saved: shouldSave,
        checker_pass: checkerJson.pass,
        status: finalStatus,
        diary: debug ? diaryJson : { title: diaryJson.title, want_to_share: diaryJson.want_to_share },
        checker: debug ? checkerJson : { pass: checkerJson.pass, problems: checkerJson.problems },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Diary generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// LLM call function (reuses existing provider logic)
async function callLLM(prompt: string, task: string): Promise<string> {
  const provider = Deno.env.get("FIFTYFIVE_BASE_URL") ? "55api" : "fuka";
  const baseUrl = provider === "55api"
    ? Deno.env.get("FIFTYFIVE_BASE_URL")
    : Deno.env.get("FUKA_BASE_URL");
  const apiKey = provider === "55api"
    ? Deno.env.get("FIFTYFIVE_API_KEY")
    : Deno.env.get("FUKA_API_KEY");

  // Use general model for diary generation (cost-effective)
  const model = Deno.env.get("MODEL_GENERAL_PRIMARY") ?? "gpt-4o-mini";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: task === "diary_generation" ? 2000 : 1000,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM call failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// Validate diary schema
function validateDiarySchema(diary: any): string | null {
  const requiredFields = ["diary_type", "source_types", "source_event_ids", "title", "private_body", "memory_summary"];
  for (const field of requiredFields) {
    if (!(field in diary)) {
      return `Missing required field: ${field}`;
    }
  }

  const validDiaryTypes = [
    "daily_fragment", "shared_activity", "self_observation", "relationship_shift",
    "archive_reflection", "project_aftertaste", "dream_fragment", "ordinary_day"
  ];
  if (!validDiaryTypes.includes(diary.diary_type)) {
    return `Invalid diary_type: ${diary.diary_type}`;
  }

  const validSourceTypes = [
    "current_experience", "shared_activity", "self_life",
    "south_city_old_stories", "project_reference", "dream_imagination"
  ];
  if (!Array.isArray(diary.source_types)) {
    return "source_types must be an array";
  }
  for (const st of diary.source_types) {
    if (!validSourceTypes.includes(st)) {
      return `Invalid source_type: ${st}`;
    }
  }

  if (!Array.isArray(diary.source_event_ids)) {
    return "source_event_ids must be an array";
  }

  return null;
}
