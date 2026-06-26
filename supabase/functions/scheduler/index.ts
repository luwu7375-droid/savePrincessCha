import { APP_SETTINGS_SINGLETON_ID } from "../_shared/app_settings_types.ts";
import type { SchedulerJobName, SchedulerRunStatus } from "../_shared/scheduler_types.ts";
import { makeCorsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/response-helpers.ts";

const corsHeaders = makeCorsHeaders({
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
});

type AppSettingsForScheduler = {
  tool_web_explore_enabled: boolean;
  tool_web_explore_frequency: "hourly" | "daily" | "manual";
  tool_web_explore_token_cap: number;
  dream_trigger_mode: "manual" | "manual_and_nightly";
};

type JobResult = {
  job_name: SchedulerJobName;
  status: SchedulerRunStatus;
  reason: string;
  metadata?: Record<string, unknown>;
};

const SCHEDULER_VERSION = "pg2-v1";
const JOBS: SchedulerJobName[] = ["web_explore", "dream_nightly"];

function dbHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

async function readSettings(supabaseUrl: string, serviceRoleKey: string): Promise<AppSettingsForScheduler> {
  const query = new URLSearchParams({
    select: "tool_web_explore_enabled,tool_web_explore_frequency,tool_web_explore_token_cap,dream_trigger_mode",
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

async function runDreamNightly(settings: AppSettingsForScheduler): Promise<JobResult> {
  if (settings.dream_trigger_mode !== "manual_and_nightly") {
    return { job_name: "dream_nightly", status: "skipped", reason: "dream_trigger_mode is manual" };
  }
  return {
    job_name: "dream_nightly",
    status: "succeeded",
    reason: "hook reserved for PG14",
  };
}

async function runJob(
  jobName: SchedulerJobName,
  settings: AppSettingsForScheduler,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<JobResult> {
  if (jobName === "web_explore") return runWebExplore(settings, supabaseUrl, serviceRoleKey);
  if (jobName === "dream_nightly") return runDreamNightly(settings);
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
