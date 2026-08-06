import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeCorsHeaders } from "../_shared/cors.ts";

const corsHeaders = makeCorsHeaders();

// Identity locking fails closed. Promotion requires all three deployment
// secrets to be set together after kk approves a canonical pack.
const identityReferenceUrl = Deno.env.get("CHA_IDENTITY_REFERENCE_URL")?.trim() || "";
const identityReferenceVersion = Deno.env.get("CHA_IDENTITY_REFERENCE_VERSION")?.trim() || "";
const identityReferenceApproved = Deno.env.get("CHA_IDENTITY_REFERENCE_APPROVED") === "true";
const identityReferenceAvailable = Boolean(
  identityReferenceApproved && identityReferenceUrl && identityReferenceVersion
);

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
  use_identity_reference?: boolean;
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
      generation_source = "explicit",
      use_identity_reference = false
    } = body;

    if (use_identity_reference && !identityReferenceAvailable) {
      return new Response(JSON.stringify({
        error: "Cha identity reference is awaiting approval",
        code: "identity_reference_not_approved",
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Build an OpenAI-compatible Image API endpoint. Identity edits are only
    // reachable after a canonical pack is explicitly promoted above.
    const endpointRoot = provider_config.endpoint
      .replace(/\/+$/, "")
      .replace(/\/images\/(generations|edits)$/, "")
      .replace(/\/chat\/completions$/, "")
      .replace(/\/completions$/, "");
    const apiRoot = endpointRoot.match(/\/v\d+$/) ? endpointRoot : `${endpointRoot}/v1`;
    const imageEndpoint = `${apiRoot}/images/${use_identity_reference ? "edits" : "generations"}`;

    console.log("[image-generation] Generating image:", {
      finalPrompt: finalPrompt.slice(0, 100) + "...",
      provider: provider_config.model,
      originalEndpoint: provider_config.endpoint,
      constructedEndpoint: imageEndpoint,
      identityReference: use_identity_reference,
    });

    let response: Response;
    if (use_identity_reference) {
      const referenceResponse = await fetch(identityReferenceUrl, {
        headers: { "User-Agent": "savePrincessCha-image-generation" },
      });
      if (!referenceResponse.ok) {
        throw new Error(`Cha identity reference download failed: ${referenceResponse.status}`);
      }
      const referenceBytes = await referenceResponse.arrayBuffer();
      if (!referenceBytes.byteLength || referenceBytes.byteLength > 10 * 1024 * 1024) {
        throw new Error(`Cha identity reference has invalid size: ${referenceBytes.byteLength}`);
      }

      const form = new FormData();
      form.append("model", provider_config.model);
      form.append("prompt", finalPrompt);
      form.append("image[]", new Blob([referenceBytes], { type: "image/jpeg" }), `cha-${identityReferenceVersion}.jpg`);
      if (size) form.append("size", size);
      if (quality) form.append("quality", quality === "standard" ? "medium" : quality);
      // gpt-image-2 always processes image inputs at high fidelity and rejects
      // input_fidelity. Older GPT Image models accept the explicit high setting.
      if (!/gpt[-_.]?image[-_.]?2/i.test(provider_config.model)) {
        form.append("input_fidelity", "high");
      }

      console.log("[image-generation] Reference edit request:", {
        model: provider_config.model,
        size,
        quality: quality === "standard" ? "medium" : quality,
        referenceBytes: referenceBytes.byteLength,
        inputFidelity: /gpt[-_.]?image[-_.]?2/i.test(provider_config.model) ? "automatic" : "high",
      });

      response = await fetch(imageEndpoint, {
        method: "POST",
        headers: { "Authorization": `Bearer ${provider_config.api_key}` },
        body: form,
      });
    } else {
      const requestBody: any = {
        prompt: finalPrompt,
        model: provider_config.model,
      };
      if (size) requestBody.size = size;
      if (quality) requestBody.quality = quality === "medium" ? "standard" : quality;
      if (style) requestBody.style = style;
      if (provider_config.model.includes("dall-e")) {
        requestBody.n = 1;
        requestBody.response_format = "url";
      }
      console.log("[image-generation] Text generation request:", {
        model: requestBody.model,
        size: requestBody.size,
        quality: requestBody.quality,
        style: requestBody.style,
        promptLength: requestBody.prompt.length,
      });
      response = await fetch(imageEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${provider_config.api_key}`,
        },
        body: JSON.stringify(requestBody),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[image-generation] API error:", response.status, errorText.slice(0, 500));
      const referenceUnsupported = use_identity_reference && (
        response.status === 404 ||
        response.status === 405 ||
        /images\/edits|edit.*not.*support|reference.*not.*support|multipart|unsupported endpoint/i.test(errorText)
      );
      return new Response(JSON.stringify({
        error: referenceUnsupported ? "Configured image model does not support Cha identity references" : "Image generation failed",
        code: referenceUnsupported ? "reference_image_not_supported" : "image_generation_failed",
        details: errorText.slice(0, 500),
        status: response.status
      }), {
        status: referenceUnsupported ? 422 : response.status,
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
      identity_reference_version: use_identity_reference ? identityReferenceVersion : null,
      identity_reference_used: use_identity_reference,
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
