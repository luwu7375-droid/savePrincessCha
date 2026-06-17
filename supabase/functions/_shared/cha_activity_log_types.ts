export const CHA_ACTIVITY_ACTION_TYPES = ["web_browse", "other"] as const;
export type ChaActivityActionType = typeof CHA_ACTIVITY_ACTION_TYPES[number];

export type ChaActivityLogRow = {
  id: string;
  user_id: string;
  action_type: ChaActivityActionType;
  url: string | null;
  duration_sec: number;
  token_cost: number;
  created_at: string;
};
