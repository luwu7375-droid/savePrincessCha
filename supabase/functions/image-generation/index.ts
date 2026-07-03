import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeCorsHeaders } from "../_shared/cors.ts";

const corsHeaders = makeCorsHeaders();

interface ImageGenerationRequest {
  prompt: string;
  conversation_id: string;
  provider_config?: {
    endpoint: string;
    api_key: string;
    model: string;
  };
  size?: string;
  quality?: string;
  style?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ImageGenerationRequest = await req.json();
    const { prompt, conversation_id, provider_config, size, quality, style } = body;

    if (!prompt || !conversation_id) {
      return new Response(JSON.stringify({ error: "Missing prompt or conversation_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!provider_config) {
      return new Response(JSON.stringify({ error: "Missing provider_config" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[image-generation] Generating image:", { prompt, provider: provider_config.model });

    // Call image generation API
    const requestBody: any = {
      prompt,
      model: provider_config.model,
    };

    // Add optional parameters based on provider
    if (size) requestBody.size = size;
    if (quality) requestBody.quality = quality;
    if (style) requestBody.style = style;

    // For OpenAI format
    if (provider_config.model.includes("dall-e")) {
      requestBody.n = 1;
      requestBody.response_format = "url";
    }

    const response = await fetch(provider_config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${provider_config.api_key}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[image-generation] API error:", errorText);
      return new Response(JSON.stringify({
        error: "Image generation failed",
        details: errorText
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    console.log("[image-generation] API response:", result);

    // Extract image URL based on provider format
    let imageUrl: string | null = null;

    // OpenAI DALL-E format
    if (result.data && Array.isArray(result.data) && result.data[0]?.url) {
      imageUrl = result.data[0].url;
    }
    // Flux/Replicate format
    else if (result.output) {
      imageUrl = Array.isArray(result.output) ? result.output[0] : result.output;
    }
    // Generic format
    else if (result.url) {
      imageUrl = result.url;
    }
    // Another common format
    else if (result.image_url) {
      imageUrl = result.image_url;
    }

    if (!imageUrl) {
      console.error("[image-generation] Could not extract image URL from response:", result);
      return new Response(JSON.stringify({
        error: "Could not extract image URL from provider response",
        response: result
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[image-generation] Image generated:", imageUrl);

    // Save image message to database
    const { data: message, error: insertError } = await supabase
      .from("messages")
      .insert({
        role: "assistant",
        content: `[图片] ${prompt}`,
        type: "image",
        conversation_id,
        user_id: user.id,
        image_storage_path: imageUrl, // Store external URL directly
        image_prompt: prompt,
        image_description: prompt,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[image-generation] Failed to save message:", insertError);
      return new Response(JSON.stringify({
        error: "Failed to save message",
        details: insertError
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update conversation updated_at
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation_id);

    return new Response(JSON.stringify({
      success: true,
      image_url: imageUrl,
      message_id: message.id,
      prompt,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[image-generation] Error:", error);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
