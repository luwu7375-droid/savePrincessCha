export const CHA_ACTIVITY_ACTION_TYPES = ["web_browse", "game_play", "other"] as const;
export type ChaActivityActionType = typeof CHA_ACTIVITY_ACTION_TYPES[number];

export type ChaActivityLogRow = {
  id: string;
  user_id: string;
  action_type: ChaActivityActionType;
  url: string | null;
  duration_sec: number;
  token_cost: number;
  created_at: string;
  game_session_id?: string | null;
  game_name?: string | null;
  game_result?: string | null;
};
