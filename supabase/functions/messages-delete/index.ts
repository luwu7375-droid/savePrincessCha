// supabase/functions/messages-delete/index.ts
// Edge Function to mark messages as deleted

import { corsHeaders } from "../_shared/cors.ts";
import { json, jsonError } from "../_shared/response-helpers.ts";

interface DeleteRequest {
  messageId: number;
  conversationId: string;
  is_deleted: boolean;
  deleted_at: string;
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
    const body: DeleteRequest = await req.json();
    const { messageId, conversationId, is_deleted, deleted_at } = body;

    // Validate required fields
    if (!messageId || !conversationId) {
      return jsonError("Missing required fields: messageId, conversationId", 400);
    }

    // Get Supabase service role key from environment
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase environment variables");
      return jsonError("Server configuration error", 500);
    }

    // Update message in database
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
          is_deleted,
          deleted_at,
        }),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error("Database update failed:", errorText);
      return jsonError("Failed to delete message", updateResponse.status);
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
    console.error("Delete message error:", error);
    return jsonError(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
});
