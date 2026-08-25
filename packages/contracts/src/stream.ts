/**
 * `POST /movie/recommend` 的 SSE 契约。
 * 鉴权 / DTO 失败仍走 JSON 错误体；开流之后只推这些事件。
 */
import type { AssistantPayload, RecommendResultType } from "./chat";

/** SSE 帧里的 `event:` 名，也写在 JSON 的 `event` 字段上，丢了帧头仍能认。 */
export const STREAM_EVENT = {
  /** StartTurn 成功，带上会话与轮次 id */
  TURN: "turn",
  /** 工作流阶段进度，不含 Tool 完整结果 */
  STAGE: "stage",
  /** CompleteTurn 之后的业务结论，形状同原来的 JSON 成功体 */
  FINAL: "final",
  /** 未能收成业务结论的传输/内部失败 */
  ERROR: "error",
} as const;

/** SSE 事件名元组，供 `includes` 校验。 */
export const STREAM_EVENTS = [
  STREAM_EVENT.TURN,
  STREAM_EVENT.STAGE,
  STREAM_EVENT.FINAL,
  STREAM_EVENT.ERROR,
] as const;

/** SSE 事件名。 */
export type StreamEventName = (typeof STREAM_EVENTS)[number];

/**
 * 推给前端的阶段。由 turn_events 精简而来，不是 turn_events.kind 的全集。
 * `llm_usage` / `error` 不推；汇总开始也不单独推一条。
 */
export const STREAM_STAGE = {
  /** 意图分类完成 */
  INTENT: "intent",
  /** 任务规划完成 */
  PLAN: "plan",
  /** 一次 Tool 调用结束 */
  TOOL: "tool",
  /** 一个 Agent publish 结束 */
  AGENT: "agent",
} as const;

/** 阶段名元组。 */
export const STREAM_STAGES = [
  STREAM_STAGE.INTENT,
  STREAM_STAGE.PLAN,
  STREAM_STAGE.TOOL,
  STREAM_STAGE.AGENT,
] as const;

/** 阶段名。 */
export type StreamStage = (typeof STREAM_STAGES)[number];

/** SSE 帧字段名与分隔符（前后端编解码共用）。 */
export const SSE_WIRE = {
  EVENT_FIELD: "event",
  DATA_FIELD: "data",
  COMMENT_PREFIX: ":",
  LINE_SEPARATOR: "\n",
  FRAME_SEPARATOR: "\n\n",
  FIELD_VALUE_SEPARATOR: ": ",
} as const;

/** StartTurn 成功。 */
export type RecommendStreamTurnEvent = {
  event: typeof STREAM_EVENT.TURN;
  /** 会话 id，后续提问可带上 */
  conversationId: string;
  /** 本轮 id */
  turnId: string;
};

/** 意图阶段。 */
export type RecommendStreamIntentStage = {
  event: typeof STREAM_EVENT.STAGE;
  stage: typeof STREAM_STAGE.INTENT;
  /** `INTENT_TYPE` 取值，例如 `in_scope` */
  intentType: string;
};

/** 规划阶段。 */
export type RecommendStreamPlanStage = {
  event: typeof STREAM_EVENT.STAGE;
  stage: typeof STREAM_STAGE.PLAN;
  /** 将要执行的 Agent 名 */
  agents: string[];
};

/** Tool 阶段。 */
export type RecommendStreamToolStage = {
  event: typeof STREAM_EVENT.STAGE;
  stage: typeof STREAM_STAGE.TOOL;
  /** 已注册工具名，例如 `movie_search` */
  toolName: string;
  /** 这次调用是否成功 */
  ok: boolean;
};

/** Agent 收口阶段。 */
export type RecommendStreamAgentStage = {
  event: typeof STREAM_EVENT.STAGE;
  stage: typeof STREAM_STAGE.AGENT;
  /** `search` / `relation` */
  actor: string;
  /** publish 是否成功 */
  success: boolean;
};

/** 阶段事件联合。 */
export type RecommendStreamStageEvent =
  | RecommendStreamIntentStage
  | RecommendStreamPlanStage
  | RecommendStreamToolStage
  | RecommendStreamAgentStage;

/**
 * 业务结论。`type` / `data` 与改流式之前的 JSON 成功体相同。
 */
export type RecommendStreamFinalEvent = {
  event: typeof STREAM_EVENT.FINAL;
  conversationId?: string;
  type: RecommendResultType;
  data: AssistantPayload;
};

/** 未能收成 `final`。 */
export type RecommendStreamErrorEvent = {
  event: typeof STREAM_EVENT.ERROR;
  conversationId?: string;
  message: string;
};

/** 开流之后浏览器会收到的事件。 */
export type RecommendStreamEvent =
  | RecommendStreamTurnEvent
  | RecommendStreamStageEvent
  | RecommendStreamFinalEvent
  | RecommendStreamErrorEvent;
