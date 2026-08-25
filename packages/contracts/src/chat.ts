/** 推荐卡片上的影片字段。后端汇总 JSON 与前端展示共用，别名字段是历史兼容。 */
export interface RecommendationItem {
  id?: number;
  name?: string;
  title?: string;
  original_title?: string;
  reason?: string;
  summary?: string;
  overview?: string;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
  genre_ids?: number[];
  genres?: string[];
  genre_names?: string[];
  poster_path?: string;
  poster_url?: string;
  backdrop_path?: string | null;
  backdrop_url?: string;
  tmdb_url?: string;
  adult?: boolean;
  video?: boolean;
}

/** 用户提问气泡。 */
export type UserMessagePayload = {
  kind: "user_query";
  text: string;
};

/** 推荐成功气泡。 */
export type RecommendationPayload = {
  kind: "recommendation";
  text: string;
  movies: RecommendationItem[];
};

/** 域外拒绝气泡。 */
export type RejectPayload = {
  kind: "reject";
  message: string;
};

/** 工作流失败气泡。 */
export type ErrorPayload = {
  kind: "error";
  message: string;
};

export type AssistantPayload =
  | RecommendationPayload
  | RejectPayload
  | ErrorPayload;

/** `POST /movie/recommend` 的 HTTP 成功体（业务 type，不是 HTTP 错误）。 */
export interface RecommendResponse {
  conversationId?: string;
  type: "success" | "reject" | "error";
  data: AssistantPayload;
}

export interface ConversationSummary {
  conversation_id: string;
  title?: string | null;
  created_at: string;
}

export interface ConversationChatItem {
  id: string;
  turn_id: string;
  role: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ConversationDetail {
  conversation_id: string;
  user_id?: string | null;
  title?: string | null;
  messages: ConversationChatItem[];
}
