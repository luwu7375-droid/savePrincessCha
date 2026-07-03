// ============================================================================
// Image Policy Module - Auto Image Generation Intent Detection
// ============================================================================

(function() {
  "use strict";

  // ── Character Bible ────────────────────────────────────────────────────────
  const CHA_CHARACTER_BIBLE = {
    name: "茶茶 (Cha)",
    gender: "男性",
    age: "年轻成年男性",
    appearance: {
      hair: "黑色自然短发，发型略微蓬松，刘海自然",
      face: "五官柔和，眼神温柔，表情不夸张",
      temperament: "清秀温和，气质安静干净",
      build: "纤瘦自然"
    },
    wardrobe: "简洁、低饱和、舒适的日常服饰，针织衫、衬衫、T恤、开衫、宽松外套",
    common_scenes: ["家里", "厨房", "书桌", "窗边", "夜晚", "雨天", "散步"],
    atmosphere: "生活感、陪伴感、温柔、安静、真实",
    visual_style: {
      medium: "摄影风格，真实照片质感",
      lighting: "柔和自然光、暖灯、夜景灯光",
      mood: "不要商业写真感，不要过度精修感",
      perspective: "像他分享给你看的生活照片"
    }
  };

  // ── Base Prompt Foundation ───────────────��─────────────────────────────────
  const BASE_PROMPT_FOUNDATION = `photorealistic slice-of-life image, natural daily-life atmosphere, quiet companionship, soft natural lighting, low-saturation colors, clean composition, realistic life photo feeling, not commercial poster style, not over-polished, not cyberpunk, not glossy AI aesthetic, natural expressions, believable body proportions, natural hands, no extra fingers, no extra limbs, no distorted faces.`;

  const CHA_DESCRIPTION = `Cha is a young adult man with dark natural short hair (slightly fluffy, natural bangs), soft clean facial features, gentle eyes, quiet and restrained temperament, slim natural build, simple low-saturation daily clothes such as knitwear, shirt, T-shirt, cardigan, or loose jacket. He feels calm, clean, warm, and real, like someone sharing a private life photo.`;

  // ── Intent Detection ───────────────────────────────────────────────────────

  /**
   * Detect if user message contains image generation intent
   * @param {string} text - User message text
   * @returns {{ should_generate: boolean, route: string, face_policy: string, reason: string }}
   */
  function detectImageIntent(text) {
    const t = text.trim();

    // portrait: 用户想看 cha 本人
    if (/我想看你|给我你的照片|你的脸|你长什么样|自拍|头像|正脸|你的样子/.test(t)) {
      return {
        should_generate: true,
        route: "portrait",
        face_policy: "must_show_face",
        reason: "用户明确要看 cha 外观"
      };
    }

    // slice_of_life: 需要视觉词触发（避免"你在干嘛"单独触发）
    if (/(发|给|看|拍|传)(张|一张|个|一个)?(图|照片|画面|图片)/.test(t) ||
        /给我看看|让我看看|报个平安/.test(t)) {
      if (/你在干(嘛|吗|什么)|你在做什么|现在在干嘛|在忙什么/.test(t)) {
        return {
          should_generate: true,
          route: "slice_of_life",
          face_policy: "may_hide_face",
          reason: "用户要求看当前状态 + 视觉词触发"
        };
      }
      if (/你那边|你今天|你的生活|你现在/.test(t)) {
        return {
          should_generate: true,
          route: "slice_of_life",
          face_policy: "may_hide_face",
          reason: "用户要求看生活片段"
        };
      }
    }

    // together: 强调陪伴、我们
    if (/画.*我们|我们.*一起|陪我|合照|咱们/.test(t)) {
      return {
        should_generate: true,
        route: "together",
        face_policy: "prefer_no_face",
        reason: "用户要求陪伴场景"
      };
    }

    // mood: 情绪/氛围表达
    if (/(把|将).*(感觉|心情|气氛|氛围).*(画|图)|画.*心情|心情.*画|现在的心情像/.test(t)) {
      return {
        should_generate: true,
        route: "mood",
        face_policy: "not_applicable",
        reason: "用户要求情绪氛围表达"
      };
    }

    return {
      should_generate: false,
      route: null,
      face_policy: null,
      reason: "无明确生图意图"
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

  function getDefaultImageParams() {
    return {
      size: "1024x1024",
      quality: "standard", // 如果供应商支持 medium 会在 edge function 里映射
      style: "natural"
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  window.SavePrincessImagePolicy = {
    detectImageIntent,
    buildImagePrompt,
    getDefaultImageParams,
    CHA_CHARACTER_BIBLE
  };

})();
