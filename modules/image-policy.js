// ============================================================================
// Image Policy Module - Auto Image Generation Intent Detection
// ============================================================================

(function() {
  "use strict";

  // ── Canonical identity ─────────────────────────────────────────────────────
  // Candidate B was explicitly rejected on 2026-08-06. Keep the file only as a
  // historical artifact; no production image request may attach or describe it.
  // A new canonical face must be approved before identity-referenced generation
  // is enabled again.
  const CHA_IDENTITY_REFERENCES = {
    version: "unassigned-v2",
    status: "disabled_pending_approval",
    source2d: "assets/cha/identity/cha-2d-canonical.jpg",
    photorealTurnaround: null,
    precedence: "approved identity pack > canonical 2D design > scene styling"
  };

  const CHA_CHARACTER_BIBLE = {
    name: "茶茶 (Cha)",
    gender: "男性",
    age: "二十多岁的成年男性",
    identityVersion: CHA_IDENTITY_REFERENCES.version,
    identityReferences: CHA_IDENTITY_REFERENCES,
    appearance: {
      hair: "黑色、蓬松凌乱的中长层次碎发；长刘海自然遮住一侧眼睛，后颈留有碎发，不得改成整齐短发",
      face: "三次元脸部尚未定稿。不得把历史 B 版或随机生成脸称为 Cha 本人",
      eyes: "可见眼睛为低饱和琥珀金色，目光安静、警觉、略带疏离；不得改成普通深色温柔眼睛",
      temperament: "安静克制、注视感强、略带危险和蛇一样的冷感；不是阳光暖男、偶像写真或韩剧宣传照",
      build: "纤瘦自然的成年男性体型"
    },
    signature: "黑色高领、银色链饰与蛇形耳饰用于身份参考图；生活场景可简化配饰，但脸、发型和眼睛不得变化",
    wardrobe: "以黑色和低饱和日常服饰为主，可穿针织衫、衬衫、T恤、开衫或宽松外套；避免偶像造型",
    common_scenes: ["家里", "厨房", "书桌", "窗边", "夜晚", "雨天", "散步"],
    atmosphere: "私密生活感、陪伴感、安静、真实，保留克制而警觉的个人气质",
    visual_style: {
      medium: "摄影风格，真实照片质感",
      lighting: "遵循上海时间的柔和自然光、暖灯或夜景灯光",
      mood: "不要商业写真感、偶像感或过度精修感",
      perspective: "像他亲手分享给你看的生活照片"
    }
  };

  // ── Base Prompt Foundation ─────────────────────────────────────────────────
  // Default photography language adapted for Cha's private, fictional identity.
  // Attach the approved turnaround whenever the provider supports reference input;
  // text-only identity description is a compatibility fallback.
  const BASE_PROMPT_FOUNDATION = `
Overall goal: a highly realistic, candid smartphone photograph of a completely fictional person or an ordinary real-world scene. It must look like an unplanned photo taken with the native camera of a recent iPhone, roughly a 26 mm wide-angle equivalent, natural perspective, realistic dynamic range and white balance.

Image character: sharp where naturally in focus, with subtle authentic sensor noise, believable lens behavior and small everyday imperfections. Preserve real material texture in skin, hair, fabric, bedding, glass and furniture. Allow a slightly imperfect angle, ordinary clutter and restrained motion blur when physically plausible. Never create the glossy, smooth, over-rendered “AI image” look.

Lighting must follow the supplied local time in Asia/Shanghai. Daytime uses plausible daylight or window light; dawn and dusk use warmer low-angle light and longer shadows; nighttime uses physically motivated lamps, screens, streetlights or other visible artificial sources with natural ambient darkness. Shadow direction, reflections and highlights must agree with the actual light sources.

If a person appears, the person is a fictional adult and must not resemble a celebrity or any identifiable real individual. Keep Cha as one consistent fictional adult East Asian male identity across the series: the same age range, facial structure, hair, build and temperament. Do not randomly invent a different face. Do not make him look underage.

Avoid: anime, manga, illustration, painting, CGI, beauty-camera filters, plastic or waxy skin, excessive smoothing, excessive sharpening, studio posing, commercial portrait composition, glamour photography, cyberpunk, fantasy props, implausibly spotless rooms, incorrect anatomy, extra or missing fingers, warped hands, distorted facial features, wrong reflections, impossible shadows, floating objects, broken perspective, text, gibberish, logos and watermarks.
`.trim();

  const CHA_DESCRIPTION = `
Cha's photorealistic face is not currently approved. Do not claim a generated face is canonical or attach the rejected B turnaround. Until identity pack v2 is approved, avoid face-forward portraits; prefer back view, hands, silhouette, cropped daily-life scenes, or other compositions that do not invent a definitive face.
`.trim();

  // ── Intent Detection ───────────────────────────────────────────────────────

  /**
   * Detect if user message contains image generation intent
   * @param {string} text - User message text
   * @returns {{ should_generate: boolean, route: string, face_policy: string, reason: string }}
   */
  function detectImageIntent(text) {
    // Compatibility API only. Image intent is decided from full conversational
    // semantics by the chat model and returned as a structured <image_action>.
    // Never infer an action from client-side words or regexes.
    return {
      should_generate: false,
      route: null,
      face_policy: null,
      reason: "客户端关键词生图已禁用；等待结构化 image_action"
    };
  }

  // ── Prompt Builder ─────────────────────────────────────────────────────────

  /**
   * Build image prompt based on route and user description
   * @param {string} route - Image type: portrait | slice_of_life | together | mood
   * @param {string} userText - User's original message
   * @returns {string} Final prompt for image generation
   */
  function buildImagePrompt(route, userText) {
    let prompt = BASE_PROMPT_FOUNDATION + "\n\n";

    switch (route) {
      case "portrait":
        prompt += CHA_DESCRIPTION + "\n\n";
        prompt += `Portrait photo of Cha, half-body or close-up, showing face clearly. ${userText}. Natural life photo feel, not commercial portrait style.`;
        break;

      case "slice_of_life":
        prompt += CHA_DESCRIPTION + "\n\n";
        prompt += `First-person perspective or slice-of-life scene. ${userText}. Can show Cha's hands, sleeves, desk, window, bedside lamp, cup, book, or daily objects. Face is optional. Focus on "what Cha is doing right now" vibe. Common scenes: home, kitchen, desk, by window, night, rainy day, walking.`;
        break;

      case "together":
        prompt += CHA_DESCRIPTION + "\n\n";
        prompt += `Two-person companionship scene with Cha and you. ${userText}. Emphasize warmth and togetherness. User's appearance is unknown - avoid showing user's face directly. Use back view, hands, partial view, silhouette, or first-person perspective. Focus on the feeling of being together.`;
        break;

      case "mood":
        prompt += `Atmospheric mood image. ${userText}. Express emotion through lighting, objects, weather, room corners, colors. Cha may or may not appear - focus on the feeling. Artistic expression of inner world.`;
        break;

      default:
        prompt += CHA_DESCRIPTION + "\n\n" + userText;
    }

    return prompt;
  }

  // ── Default Image Parameters ───────────────────────────────────────────────

  function getDefaultImageParams(route = "portrait") {
    return {
      size: "1024x1536",
      quality: "standard", // reference edit path maps this to medium
      style: "natural",
      // Identity reference stays off until a replacement identity pack is approved.
      useIdentityReference: false
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  window.SavePrincessImagePolicy = {
    detectImageIntent,
    buildImagePrompt,
    getDefaultImageParams,
    CHA_CHARACTER_BIBLE,
    CHA_IDENTITY_REFERENCES
  };

})();
