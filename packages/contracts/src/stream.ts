/**
 * `POST /movie/chat` 的 SSE 契约。
 * 鉴权 / DTO 失败仍走 JSON 错误体；开流之后只推这些事件。
 */
import type { ChatTurnResult } from "./chat";
import { constValues, pickKeys } from "./const-map";

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

/** SSE 事件名列表，供 `includes` 校验。 */
export const STREAM_EVENTS = constValues(STREAM_EVENT);

/** SSE 事件名。 */
export type StreamEventName = (typeof STREAM_EVENTS)[number];

/**
 * `turn_events.body.kind` 全量。业务代码写事件只引用这里，不要再写字面量。
 * 气泡 payload 的 `kind`（`user_query` / `recommendation` 等）是另一套，不要混用。
 */
export const TURN_EVENT_KIND = {
  /** 意图分类完成 */
  INTENT: "intent",
  /** 任务规划完成 */
  PLAN: "plan",
  /** 一次 Tool 调用结束 */
  TOOL_CALL: "tool_call",
  /** 一个 Agent publish 结束 */
  AGENT_RESULT: "agent_result",
  /** 一次 LLM 调用的用量；只写库 */
  LLM_USAGE: "llm_usage",
  /** 跨会话记忆召回；只写库 */
  MEMORY: "memory",
  /** 工作流内部失败；只写库，不是气泡 `kind` */
  ERROR: "error",
} as const;

/** `turn_events.body.kind` 列表，供 `includes` 校验。 */
export const TURN_EVENT_KINDS = constValues(TURN_EVENT_KIND);

/** `turn_events.body.kind`。 */
export type TurnEventKind = (typeof TURN_EVENT_KINDS)[number];

/**
 * 推给前端的阶段。从 {@link TURN_EVENT_KIND} {@link pickKeys} 出来，值不另写。
 * 新增 kind 默认不推；要推再把 key 加进列表。
 */
export const STREAM_STAGE = pickKeys(TURN_EVENT_KIND, [
  "INTENT",
  "PLAN",
  "TOOL_CALL",
  "AGENT_RESULT",
]);

/** 阶段名列表。 */
export const STREAM_STAGES = constValues(STREAM_STAGE);

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
export type ChatStreamTurnEvent = {
  event: typeof STREAM_EVENT.TURN;
  /** 会话 id，后续提问可带上 */
  conversationId: string;
  /** 本轮 id */
  turnId: string;
};

/** 意图阶段。 */
export type ChatStreamIntentStage = {
  event: typeof STREAM_EVENT.STAGE;
  stage: typeof STREAM_STAGE.INTENT;
  /** `INTENT_TYPE` 取值，例如 `in_scope` */
  intentType: string;
};

/** 规划阶段。 */
export type ChatStreamPlanStage = {
  event: typeof STREAM_EVENT.STAGE;
  stage: typeof STREAM_STAGE.PLAN;
  /** 将要执行的 Agent 名 */
  agents: string[];
};

/** Tool 阶段。 */
export type ChatStreamToolStage = {
  event: typeof STREAM_EVENT.STAGE;
  stage: typeof STREAM_STAGE.TOOL_CALL;
  /** 已注册工具名，例如 `movie_search` */
  toolName: string;
  /** 这次调用是否成功 */
  ok: boolean;
};

/** Agent 收口阶段。 */
export type ChatStreamAgentStage = {
  event: typeof STREAM_EVENT.STAGE;
  stage: typeof STREAM_STAGE.AGENT_RESULT;
  /** `search` / `relation` */
  actor: string;
  /** publish 是否成功 */
  success: boolean;
};

/** 阶段事件联合。 */
export type ChatStreamStageEvent =
  | ChatStreamIntentStage
  | ChatStreamPlanStage
  | ChatStreamToolStage
  | ChatStreamAgentStage;

/**
 * 业务结论。`type` / `data` 与 {@link ChatTurnResult} 同一份，只多 `event`。
 */
export type ChatStreamFinalEvent = {
  event: typeof STREAM_EVENT.FINAL;
} & ChatTurnResult;

/** 未能收成 `final`。 */
export type ChatStreamErrorEvent = {
  event: typeof STREAM_EVENT.ERROR;
  conversationId?: string;
  message: string;
};

/** 开流之后浏览器会收到的事件。 */
export type ChatStreamEvent =
  | ChatStreamTurnEvent
  | ChatStreamStageEvent
  | ChatStreamFinalEvent
  | ChatStreamErrorEvent;
