/**
 * movie-service 通用常量
 */

// ========== 流程配置 ==========
export const WORKFLOW_CONSTANTS = {
  /** 单个prompt最大文本长度 */
  MAX_PROMPT_TEXT_LENGTH: 2500,
  /** 汇总给 LLM 的检索证据最大长度 */
  MAX_SYNTHESIS_EVIDENCE_LENGTH: 8000,
  /** 写入共享态的历史消息上限（Postgres 按时间序截取最近 N 条） */
  MAX_SHARED_HISTORY_TURNS: 20,
  /** 用户历史单条截断 */
  HISTORY_USER_MAX_LENGTH: 400,
  /** 助手历史单条截断（压缩片单 JSON 后） */
  HISTORY_ASSISTANT_MAX_LENGTH: 280,
  /** 最大重试次数 */
  MAX_RETRIES: 3,
  /** 重试退避时间（毫秒） */
  RETRY_BACKOFF_MS: 500,
} as const;

export const HISTORY_PROJECTION = {
  intentMaxTurns: 4,
  planningMaxTurns: 4,
  searchMaxTurns: 8,
  synthesisMaxTurns: 6,
} as const;

// ========== TMDB 配置 ==========
export const TMDB_CONSTANTS = {
  /** 列表类工具未指定 max_results 时的条数。进模型的数量由 VIEW_CONSTANTS 控制。 */
  DEFAULT_MAX_RESULTS: 3,
  /** 列表类工具 max_results 硬上限 */
  MAX_RESULTS_LIMIT: 20,
  /** person_detail 写入工作副本的作品条数上限（cast / crew 各一份） */
  MAX_PERSON_CREDITS: 80,
  /** movie_detail 写入工作副本的主演条数上限 */
  MAX_MOVIE_CAST: 40,
  /** movie_detail 写入工作副本的职员条数上限 */
  MAX_MOVIE_CREW: 40,
  /** 默认语言 */
  DEFAULT_LANGUAGE: "zh-CN",
} as const;

/**
 * 给模型看的视图上限。工作副本可以更完整。
 */
export const VIEW_CONSTANTS = {
  /** 汇总视图中的影片条数 */
  MOVIE_LIMIT: 8,
  /** 显式打开作品表时写入视图的条数 */
  CREDIT_LIMIT: 8,
  /** 视图中人物传记的最大字符数 */
  BIOGRAPHY_MAX_LENGTH: 180,
  /** 工作副本里保留的简介最大字符数 */
  OVERVIEW_STORE_MAX_LENGTH: 200,
} as const;

/**
 * Relation 执行器上限。超出则本轮失败并回退 Search。
 */
export const RELATION_CONSTANTS = {
  /** 单次计划最多解析的实体数 */
  MAX_ENTITIES: 3,
  /** discover 策略向 TMDB 取的条数 */
  DISCOVER_MAX_RESULTS: 20,
} as const;

// ========== 消息相关常量 ==========
export const MESSAGE_CONSTANTS = {
  /** 默认拒绝消息 */
  DEFAULT_OUT_OF_SCOPE_MESSAGE:
    "我主要负责电影推荐或介绍。如果你想问电影类型、演员、风格、时长或推荐电影，我可以继续帮你。",
} as const;

// ========== 类型映射 ==========
/**
 * 类型名称到TMDB类型ID的映射
 */
export const GENRE_TO_TMDB_ID: Record<string, number> = {
  // 英文 / 通用名称映射 
  "action": 28,
  "adventure": 12,
  "animation": 16,
  "comedy": 35,
  "crime": 80,
  "documentary": 99,
  "drama": 18,
  "family": 10751,
  "fantasy": 14,
  "history": 36,
  "horror": 27,
  "music": 10402,
  "mystery": 9648,
  "romance": 10749,
  "science-fiction": 878,
  "sci-fi": 878, // 常见缩写补充
  "tv-movie": 10770,
  "thriller": 53,
  "war": 10752,
  "western": 37,

  // 中文名称映射 (方便 LLM 直接传中文检索)
  "动作": 28,
  "冒险": 12,
  "动画": 16,
  "喜剧": 35,
  "犯罪": 80,
  "纪录": 99,
  "纪录片": 99,
  "剧情": 18,
  "家庭": 10751,
  "奇幻": 14,
  "历史": 36,
  "恐怖": 27,
  "音乐": 10402,
  "悬疑": 9648,
  "爱情": 10749,
  "科幻": 878,
  "电视电影": 10770,
  "惊悚": 53,
  "战争": 10752,
  "西部": 37
} as const;
