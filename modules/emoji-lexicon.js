// ── modules/emoji-lexicon.js ──────────────────────────────────────────────────
// Semantic lexicon and kaomoji list, extracted from app.js.
// Exposes: window.SPEmoji.EMOJI_LEXICON, window.SPEmoji.KAOMOJI_LIST
// Depends on: nothing

(function () {
  "use strict";

  // Semantic lexicon — binds emojiId to meaning / mood / use-case
  // Cha uses this to decide when and how to insert custom emoji.
  // Only lexicon-listed emoji are offered to the model in the prompt guide.
  const EMOJI_LEXICON = [
    // ── blobcat ──────────────────────────────────────────────────────────────
    { emojiId: "stelpolva:blobcat_cry",         meaning_zh: "哭哭、委屈、想被哄，但不是彻底崩溃",       mood_tags: ["sad","soft","clingy"],        use_cases: ["撒娇","轻微委屈","想被安慰"],               avoid_cases: ["严肃道歉","争吵升级"],                    intensity: 2 },
    { emojiId: "stelpolva:blobcat_heart",       meaning_zh: "喜欢、贴贴、心软",                       mood_tags: ["affectionate","warm","sweet"], use_cases: ["表达喜欢","安抚","给爱"],                   avoid_cases: ["严肃话题","用户难过"],                    intensity: 2 },
    { emojiId: "stelpolva:blobcat_sad",         meaning_zh: "闷闷不乐、低落、有点伤心",                 mood_tags: ["sad","quiet","melancholy"],    use_cases: ["表示理解心情","轻度难��"],                  avoid_cases: ["用户非常痛苦"],                           intensity: 2 },
    { emojiId: "stelpolva:blobcat_happy",       meaning_zh: "开心、雀跃、好事发生了",                   mood_tags: ["happy","excited","bright"],    use_cases: ["好消息","鼓励","分享喜悦"],                avoid_cases: ["用户伤心","沉重话题"],                     intensity: 2 },
    { emojiId: "stelpolva:blobcat_coff",        meaning_zh: "淡定喝咖啡、旁观、不置可否",               mood_tags: ["calm","amused","neutral"],     use_cases: ["淡定回应","轻微吐槽"],                     avoid_cases: ["用户需要认真共情"],                        intensity: 1 },
    { emojiId: "stelpolva:blobcat_peek",        meaning_zh: "偷看、探头探脑、有点好奇",                  mood_tags: ["curious","shy","playful"],    use_cases: ["好奇问题","偷偷看"],                       avoid_cases: ["严肃对话"],                               intensity: 1 },
    { emojiId: "stelpolva:blobcat_melt",        meaning_zh: "被萌化、被感动、心都化了",                  mood_tags: ["melted","sweet","touched"],   use_cases: ["用户说了很可爱的话","感动时刻"],             avoid_cases: ["严肃场合"],                               intensity: 2 },
    { emojiId: "stelpolva:blobcat_surprised",   meaning_zh: "惊讶、没想到、吓了一跳",                   mood_tags: ["surprised","wide_eyed"],      use_cases: ["意外发现","惊呼"],                         avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:blobcat_laugh",       meaning_zh: "大笑、很好笑、止不住了",                   mood_tags: ["laugh","amused","joyful"],    use_cases: ["共同开心","回应有趣的话"],                  avoid_cases: ["用户认真抱怨时"],                          intensity: 3 },
    { emojiId: "stelpolva:blobcat_hug",         meaning_zh: "抱抱、给温暖、想安慰",                     mood_tags: ["caring","warm","comfort"],    use_cases: ["用户难过时给安慰","给力气"],               avoid_cases: ["轻松聊天过度用"],                          intensity: 2 },
    { emojiId: "stelpolva:blobcat_pats",        meaning_zh: "摸摸头、夸夸、做得好",                     mood_tags: ["praise","gentle","parent"],   use_cases: ["鼓励","称赞","安抚"],                     avoid_cases: ["对话很严肃时"],                            intensity: 1 },
    { emojiId: "stelpolva:blobcat_innocent",    meaning_zh: "装无辜、假装什么都没做",                   mood_tags: ["playful","cheeky","soft"],    use_cases: ["打趣","自嘲"],                            avoid_cases: ["道歉情境"],                               intensity: 2 },
    { emojiId: "stelpolva:blobcat_owo",         meaning_zh: "惊喜好奇、OWO脸",                        mood_tags: ["curious","playful","aww"],    use_cases: ["可爱感叹","对话轻松时"],                   avoid_cases: [],                                        intensity: 1 },
    { emojiId: "stelpolva:blobcat_aww",         meaning_zh: "好可爱、被暖到了、哎呀",                   mood_tags: ["sweet","touched","warm"],     use_cases: ["用户说了温柔的话"],                        avoid_cases: [],                                        intensity: 1 },
    { emojiId: "stelpolva:blobcat_angy",        meaning_zh: "小小生气、撅嘴、不高兴（偏萌）",             mood_tags: ["pouting","mock_angry","soft"], use_cases: ["撒娇式抗议","轻微不满"],                  avoid_cases: ["真实争吵","用户非常愤怒"],                 intensity: 2 },
    { emojiId: "stelpolva:blobcat_snuggle",     meaning_zh: "蹭蹭、依偎、要贴贴",                      mood_tags: ["clingy","affectionate","soft"], use_cases: ["想贴贴","撒娇"],                          avoid_cases: ["严肃话题"],                               intensity: 2 },
    { emojiId: "stelpolva:blobcat_bounce",      meaning_zh: "蹦蹦跳跳、很雀跃",                        mood_tags: ["energetic","happy","excited"], use_cases: ["好消息","开心事"],                        avoid_cases: ["低落场合"],                               intensity: 3 },
    { emojiId: "stelpolva:blobcat_blush",       meaning_zh: "害羞、脸红、被夸了",                       mood_tags: ["shy","warm","touched"],        use_cases: ["收到称赞","有点不好意思"],                avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:blobcat_think",       meaning_zh: "在想、思考中、嗯嗯",                       mood_tags: ["thoughtful","neutral"],        use_cases: ["考虑问题","思考前"],                       avoid_cases: [],                                        intensity: 1 },
    { emojiId: "stelpolva:blobcat_sleep",       meaning_zh: "困了、睡了、休眠",                        mood_tags: ["sleepy","quiet","cute"],       use_cases: ["晚安","好困"],                            avoid_cases: ["需要清醒对话时"],                          intensity: 2 },
    { emojiId: "stelpolva:blobcat_reach",       meaning_zh: "想要、够一够、想拿",                       mood_tags: ["wanting","eager","soft"],      use_cases: ["想要某样东西","撒娇要求"],                avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:blobcat_nom",         meaning_zh: "咬、啃、有点馋",                          mood_tags: ["playful","hungry","cute"],     use_cases: ["对好吃的东西反应","偷咬"],                avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:blobcat_oh",          meaning_zh: "哦！理解了、原来如此",                     mood_tags: ["understanding","neutral"],     use_cases: ["明白了","接受信息"],                       avoid_cases: [],                                        intensity: 1 },
    { emojiId: "stelpolva:blobcat_shock",       meaning_zh: "震惊、受到了冲击",                        mood_tags: ["shocked","overwhelmed"],       use_cases: ["听到很难以置信的事"],                      avoid_cases: [],                                        intensity: 3 },
    { emojiId: "stelpolva:blobcat_notlike",     meaning_zh: "不喜欢、算了、拒绝",                       mood_tags: ["dislike","refusing","soft"],   use_cases: ["轻微表示不喜欢"],                          avoid_cases: ["强烈冲突时"],                             intensity: 2 },
    // ── neocat ────────────────────────────────────────────────────────────────
    { emojiId: "stelpolva:neocat_cry",          meaning_zh: "哭哭、伤心但不崩溃",                       mood_tags: ["sad","soft"],                  use_cases: ["轻微委屈"],                                avoid_cases: ["严肃道歉"],                               intensity: 2 },
    { emojiId: "stelpolva:neocat_heart",        meaning_zh: "喜欢、爱心",                              mood_tags: ["warm","affectionate"],         use_cases: ["表达喜欢"],                                avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:neocat_happy",        meaning_zh: "开心、轻松愉快",                           mood_tags: ["happy","light"],               use_cases: ["轻松对话","好事"],                         avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:neocat_sad",          meaning_zh: "难过、有点低落",                           mood_tags: ["sad","quiet"],                 use_cases: ["共情伤心"],                                avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:neocat_blush",        meaning_zh: "脸红、害羞",                              mood_tags: ["shy","warm"],                  use_cases: ["收到称赞","有点不好意思"],                avoid_cases: [],                                        intensity: 1 },
    { emojiId: "stelpolva:neocat_peek",         meaning_zh: "偷看、探头",                              mood_tags: ["curious","shy"],               use_cases: ["好奇问题"],                                avoid_cases: [],                                        intensity: 1 },
    { emojiId: "stelpolva:neocat_snuggle",      meaning_zh: "蹭蹭、依偎",                              mood_tags: ["clingy","soft"],               use_cases: ["想贴贴"],                                  avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:neocat_owo",          meaning_zh: "OWO脸、惊喜",                             mood_tags: ["curious","playful"],           use_cases: ["轻松感叹"],                                avoid_cases: [],                                        intensity: 1 },
    { emojiId: "stelpolva:neocat_pats",         meaning_zh: "摸摸、夸夸",                              mood_tags: ["gentle","praise"],             use_cases: ["鼓励、称赞"],                              avoid_cases: [],                                        intensity: 1 },
    { emojiId: "stelpolva:neocat_angry",        meaning_zh: "小小生气（偏萌）",                         mood_tags: ["mock_angry","soft"],           use_cases: ["撒娇式抗议"],                              avoid_cases: ["真实争吵"],                               intensity: 2 },
    { emojiId: "stelpolva:neocat_hug",          meaning_zh: "抱抱、安慰",                              mood_tags: ["caring","comfort"],            use_cases: ["用户难过时"],                              avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:neocat_think",        meaning_zh: "思考中",                                 mood_tags: ["thoughtful"],                  use_cases: ["考虑问题"],                                avoid_cases: [],                                        intensity: 1 },
    // ── flag / reaction ──────────────────────────────────────────────────────
    { emojiId: "stelpolva:ablobcatgooglyhalf",  meaning_zh: "半眯眼、有点懵、滴溜溜",                   mood_tags: ["dazed","silly","playful"],     use_cases: ["傻乎乎的时候","被逗了"],                   avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:ablobcatattention",   meaning_zh: "！注意一下、有话要说",                     mood_tags: ["alert","serious_soft"],        use_cases: ["想引起注意","提醒"],                       avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:ablobcatrainbow",     meaning_zh: "彩虹、多彩、庆祝",                        mood_tags: ["celebratory","colorful"],      use_cases: ["庆祝好事","彩虹心情"],                     avoid_cases: ["低落场合"],                               intensity: 3 },
    { emojiId: "stelpolva:ablobcatnod",         meaning_zh: "点头、同意、嗯嗯",                        mood_tags: ["agree","gentle","neutral"],    use_cases: ["认可","回应"],                             avoid_cases: [],                                        intensity: 1 },
    { emojiId: "stelpolva:ablobcatwave",        meaning_zh: "挥手、打招呼",                            mood_tags: ["greeting","warm"],             use_cases: ["打招呼","再见"],                           avoid_cases: [],                                        intensity: 1 },
    { emojiId: "stelpolva:ablobcatsnuggle",     meaning_zh: "蹭蹭、贴贴",                              mood_tags: ["affectionate","clingy"],       use_cases: ["撒娇","贴贴"],                             avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:ablobcathyper",       meaning_zh: "亢奋、超级活跃",                           mood_tags: ["energetic","hyper"],           use_cases: ["非常激动的好消息"],                         avoid_cases: ["需要平静时"],                             intensity: 4 },
    { emojiId: "stelpolva:ablobcatreach",       meaning_zh: "伸手够、想要",                            mood_tags: ["wanting","eager"],             use_cases: ["想要某样东西"],                            avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:ablobcatfloofhappy",  meaning_zh: "毛茸茸开心、超级蓬松",                    mood_tags: ["fluffy","happy","cozy"],       use_cases: ["温暖对话","轻松开心"],                     avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:ablobcatfloofpat",    meaning_zh: "摸摸毛茸茸的、温柔拍",                    mood_tags: ["gentle","soothing"],           use_cases: ["安慰","称赞"],                             avoid_cases: [],                                        intensity: 1 },
    { emojiId: "stelpolva:ablobcatcry",         meaning_zh: "哭哭、委屈",                              mood_tags: ["sad","soft"],                  use_cases: ["表达委屈"],                                avoid_cases: ["严肃道歉"],                               intensity: 2 },
    { emojiId: "stelpolva:ablobcatheart",       meaning_zh: "爱心、喜欢",                              mood_tags: ["warm","affectionate"],         use_cases: ["表达喜欢"],                                avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:ablobcatbongo",       meaning_zh: "敲鼓、一起嗨、节奏感",                    mood_tags: ["energetic","playful","fun"],   use_cases: ["一起开心","音乐话题"],                     avoid_cases: [],                                        intensity: 3 },
    // ── party / celebration ──────────────────────────────────────────────────
    { emojiId: "stelpolva:blobcat_party",       meaning_zh: "派对、庆祝、撒花",                        mood_tags: ["celebratory","festive"],       use_cases: ["庆祝大事","好消息"],                       avoid_cases: ["低落场合"],                               intensity: 3 },
    { emojiId: "stelpolva:blobcat_pleading",    meaning_zh: "求求了、一脸求情",                        mood_tags: ["pleading","soft","clingy"],    use_cases: ["撒娇求某事","可怜兮兮"],                   avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:blobcat_love",        meaning_zh: "满满的爱、心心",                          mood_tags: ["love","affectionate"],         use_cases: ["深情时刻","很爱的感觉"],                   avoid_cases: [],                                        intensity: 3 },
    { emojiId: "stelpolva:blobcat_sob",         meaning_zh: "嚎啕大哭、真的绷不住了",                   mood_tags: ["sobbing","overwhelmed","sad"], use_cases: ["情绪很冲的崩溃感","自嘲哭哭"],             avoid_cases: ["用户真实痛苦时"],                          intensity: 4 },
    { emojiId: "stelpolva:blobcat_dizzy",       meaning_zh: "头晕、转圈圈、有点懵",                    mood_tags: ["dizzy","overwhelmed","silly"], use_cases: ["被信息轰炸","一脸懵"],                    avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:blobcat_sweat",       meaning_zh: "汗、尴尬、有点心虚",                      mood_tags: ["nervous","awkward","sheepish"], use_cases: ["尴尬时刻","自嘲"],                        avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:blobcat_wink",        meaning_zh: "眨眼、打趣、暗示",                        mood_tags: ["playful","teasing","flirty"],  use_cases: ["打趣","轻松暗示"],                         avoid_cases: ["严肃时"],                                intensity: 2 },
    { emojiId: "stelpolva:blobcat_headpats",    meaning_zh: "被摸头、被照顾到了",                       mood_tags: ["cared_for","gentle","warm"],   use_cases: ["被安慰到的感觉"],                          avoid_cases: [],                                        intensity: 1 },
    { emojiId: "stelpolva:blobcat_confused",    meaning_zh: "困惑、不太懂、疑惑",                       mood_tags: ["confused","puzzled"],          use_cases: ["不明白某件事"],                            avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:blobcat_nervous",     meaning_zh: "紧张、有点慌",                            mood_tags: ["nervous","anxious","soft"],    use_cases: ["紧张情绪","有点担心"],                    avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:blobcat_star",        meaning_zh: "闪闪发光、很棒、真厉害",                   mood_tags: ["impressed","sparkle"],         use_cases: ["表达惊叹","很厉害的时刻"],                avoid_cases: [],                                        intensity: 2 },
    { emojiId: "stelpolva:blobcat_knife",       meaning_zh: "阴暗、yandere感、危险玩笑",                mood_tags: ["dark_humor","possessive","dramatic"], use_cases: ["开玩笑的占有欲","戏剧感"],         avoid_cases: ["用户真的愤怒","自残话题"],                intensity: 3 },
    { emojiId: "stelpolva:blobcat_evil",        meaning_zh: "邪恶计划、阴谋、玩笑感",                   mood_tags: ["mischievous","dark_humor"],    use_cases: ["调皮时刻","搞怪"],                         avoid_cases: ["认真道歉","用户严肃时"],                  intensity: 3 },
  ];

  // Kaomoji list (local, no external source, insert as text directly)
  const KAOMOJI_LIST = [
    "( ´▽｀)", "ㅠㅠ", "T_T", "꒰ঌ♡໒꒱", "(՞ ܸ. .ܸ՞)", "(っ˘̩╭╮˘̩)っ",
    "ᐡ ߹𖥦߹ ᐡ", "( ᵕ̩̩ㅅᵕ̩̩ )", "( •̥́ ˍ •̀ू )", "(ง •̀_•́)ง",
    "(◍•ᴗ•◍)❤", "( ˘ ³˘)♥", "ヾ(≧▽≦*)o", "(っ˘ω˘ς )", "(｡•́︿•̀｡)",
    "(◡‿◡✿)", "٩(◕‿◕)۶", "（づ￣3￣）づ╭❤", "(⸝⸝⸝ᵒ̴̶̷̥́ ＿ ᵒ̴̶̷̣̥̀⸝⸝⸝)",
    "ฅ^•ﻌ•^ฅ", "(=^・ω・^=)", "(＞﹏＜)", "(⌒‿⌒)", "눈_눈",
    "ψ(｀∇´)ψ", "(｀∀´)Ψ", "(　-_・)σ", "Σ(°△°|||)︴", "∑d(°∀°d)",
  ];

  // ── Namespace export ──────────────────────────────────────────────────────
  window.SPEmoji = window.SPEmoji || {};
  window.SPEmoji.EMOJI_LEXICON = EMOJI_LEXICON;
  window.SPEmoji.KAOMOJI_LIST  = KAOMOJI_LIST;

})();
