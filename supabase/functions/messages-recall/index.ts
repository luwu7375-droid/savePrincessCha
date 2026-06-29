// supabase/functions/messages-recall/index.ts
// Edge Function to mark messages as recalled

import { corsHeaders } from "../_shared/cors.ts";
import { json, jsonError } from "../_shared/response-helpers.ts";

interface RecallRequest {
  messageId: number;
  conversationId: string;
  is_recalled: boolean;
  recalled_at: string;
  original_content: string;
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
    const body: RecallRequest = await req.json();
    const { messageId, conversationId, is_recalled, recalled_at, original_content } = body;

    // Validate required fields
    if (!messageId || !conversationId || !original_content) {
      return jsonError("Missing required fields: messageId, conversationId, original_content", 400);
    }

    // Get Supabase service role key from environment
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase environment variables");
      return jsonError("Server configuration error", 500);
    }

    // Update message in database - preserve original_content and set recall flags
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
          is_recalled,
          recalled_at,
          original_content,
        }),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error("Database update failed:", errorText);
      return jsonError("Failed to recall message", updateResponse.status);
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
    console.error("Recall message error:", error);
    return jsonError(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
});
