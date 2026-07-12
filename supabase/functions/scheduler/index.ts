import { APP_SETTINGS_SINGLETON_ID } from "../_shared/app_settings_types.ts";
import type { SchedulerJobName, SchedulerRunStatus } from "../_shared/scheduler_types.ts";
import { makeCorsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/response-helpers.ts";
import { runCompanionTick } from "../_shared/companion-tick.ts";
import { consolidateMemoryCandidates } from "../_shared/consolidation.ts";

const corsHeaders = makeCorsHeaders({
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
});

type AppSettingsForScheduler = {
  companion_state_enabled: boolean;
  proactive_contact_min_interval_minutes: number;
  proactive_contact_connection_threshold: number;
  tool_web_explore_enabled: boolean;
  tool_web_explore_frequency: "hourly" | "daily" | "manual";
  tool_web_explore_token_cap: number;
  dream_trigger_mode: "manual" | "manual_and_nightly";
  nightly_consolidation_enabled: boolean;
};

type JobResult = {
  job_name: SchedulerJobName;
  status: SchedulerRunStatus;
  reason: string;
  metadata?: Record<string, unknown>;
};

const SCHEDULER_VERSION = "pg5-v1"; // Updated for consolidation
const JOBS: SchedulerJobName[] = ["companion_tick", "web_explore", "dream_nightly"];

function dbHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

async function readSettings(supabaseUrl: string, serviceRoleKey: string): Promise<AppSettingsForScheduler> {
  const query = new URLSearchParams({
    select: "companion_state_enabled,proactive_contact_min_interval_minutes,proactive_contact_connection_threshold,tool_web_explore_enabled,tool_web_explore_frequency,tool_web_explore_token_cap,dream_trigger_mode,nightly_consolidation_enabled",
    id: `eq.${APP_SETTINGS_SINGLETON_ID}`,
    limit: "1",
  });
  const res = await fetch(`${supabaseUrl}/rest/v1/app_settings?${query}`, {
    headers: dbHeaders(serviceRoleKey),
  });
  if (!res.ok) throw new Error(`settings read failed: HTTP ${res.status}`);
  const rows = await res.json();
  const row = rows?.[0];
  if (!row) throw new Error("app_settings singleton missing");
  return row;
}

async function latestSuccessfulRun(
  supabaseUrl: string,
  serviceRoleKey: string,
  jobName: SchedulerJobName,
): Promise<string | null> {
  const query = new URLSearchParams({
    select: "started_at",
    job_name: `eq.${jobName}`,
    status: "eq.succeeded",
    order: "started_at.desc",
    limit: "1",
  });
  const res = await fetch(`${supabaseUrl}/rest/v1/scheduler_runs?${query}`, {
    headers: dbHeaders(serviceRoleKey),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.started_at || null;
}

function isDue(lastRunIso: string | null, frequency: "hourly" | "daily" | "manual", now = new Date()): boolean {
  if (frequency === "manual") return false;
  if (!lastRunIso) return true;
  const elapsedMs = now.getTime() - new Date(lastRunIso).getTime();
  const thresholdMs = frequency === "hourly" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return elapsedMs >= thresholdMs;
}

async function recordRun(
  supabaseUrl: string,
  serviceRoleKey: string,
  result: JobResult,
) {
  const now = new Date().toISOString();
  const payload = {
    job_name: result.job_name,
    status: result.status,
    reason: result.reason,
    metadata: { scheduler_version: SCHEDULER_VERSION, ...(result.metadata || {}) },
    finished_at: now,
  };
  await fetch(`${supabaseUrl}/rest/v1/scheduler_runs`, {
    method: "POST",
    headers: dbHeaders(serviceRoleKey),
    body: JSON.stringify(payload),
  });
}

async function runWebExplore(
  settings: AppSettingsForScheduler,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<JobResult> {
  if (!settings.tool_web_explore_enabled) {
    return { job_name: "web_explore", status: "skipped", reason: "tool_web_explore_enabled=false" };
  }
  if (settings.tool_web_explore_token_cap <= 0) {
    return { job_name: "web_explore", status: "skipped", reason: "token cap is 0" };
  }
  const lastRun = await latestSuccessfulRun(supabaseUrl, serviceRoleKey, "web_explore");
  if (!isDue(lastRun, settings.tool_web_explore_frequency)) {
    return {
      job_name: "web_explore",
      status: "skipped",
      reason: "not due",
      metadata: { frequency: settings.tool_web_explore_frequency, last_success_at: lastRun },
    };
  }
  return {
    job_name: "web_explore",
    status: "succeeded",
    reason: "hook reserved for PG17",
    metadata: { token_cap: settings.tool_web_explore_token_cap },
  };
}

async function runDreamNightly(
  settings: AppSettingsForScheduler,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<JobResult> {
  if (settings.dream_trigger_mode !== "manual_and_nightly") {
    return { job_name: "dream_nightly", status: "skipped", reason: "dream_trigger_mode is manual" };
  }

  // Run nightly consolidation if enabled
  if (settings.nightly_consolidation_enabled) {
    try {
      // Get all users who need consolidation
      const usersQuery = new URLSearchParams({
        select: "user_id",
      });
      const usersRes = await fetch(
        `${supabaseUrl}/rest/v1/companion_state?${usersQuery}`,
        { headers: dbHeaders(serviceRoleKey) }
      );

      if (!usersRes.ok) {
        throw new Error(`Failed to fetch users: ${usersRes.status}`);
      }

      const users = await usersRes.json() as Array<{ user_id: string }>;

      let totalCandidates = 0;
      let totalEpisodes = 0;
      const errors: string[] = [];

      // Consolidate for each user
      for (const user of users) {
        try {
          // Consolidate candidates from last 7 days
          const sinceTimestamp = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

          const consolidationResult = await consolidateMemoryCandidates(
            supabaseUrl,
            serviceRoleKey,
            {
              userId: user.user_id,
              sinceTimestamp,
              dryRun: false,
            }
          );

          totalCandidates += consolidationResult.candidates_processed;
          totalEpisodes += consolidationResult.episodes_created;

          if (consolidationResult.errors.length > 0) {
            errors.push(...consolidationResult.errors.slice(0, 2)); // Max 2 errors per user
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          errors.push(`User ${user.user_id.slice(0, 6)}: ${errorMsg}`);
        }
      }

      return {
        job_name: "dream_nightly",
        status: errors.length > 0 ? "partial_success" : "succeeded",
        reason: `consolidated ${totalCandidates} candidates into ${totalEpisodes} episodes for ${users.length} users`,
        metadata: {
          users_processed: users.length,
          candidates_processed: totalCandidates,
          episodes_created: totalEpisodes,
          errors_count: errors.length,
          errors: errors.slice(0, 5),
        },
      };
    } catch (err) {
      console.error("dream_nightly consolidation error:", err);
      return {
        job_name: "dream_nightly",
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    job_name: "dream_nightly",
    status: "succeeded",
    reason: "hook reserved for PG14",
  };
}

async function runCompanionTickJob(
  settings: AppSettingsForScheduler,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<JobResult> {
  if (!settings.companion_state_enabled) {
    return {
      job_name: "companion_tick",
      status: "skipped",
      reason: "companion_state_enabled=false",
    };
  }

  try {
    const tickResult = await runCompanionTick(
      supabaseUrl,
      serviceRoleKey,
      settings.proactive_contact_min_interval_minutes,
      settings.proactive_contact_connection_threshold
    );

    return {
      job_name: "companion_tick",
      status: tickResult.errors.length > 0 ? "partial_success" : "succeeded",
      reason: `processed ${tickResult.users_processed} users, ${tickResult.contacts_sent} contacts sent`,
      metadata: {
        users_processed: tickResult.users_processed,
        actions_triggered: tickResult.actions_triggered,
        contacts_sent: tickResult.contacts_sent,
        observations_logged: tickResult.observations_logged,
        activities_started: tickResult.activities_started,
        errors_count: tickResult.errors.length,
        errors: tickResult.errors.slice(0, 5), // Only include first 5 errors
      },
    };
  } catch (err) {
    console.error("companion_tick job error:", err);
    return {
      job_name: "companion_tick",
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runJob(
  jobName: SchedulerJobName,
  settings: AppSettingsForScheduler,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<JobResult> {
  if (jobName === "companion_tick") return runCompanionTickJob(settings, supabaseUrl, serviceRoleKey);
  if (jobName === "web_explore") return runWebExplore(settings, supabaseUrl, serviceRoleKey);
  if (jobName === "dream_nightly") return runDreamNightly(settings, supabaseUrl, serviceRoleKey);
  return { job_name: jobName, status: "skipped", reason: "reserved hook" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("DB_URL");
  const serviceRoleKey = Deno.env.get("DB_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "DB not configured" }, 500);

  const url = new URL(req.url);
  const requestedJob = url.searchParams.get("job") as SchedulerJobName | null;
  const jobs = requestedJob ? JOBS.filter((job) => job === requestedJob) : JOBS;
  if (requestedJob && jobs.length === 0) return json({ error: "unknown job" }, 400);

  try {
    const settings = await readSettings(supabaseUrl, serviceRoleKey);
    const results: JobResult[] = [];
    for (const job of jobs) {
      const result = await runJob(job, settings, supabaseUrl, serviceRoleKey);
      await recordRun(supabaseUrl, serviceRoleKey, result);
      results.push(result);
    }
    return json({ ok: true, scheduler_version: SCHEDULER_VERSION, results });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
