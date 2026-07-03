import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeCorsHeaders } from "../_shared/cors.ts";

const corsHeaders = makeCorsHeaders();

interface ImageGenerationRequest {
  // Legacy field (P0 uses this)
  prompt?: string;

  // Future tool calling fields (P1)
  image_type?: "portrait" | "slice_of_life" | "together" | "mood";
  description?: string;
  style_hints?: string;

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
    const {
      prompt: legacyPrompt,
      image_type,
      description,
      style_hints,
      conversation_id,
      provider_config,
      size,
      quality,
      style
    } = body;

    // Determine final prompt
    let finalPrompt: string;

    if (legacyPrompt) {
      // P0 path: use provided prompt directly
      finalPrompt = legacyPrompt;
      console.log(`[image-generation] Legacy mode: prompt provided directly`);
    } else if (image_type && description) {
      // P1 path: build prompt from template (future tool calling)
      const userDescription = style_hints ? `${description}, ${style_hints}` : description;
      // TODO: Import and use buildImagePrompt() when implementing P1
      finalPrompt = `${image_type}: ${userDescription}`;
      console.log(`[image-generation] Tool calling mode: type=${image_type}`);
    } else {
      return new Response(JSON.stringify({
        error: "Missing required parameters: either prompt or (image_type + description)"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!conversation_id) {
      return new Response(JSON.stringify({ error: "Missing conversation_id" }), {
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

    // Construct correct endpoint URL (same logic as chat-test)
    let imageEndpoint = provider_config.endpoint.replace(/\/+$/, "");

    if (!imageEndpoint.endsWith("/images/generations")) {
      imageEndpoint = imageEndpoint.replace(/\/completions$/, "");
      imageEndpoint = imageEndpoint.replace(/\/chat\/completions$/, "");
      if (!imageEndpoint.match(/\/v\d+$/)) imageEndpoint += "/v1";
      imageEndpoint += "/images/generations";
    }

    console.log("[image-generation] Generating image:", {
      finalPrompt: finalPrompt.slice(0, 100) + "...",
      provider: provider_config.model,
      originalEndpoint: provider_config.endpoint,
      constructedEndpoint: imageEndpoint
    });

    // Call image generation API
    const requestBody: any = {
      prompt: finalPrompt,
      model: provider_config.model,
    };

    // Add optional parameters based on provider
    if (size) requestBody.size = size;
    if (quality) {
      // Map "medium" to "standard" for providers that don't support it
      requestBody.quality = quality === "medium" ? "standard" : quality;
    }
    if (style) requestBody.style = style;

    // For OpenAI format
    if (provider_config.model.includes("dall-e")) {
      requestBody.n = 1;
      requestBody.response_format = "url";
    }

    console.log("[image-generation] Request body:", {
      model: requestBody.model,
      size: requestBody.size,
      quality: requestBody.quality,
      style: requestBody.style,
      promptLength: requestBody.prompt.length
    });

    const response = await fetch(imageEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${provider_config.api_key}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[image-generation] API error:", response.status, errorText.slice(0, 500));
      return new Response(JSON.stringify({
        error: "Image generation failed",
        details: errorText.slice(0, 200),
        status: response.status
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resultText = await response.text();
    console.log("[image-generation] API response (first 500 chars):", resultText.slice(0, 500));

    let result;
    try {
      result = JSON.parse(resultText);
    } catch (parseError) {
      console.error("[image-generation] Failed to parse API response as JSON:", parseError);
      return new Response(JSON.stringify({
        error: "Image API returned invalid response",
        details: `Not valid JSON: ${resultText.slice(0, 200)}`
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[image-generation] Parsed API response:", result);

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
    console.log("[image-generation] finalPrompt:", finalPrompt.slice(0, 200));
    console.log("[image-generation] Saving assistant image message...");

    // Prepare metadata with all image generation details
    const metadata = {
      type: "generated_image",
      image_url: imageUrl,
      image_prompt: finalPrompt,
      image_description: legacyPrompt || description || "生成的图片",
      image_type: image_type || "portrait",
      size: size || "1024x1024",
      quality: quality || "standard",
      style: style || "natural",
    };

    // Save image message to database
    const { data: message, error: insertError } = await supabase
      .from("messages")
      .insert({
        role: "assistant",
        content: "[图片]", // Don't expose prompt to user
        type: "image",
        conversation_id,
        user_id: user.id,
        image_storage_path: imageUrl, // Store external URL directly
        image_prompt: finalPrompt, // Keep for backward compatibility
        image_description: legacyPrompt || description || "生成的图片",
        metadata: metadata, // Store all details in metadata
      })
      .select("id")
      .single();

    console.log("[image-generation] Message saved with id:", message?.id);

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
      prompt: finalPrompt,
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
