// Diary Generation Function - First-person Diary Draft MVP
// Generates Cha's private diary entries from various sources
// Does NOT auto-promote to memories or inject into compileMemoryContext

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { DIARY_PROMPT, CHECKER_PROMPT } from "./prompts.ts";
import {
  resolveProviderForTier,
  callModelTextWithFallback,
} from "../_shared/model-client.ts";
import { corsHeaders } from "../_shared/cors.ts";

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // ── Test route: POST /diary?type=test_model ──────────────────────────────
    if (url.searchParams.get("type") === "test_model") {
      const providers = resolveProviderForTier("general");
      const t = Date.now();
      try {
        const result = await callModelTextWithFallback(
          providers,
          [{ role: "user", content: "ping" }],
          { maxTokens: 5, temperature: 0.0, purpose: "diary_test" },
        );
        return new Response(
          JSON.stringify({
            ok: true,
            provider: result.usedProvider,
            model: result.usedModel,
            fallback_used: result.fallbackUsed,
            latency_ms: Date.now() - t,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    const body = await req.json() as DiaryGenerationRequest & { custom_system_prompt?: string };
    const {
      userId = "default",
      conversationId,
      source_events,
      scene_context = "",
      cha_status = "",
      diary_length = "normal",
      debug = false,
      custom_system_prompt,
    } = body;

    if (!source_events || source_events.length === 0) {
      return new Response(
        JSON.stringify({ error: "source_events is required and must not be empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const providers = resolveProviderForTier("general");

    // Build diary prompt
    const sourceEventsText = source_events.map((evt, idx) => `[事件 ${idx + 1}]
id: ${evt.id}
source_type: ${evt.source_type}
source_boundary: ${evt.source_boundary}
${evt.role ? `role: ${evt.role}` : ""}
with_kk: ${evt.with_kk ?? false}
reliability: ${evt.reliability ?? "experienced"}
created_at: ${evt.created_at}
content: ${evt.content}
---`).join("\n\n");

    const diaryPrompt = DIARY_PROMPT
      .replace("{{source_events}}", sourceEventsText)
      .replace("{{scene_context}}", scene_context)
      .replace("{{cha_status}}", cha_status)
      .replace("{{diary_length}}", diary_length);

    // Call model for diary generation (purpose: diary)
    const diaryMessages: unknown[] = custom_system_prompt
      ? [{ role: "system", content: custom_system_prompt }, { role: "user", content: diaryPrompt }]
      : [{ role: "user", content: diaryPrompt }];
    const diaryCallResult = await callModelTextWithFallback(
      providers,
      diaryMessages,
      { maxTokens: 2000, temperature: 0.7, purpose: "diary" },
    );

    let diaryJson: DiaryOutput;
    try {
      // Strip markdown code blocks if present
      let diaryText = diaryCallResult.text.trim();
      const jsonMatch = diaryText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        diaryText = jsonMatch[1].trim();
      }
      diaryJson = JSON.parse(diaryText);
    } catch (_e) {
      return new Response(
        JSON.stringify({
          error: "Failed to parse diary JSON",
          raw_response: debug ? diaryCallResult.text : undefined,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const validationError = validateDiarySchema(diaryJson);
    if (validationError) {
      return new Response(
        JSON.stringify({ error: "Invalid diary schema", details: validationError, diary: debug ? diaryJson : undefined }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Call model for checker (purpose: checker)
    // Pass source_events to checker so it can validate source_event_ids
    const sourceEventIds = source_events.map(evt => evt.id);
    const checkerPromptWithContext = CHECKER_PROMPT
      .replace("{{diary_json}}", JSON.stringify(diaryJson, null, 2))
      .replace("{{source_event_ids}}", JSON.stringify(sourceEventIds));
    const checkerCallResult = await callModelTextWithFallback(
      providers,
      [{ role: "user", content: checkerPromptWithContext }],
      { maxTokens: 1000, temperature: 0.2, purpose: "checker" },
    );

    let checkerJson: CheckerOutput;
    try {
      // Strip markdown code blocks if present
      let checkerText = checkerCallResult.text.trim();
      const jsonMatch = checkerText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        checkerText = jsonMatch[1].trim();
      }
      checkerJson = JSON.parse(checkerText);
    } catch (_e) {
      return new Response(
        JSON.stringify({
          error: "Failed to parse checker JSON",
          raw_response: debug ? checkerCallResult.text : undefined,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let finalStatus: "draft" | "checked" | "failed_check" = "draft";
    if (checkerJson.pass) {
      finalStatus = "checked";
    } else if (checkerJson.problems.length > 0) {
      finalStatus = "failed_check";
    }

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
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
        ...(debug && {
          diary_model_provider: diaryCallResult.usedProvider,
          diary_model_name: diaryCallResult.usedModel,
          checker_model_provider: checkerCallResult.usedProvider,
          checker_model_name: checkerCallResult.usedModel,
          fallback_used: diaryCallResult.fallbackUsed || checkerCallResult.fallbackUsed,
          model_call_ms: diaryCallResult.modelCallMs + checkerCallResult.modelCallMs,
        }),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Diary generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function validateDiarySchema(diary: unknown): string | null {
  if (!diary || typeof diary !== "object") return "diary must be an object";
  const d = diary as Record<string, unknown>;
  const requiredFields = ["diary_type", "source_types", "source_event_ids", "title", "private_body", "memory_summary"];
  for (const field of requiredFields) {
    if (!(field in d)) return `Missing required field: ${field}`;
  }

  const validDiaryTypes = [
    "daily_fragment", "shared_activity", "self_observation", "relationship_shift",
    "archive_reflection", "project_aftertaste", "dream_fragment", "ordinary_day",
  ];
  if (!validDiaryTypes.includes(d.diary_type as string)) {
    return `Invalid diary_type: ${d.diary_type}`;
  }

  const validSourceTypes = [
    "current_experience", "shared_activity", "self_life",
    "south_city_old_stories", "project_reference", "dream_imagination",
  ];
  if (!Array.isArray(d.source_types)) return "source_types must be an array";
  for (const st of d.source_types as string[]) {
    if (!validSourceTypes.includes(st)) return `Invalid source_type: ${st}`;
  }

  if (!Array.isArray(d.source_event_ids)) return "source_event_ids must be an array";
  return null;
}
