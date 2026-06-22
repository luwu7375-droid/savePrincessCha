export const MESSAGE_EVENT_TYPES = ["message", "image", "system", "dream", "voice"] as const;
export type MessageEventType = typeof MESSAGE_EVENT_TYPES[number];

export const MESSAGE_SYSTEM_ACTIONS = ["favorite", "edit", "delete", "tag", "game_played"] as const;
export type MessageSystemAction = typeof MESSAGE_SYSTEM_ACTIONS[number];

export type MessageEventRow = {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  conversation_id: string;
  user_id?: string | null;
  image_storage_path?: string | null;
  type: MessageEventType;
  is_favorite: boolean;
  ai_tags: string[];
  system_action: MessageSystemAction | null;
  ref_event_id: number | null;
};
