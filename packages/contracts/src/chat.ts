import { constValues, omitKey } from "./const-map";

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

/** 拒绝继续处理的气泡（域外或意图无法识别）。 */
export type RejectPayload = {
  kind: "reject";
  message: string;
};

/** 工作流失败气泡。 */
export type ErrorPayload = {
  kind: "error";
  message: string;
};

/** 用户点「停止」后的助手气泡。超时仍走 {@link ErrorPayload}。 */
export type CancelledPayload = {
  kind: "cancelled";
  message: string;
};

export type AssistantPayload =
  | RecommendationPayload
  | RejectPayload
  | ErrorPayload
  | CancelledPayload;

/**
 * `turns.status` 全量。已结束取值也是 SSE `final.type`，不要再平行抄一份。
 */
export const TURN_STATUS = {
  RUNNING: "running",
  SUCCESS: "success",
  REJECT: "reject",
  ERROR: "error",
  /** 用户主动停止；写入 CompleteTurn 后再推 `final` */
  CANCELLED: "cancelled",
} as const;

export type TurnStatus = (typeof TURN_STATUS)[keyof typeof TURN_STATUS];

/**
 * 已结束轮次，也是 HTTP / SSE `final` 的业务 `type`。
 * 不是气泡 `kind`，也不是 SSE 的 `event`。
 */
export type FinishedTurnStatus = Exclude<
  TurnStatus,
  typeof TURN_STATUS.RUNNING
>;

/** 已结束取值列表，由 {@link TURN_STATUS} 去掉 `running` 得到。 */
export const FINISHED_TURN_STATUSES = constValues(
  omitKey(TURN_STATUS, "RUNNING"),
);

/**
 * 运行时收窄为 {@link FinishedTurnStatus}。
 *
 * @param value 未知输入（gRPC 字符串、SSE JSON 等）
 * @returns 是否为已结束轮次取值
 * @example
 * isFinishedTurnStatus("success") // → true
 * isFinishedTurnStatus("running") // → false
 */
export function isFinishedTurnStatus(
  value: unknown,
): value is FinishedTurnStatus {
  return (
    typeof value === "string" &&
    (FINISHED_TURN_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * `POST /movie/chat/cancel` 的 reason。
 * 断线 / 刷新不算取消；只有停止按钮和前端超时会打这个口。
 */
export const CANCEL_REASON = {
  /** 用户点「停止」 */
  USER: "user",
  /** 前端等待上限到了 */
  TIMEOUT: "timeout",
} as const;

/** `reason` 合法取值，给 DTO `IsIn` 用。 */
export const CANCEL_REASONS = constValues(CANCEL_REASON);

/** 取消原因。 */
export type CancelReason = (typeof CANCEL_REASONS)[number];

/**
 * 一轮对话的业务结论。
 * SSE 的 `final` 事件在此基础上加 `event`；
 * 鉴权 / DTO 失败仍走 `{ code, message }` JSON，不走这里。
 */
export type ChatTurnResult = {
  /** 会话 id；开流后的 `final` 会带上 */
  conversationId?: string;
  /** 已结束轮次取值，与 `turns.status` 同一份 */
  type: FinishedTurnStatus;
  /** 助手气泡 payload，与写入 CompleteTurn 的同一份 */
  data: AssistantPayload;
};

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

/**
 * 会话详情按「最近一页」返回，前端上滑再取更早的。
 * gRPC `GetConversation` 不带分页，仍是整会话。
 */
export const CONVERSATION_PAGE = {
  /** 未指定 `limit` 时一页的气泡条数。 */
  DEFAULT_SIZE: 20,
  /** `limit` 上限，超过按校验失败拒绝。 */
  MAX_SIZE: 100,
} as const;

export interface ConversationDetail {
  conversation_id: string;
  user_id?: string | null;
  title?: string | null;
  /** 按 `created_at` 升序的一页气泡；分页时是最近一页。 */
  messages: ConversationChatItem[];
  /** 这一页之前是否还有更早的气泡。 */
  has_more: boolean;
  /** 取更早一页时回传给 `before` 的游标；没有更早则为 null。 */
  before_cursor: string | null;
}
