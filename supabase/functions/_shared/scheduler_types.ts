export const SCHEDULER_JOB_NAMES = ["companion_tick", "web_explore", "dream_nightly", "proactive_chat", "daily_diary", "game_runner"] as const;
export type SchedulerJobName = typeof SCHEDULER_JOB_NAMES[number];

export const SCHEDULER_RUN_STATUSES = ["skipped", "succeeded", "failed", "partial_success"] as const;
export type SchedulerRunStatus = typeof SCHEDULER_RUN_STATUSES[number];

export type SchedulerRunRow = {
  id: string;
  job_name: SchedulerJobName;
  status: SchedulerRunStatus;
  reason: string | null;
  metadata: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
};
