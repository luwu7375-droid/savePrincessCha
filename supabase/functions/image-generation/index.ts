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
  test_only?: boolean;
  generation_source?: "explicit" | "proactive";
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
      style,
      generation_source = "explicit"
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

    // Hard server-side guard for unsolicited images. This runs before the
    // provider request, so blocked attempts cannot consume image-generation credit.
    if (generation_source === "proactive") {
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!serviceRoleKey) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
      }
      const adminForLimit = createClient(supabaseUrl, serviceRoleKey);
      const dateParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const datePart = (type: string) => dateParts.find(part => part.type === type)?.value || "";
      const shanghaiDate = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
      const dayStart = new Date(`${shanghaiDate}T00:00:00+08:00`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const { data: generatedToday, error: limitError } = await adminForLimit
        .from("messages")
        .select("created_at, metadata")
        .eq("user_id", user.id)
        .eq("type", "image")
        .gte("created_at", dayStart.toISOString())
        .lt("created_at", dayEnd.toISOString())
        .order("created_at", { ascending: false })
        .limit(100);
      if (limitError) {
        throw new Error(`Proactive image limit check failed: ${limitError.message}`);
      }
      const proactiveToday = (generatedToday || []).filter((row: any) =>
        row?.metadata?.generation_source === "proactive"
      );
      const latestAt = proactiveToday[0]?.created_at
        ? new Date(proactiveToday[0].created_at).getTime()
        : 0;
      const cooldownMs = 4 * 60 * 60 * 1000;
      if (proactiveToday.length >= 2) {
        return new Response(JSON.stringify({
          error: "Proactive image daily limit reached",
          code: "proactive_daily_limit",
          limit: 2,
          timezone: "Asia/Shanghai",
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (latestAt && Date.now() - latestAt < cooldownMs) {
        return new Response(JSON.stringify({
          error: "Proactive image cooldown active",
          code: "proactive_cooldown",
          retry_after_seconds: Math.ceil((cooldownMs - (Date.now() - latestAt)) / 1000),
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
    let imageBase64: string | null = null;

    // OpenAI DALL-E format
    if (result.data && Array.isArray(result.data) && result.data[0]?.url) {
      imageUrl = result.data[0].url;
    }
    // OpenAI image models commonly return inline PNG bytes instead of a URL.
    else if (result.data && Array.isArray(result.data) && result.data[0]?.b64_json) {
      imageBase64 = result.data[0].b64_json;
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

    if (!imageUrl && !imageBase64) {
      console.error("[image-generation] Could not extract image URL from response:", result);
      return new Response(JSON.stringify({
        error: "Could not extract image URL from provider response",
        response: result
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Availability probe used by Settings. It performs the real image request
    // but deliberately does not create a message or persist the test asset.
    if (body.test_only) {
      return new Response(JSON.stringify({
        success: true,
        available: true,
        model: provider_config.model,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[image-generation] Image generated; persisting to Storage");
    console.log("[image-generation] finalPrompt:", finalPrompt.slice(0, 200));
    console.log("[image-generation] Saving assistant image message...");

    // Provider URLs are often temporary. Download once and persist the bytes in
    // our private bucket before writing the message row.
    let imageBytes: ArrayBuffer | Uint8Array;
    let contentType = "image/png";
    if (imageBase64) {
      try {
        const binary = atob(imageBase64.replace(/^data:image\/[^;]+;base64,/, ""));
        imageBytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      } catch {
        throw new Error("Generated image base64 decode failed");
      }
    } else {
      const imageResponse = await fetch(imageUrl!);
      if (!imageResponse.ok) {
        throw new Error(`Generated image download failed: ${imageResponse.status}`);
      }
      imageBytes = await imageResponse.arrayBuffer();
      contentType = imageResponse.headers.get("content-type") || "image/png";
    }
    const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
    const storagePath = `${user.id}/generated/${conversation_id}/${crypto.randomUUID()}.${extension}`;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { error: uploadError } = await admin.storage
      .from("chat-images")
      .upload(storagePath, imageBytes, { contentType, upsert: false });
    if (uploadError) throw new Error(`Generated image persistence failed: ${uploadError.message}`);
    const { data: signedData, error: signedError } = await admin.storage
      .from("chat-images")
      .createSignedUrl(storagePath, 3600);
    if (signedError || !signedData?.signedUrl) {
      throw new Error(`Generated image signed URL failed: ${signedError?.message || "unknown"}`);
    }
    const persistedImageUrl = signedData.signedUrl;

    // Prepare metadata with all image generation details
    const metadata = {
      type: "generated_image",
      image_url: persistedImageUrl,
      image_storage_path: storagePath,
      image_prompt: finalPrompt,
      image_description: legacyPrompt || description || "生成的图片",
      image_type: image_type || "portrait",
      size: size || "1024x1024",
      quality: quality || "standard",
      style: style || "natural",
      generation_source,
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
        image_storage_path: storagePath,
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
      image_url: persistedImageUrl,
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
