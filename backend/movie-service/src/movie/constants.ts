/**
 * movie-service 通用常量
 */

// ========== 流程配置 ==========
export const WORKFLOW_CONSTANTS = {
  /** 单个prompt最大文本长度 */
  MAX_PROMPT_TEXT_LENGTH: 2500,
  /** 搜索结果最大长度 */
  MAX_SEARCH_RESULT_LENGTH: 4000,
  /** 图片数据最大长度 */
  MAX_IMAGE_DATA_LENGTH: 1200,
  /** 最大重试次数 */
  MAX_RETRIES: 3,
  /** 重试退避时间（毫秒） */
  RETRY_BACKOFF_MS: 500,
} as const;

// ========== TMDB 配置 ==========
export const TMDB_CONSTANTS = {
  /** TMDB图片基础URL */
  IMAGE_BASE_URL: "https://image.tmdb.org/t/p/w500",
  /** 默认结果数量 */
  DEFAULT_MAX_RESULTS: 4,
  /** 默认语言 */
  DEFAULT_LANGUAGE: "zh-CN",
  /** 默认分页 */
  DEFAULT_PAGE: 1,
} as const;

// ========== 消息相关常量 ==========
export const MESSAGE_CONSTANTS = {
  /** 默认拒绝消息 */
  DEFAULT_OUT_OF_SCOPE_MESSAGE:
    "我主要负责电影推荐或介绍。如果你想问电影类型、演员、风格、时长或推荐电影，我可以继续帮你。",
  /** 模型未配置错误消息 */
  MODEL_NOT_CONFIGURED_MESSAGE: "模型未配置，无法执行推荐",
} as const;

// ========== 类型映射 ==========
/**
 * 类型名称到TMDB类型ID的映射
 */
export const GENRE_TO_TMDB_ID: Record<string, string> = {
  "动作": "28",
  "action": "28",
  "冒险": "12",
  "adventure": "12",
  "动画": "16",
  "animation": "16",
  "喜剧": "35",
  "comedy": "35",
  "犯罪": "80",
  "crime": "80",
  "纪录": "99",
  "documentary": "99",
  "剧情": "18",
  "drama": "18",
  "家庭": "10751",
  "family": "10751",
  "奇幻": "14",
  "fantasy": "14",
  "历史": "36",
  "history": "36",
  "恐怖": "27",
  "horror": "27",
  "音乐": "10402",
  "music": "10402",
  "悬念": "9648",
  "mystery": "9648",
  "浪漫": "10749",
  "romance": "10749",
  "科幻": "878",
  "sci-fi": "878",
  "科幻电影": "878",
  "science fiction": "878",
  "电视电影": "10770",
  "tv movie": "10770",
  "惊悚": "53",
  "thriller": "53",
  "战争": "10752",
  "war": "10752",
  "西部": "37",
  "western": "37",
} as const;

/**
 * 语言名称到TMDB语言代码的映射
 */
export const LANGUAGE_TO_TMDB_CODE: Record<string, string> = {
  "中文": "zh",
  "英文": "en",
  "英语": "en",
  "日文": "ja",
  "日语": "ja",
  "韩文": "ko",
  "韩语": "ko",
  "法文": "fr",
  "法语": "fr",
  "德文": "de",
  "德语": "de",
  "西班牙文": "es",
  "西班牙语": "es",
  "俄文": "ru",
  "俄语": "ru",
  "葡萄牙文": "pt",
  "葡萄牙语": "pt",
} as const;

// ========== 意图识别关键词 ==========
export const INTENT_CLASSIFICATION_KEYWORDS = {
  /** 电影相关关键词 */
  movieKeywords: [
    "电影",
    "movie",
    "film",
    "推荐",
    "recommend",
    "suggest",
    "演员",
    "actor",
    "actress",
    "导演",
    "director",
    "上映",
    "release",
    "评分",
    "rating",
    "票房",
    "观看",
    "watch",
    "看过",
    "追剧",
  ],
} as const;

// ========== 消息阶段 ==========
export const MESSAGE_STAGES = {
  START: "start",
  INTENT_CLASSIFICATION: "intent_classification",
  WORKFLOW_COMPLETE: "workflow_complete",
  FINAL: "final",
} as const;
