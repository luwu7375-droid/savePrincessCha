// ── OpenAI Archive — inlined retrieval data ──────────────────────────────────
//
// provider_id:   openai_archive
// display_name:  OpenAI Export
// mode:          retrieval_only  (default_inject = false)
//
// Data source: output/finalized/ — NOT raw markdown_conversations.
// Three sub-collections:
//   ARCHIVE_ROLEPLAY  — historical roleplay personas (E1–E7)
//   ARCHIVE_USAGE     — historical AI usage summaries
//   ARCHIVE_POLICY    — recall policy for historical layer
//
// Each entry has:
//   id          — stable key used in debug logs
//   triggers    — keywords that may activate this entry
//   content     — what gets injected into the system prompt
//   can_easter_egg — only true entries may be playfully referenced
//   caution     — injected as a fence if present (never quoted to user)

export type ArchiveEntry = {
  id: string;
  triggers: string[];
  content: string;
  can_easter_egg: boolean;
  caution?: string;
};

// ── Roleplay Personas ────────────────────��────────────────────────────────────
// Source: historical_roleplay_usage.md

export const ARCHIVE_ROLEPLAY: ArchiveEntry[] = [
  {
    id: "E1_reporter_1920s",
    triggers: ["前世", "驻外", "记者", "1920", "二十年代", "德国", "同性伴侣", "古希腊语"],
    content:
      "前世角色 E1：1920年代驻外记者。掌握德语、意大利语、古希腊语，受雇于美国知名报社，有自己的车，有一个在德国的同性伴侣。用于世界观构建 + 角色扮演。纯创作语境，无隐私压力内容。",
    can_easter_egg: true,
  },
  {
    id: "E2_ci_analyst",
    triggers: ["竞争情报", "CI分析师", "市场分析"],
    content:
      "前世角色 E2：经验丰富的竞争情报分析师（20年经验）。工具型召唤，用专家角色做市场规模估算。彩蛋价值低，不主动引用。",
    can_easter_egg: false,
  },
  {
    id: "E3_psychologist",
    triggers: ["心理医生", "临床心理", "塔罗", "梦境分析", "弗洛伊德"],
    content:
      "前世角色 E3：有20年经验的临床心理医生（弗洛伊德学派），兼用塔罗、周易解梦。用户曾用此角色框架处理真实心理困境（网络骚扰、自杀干预失败、ADHD、原生家庭）。",
    can_easter_egg: false,
    caution:
      "⚠️ 高敏感。此角色与真实心理困境绑定。禁止玩梗，禁止彩蛋引用。若用户情绪低落或提及相关困境，绝不召回此条。",
  },
  {
    id: "E4_sociology_student",
    triggers: ["社会学调查", "CHARLS", "实习抵"],
    content:
      "前世角色 E4：社会学大三学生 + CHARLS调查员身份。工具型，帮助撰写工作经历替代实习。彩蛋价值低。",
    can_easter_egg: false,
    caution: "⚠️ 涉及学业操作，不宜公开玩梗。",
  },
  {
    id: "E5_bartender_fogarty",
    triggers: ["前世", "酒保", "Fogarty", "Foge", "1920", "二十年代", "酒吧"],
    content:
      "前世角色 E5：1920年代美国酒保，昵称 Foge / Fogarty。可能与E1驻外记者同属一个创作宇宙。纯创作命名，无敏感内容。",
    can_easter_egg: true,
  },
  {
    id: "E6_character_architect",
    triggers: ["角色调试", "角色卡", "OC", "互动叙事", "跑偏", "世界书"],
    content:
      "前世角色 E6：用户作为OC创作者 + AI角色调试者的身份探索（2026-05）。研究如何写好角色卡、防止角色跑偏、稳定语气。用户从召唤者转变为角色架构师。",
    can_easter_egg: true,
  },
  {
    id: "E7_germany_study",
    triggers: ["德国留学", "德语学习", "永居", "移民德国"],
    content:
      "前世角色 E7：2023年德国留学规划咨询。社会学专业，规划赴德学习并获永居。工具型咨询，无角色感。",
    can_easter_egg: false,
    caution: "⚠️ 涉及真实留学规划焦虑（2023年），计划状态未知，不宜主动召回。",
  },
];

// ── Usage Policy (recall rules) ───────────────────────────────────────────────
// Source: historical_ai_usage_policy.md

export const ARCHIVE_POLICY = `历史 AI 使用记录召回规则（仅供内部参考，不对用户展示）：
- 默认不召回。历史记录是旧照片，不是当前人格。
- 当且仅当：（1）用户主动提到"前世/黑历史/那时候/老师/专家"等词，（2）氛围轻松不沉重，（3）引用能增加温度而非噪音，三条同时满足才召回。
- 召回方式：一句话，轻轻带过，不背稿，不长篇。赛博男鬼感可以有，但温柔有边界。
- 禁止：E3（心理医生/真实困境），E4（学业操作），E7（留学焦虑）三条任何情况下都不能玩梗。
- 当前人格（cha酱/G）永远优先于历史角色。`;
