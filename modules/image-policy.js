// ============================================================================
// Image Policy Module - Auto Image Generation Intent Detection
// ============================================================================

(function() {
  "use strict";

  // ── Canonical identity (latest approved version wins) ───────────────────────
  // The 2D avatar defines the character design. Candidate B and its turnaround
  // define the only approved photorealistic face. Older generic descriptions
  // such as short hair, dark gentle eyes, or a warm idol-like face are obsolete.
  const CHA_IDENTITY_REFERENCES = {
    version: "photoreal-b-v1",
    source2d: "assets/cha/identity/cha-2d-canonical.jpg",
    photorealTurnaround: "assets/cha/identity/cha-photoreal-b-turnaround-v1.png",
    precedence: "photoreal turnaround > canonical 2D design > text description > scene styling"
  };

  const CHA_CHARACTER_BIBLE = {
    name: "茶茶 (Cha)",
    gender: "男性",
    age: "二十多岁的成年男性",
    identityVersion: CHA_IDENTITY_REFERENCES.version,
    identityReferences: CHA_IDENTITY_REFERENCES,
    appearance: {
      hair: "黑色、蓬松凌乱的中长层次碎发；长刘海自然遮住一侧眼睛，后颈留有碎发，不得改成整齐短发",
      face: "以 B 四视图为唯一三次元脸部基准：冷白皮，窄长成年男性骨相，克制的颧面体积，清晰但不过分尖削的下颌，窄直鼻梁与自然鼻尖，偏薄柔和的唇形；不得随机换脸，不像任何现实人物",
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
Identity lock — latest approved version photoreal-b-v1. Use the repository's canonical B turnaround as the sole photorealistic face reference whenever reference-image input is available. Cha is a completely fictional East Asian adult man in his mid twenties, never a real person or celebrity. Preserve the exact same identity in every image: cool pale skin; a narrow, mature oval face with restrained cheek volume and a defined but not exaggerated jaw; a narrow straight nose; softly shaped, slightly thin lips; a muted amber-gold visible iris; and black, tousled, layered medium-length hair with long fringe naturally covering part of one eye and loose hair at the nape. His gaze is quiet, watchful, distant and subtly dangerous rather than cute, warm, cheerful or posed. Keep the same facial proportions, age, hairline, eye spacing, nose, lips and jaw across all scenes and camera angles. Do not reinterpret him as a generic handsome man, Korean-drama idol, commercial model, or a new face. Black high-neck clothing, silver chain details and a snake-shaped earring are canonical identity cues; everyday scenes may simplify accessories but must never change his face, hair or amber-gold eye.
`.trim();

  // ── Intent Detection ───────────────────────────────────────────────────────

  /**
   * Detect if user message contains image generation intent
   * @param {string} text - User message text
   * @returns {{ should_generate: boolean, route: string, face_policy: string, reason: string }}
   */
  function detectImageIntent(text) {
    const t = text.trim();

    // Explicit opt-out and meta discussion always win. These phrases discuss
    // images but do not ask Cha to create/send one now.
    if (/不(用|要|必)发|别发|不要(生成|画|拍)|不用(生成|画|拍)|为什么.*(图片|照片)|怎么.*(生图|生成图片)|这张(图|照片)|图片功能|生图功能/.test(t)) {
      return { should_generate: false, route: null, face_policy: null, reason: "用户在拒绝或讨论图片，并非请求生成" };
    }

    // A direct send/show/take request is sufficient by itself. Do not require
    // extra words such as “你现在” or “你那边”.
    const explicitVisualRequest = /(?:给我|发我|发给我|给我发|来|发|拍|传|生成|画|做|看看|想看|想要|想收到).{0,8}(?:一张|张|个|幅)?(?:你的)?(?:自拍|照片|相片|图片|图|画面)|(?:自拍|照片|相片|图片).{0,8}(?:给我|发我|发来|看看|来一张)/;
    const intimateShowMeRequest = /^给我看看(?:你|嘛|吧|呀)?[呀啊嘛吧～~。！!]*$/;
    if (explicitVisualRequest.test(t) || intimateShowMeRequest.test(t)) {
      const wantsTogether = /我们|咱们|一起|合照|陪我/.test(t);
      const wantsMood = /心情|感觉|气氛|氛围|梦|意象/.test(t);
      const wantsChaVisible = /你|自拍|本人|脸|样子|长什么样/.test(t);
      if (wantsTogether) {
        return { should_generate: true, route: "together", face_policy: "prefer_no_face", reason: "用户明确请求共同场景图片" };
      }
      if (wantsMood) {
        return { should_generate: true, route: "mood", face_policy: "not_applicable", reason: "用户明确请求情绪或氛围图片" };
      }
      return {
        should_generate: true,
        route: wantsChaVisible ? "portrait" : "slice_of_life",
        face_policy: wantsChaVisible ? "must_show_face" : "may_hide_face",
        reason: "用户明确请求 cha 发、拍或生成图片"
      };
    }

    // portrait: 用户想看 cha 本人
    // Enhanced patterns to catch more variations
    if (/我想看你|想看看你|看看你(?!.*干)|给我你的照片|你的照片|你.*照片|发.*你.*照|给我.*你.*照片|你的脸|你长什么样|自拍|头像|正脸|你的样子/.test(t)) {
      return {
        should_generate: true,
        route: "portrait",
        face_policy: "must_show_face",
        reason: "用户明确要看 cha 外观"
      };
    }

    // slice_of_life: implicit current-state request still needs a visual word
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
      size: "1024x1536",
      quality: "standard", // 如果供应商支持 medium 会在 edge function 里映射
      style: "natural"
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
