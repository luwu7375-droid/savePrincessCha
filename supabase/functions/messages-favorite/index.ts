// supabase/functions/messages-favorite/index.ts
// Edge Function to toggle message favorite status

import { corsHeaders } from "../_shared/cors.ts";
import { json, jsonError } from "../_shared/response-helpers.ts";

interface FavoriteRequest {
  messageId: number;
  conversationId: string;
  is_favorited: boolean;
  favorited_at: string | null;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  try {
    const body: FavoriteRequest = await req.json();
    const { messageId, conversationId, is_favorited, favorited_at } = body;

    // Validate required fields
    if (!messageId || !conversationId || is_favorited === undefined) {
      return jsonError("Missing required fields: messageId, conversationId, is_favorited", 400);
    }

    // Get Supabase service role key from environment
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase environment variables");
      return jsonError("Server configuration error", 500);
    }

    // Update message in database - toggle favorite status
    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/messages?id=eq.${messageId}&conversation_id=eq.${conversationId}`,
      {
        method: "PATCH",
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation",
        },
        body: JSON.stringify({
          is_favorited,
          favorited_at,
          // Also update legacy is_favorite column for backward compatibility
          is_favorite: is_favorited,
        }),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error("Database update failed:", errorText);
      return jsonError("Failed to update favorite status", updateResponse.status);
    }

    const updatedMessages = await updateResponse.json();

    if (!updatedMessages || updatedMessages.length === 0) {
      return jsonError("Message not found", 404);
    }

    return json({
      success: true,
      message: updatedMessages[0],
    });

  } catch (error) {
    console.error("Favorite message error:", error);
    return jsonError(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
});
