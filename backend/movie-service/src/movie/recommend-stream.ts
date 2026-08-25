import {
  RecommendStreamEvent,
  RecommendStreamStageEvent,
  SSE_WIRE,
  STREAM_EVENT,
  STREAM_STAGE,
} from "@an-movie/contracts";
import { asRecord } from "./helpers";
import { TurnEventBody } from "./turn-events";

/**
 * Express 写 SSE 需要的最小表面。不引入 `@types/express`。
 */
export type SseReply = {
  statusCode: number;
  writableEnded?: boolean;
  setHeader(name: string, value: string): void;
  flushHeaders?: () => void;
  write(chunk: string): boolean;
  end(): void;
};

/**
 * 把一帧 SSE 写成文本。
 * @param event 要推给浏览器的事件（JSON 里带 `event` 字段）
 * @returns `event:` + `data:` + 空行
 * @example
 * `{ event: "turn", conversationId: "c1", turnId: "t1" }`
 * → `"event: turn\ndata: {\"event\":\"turn\",\"conversationId\":\"c1\",\"turnId\":\"t1\"}\n\n"`
 */
export function encodeSseFrame(event: RecommendStreamEvent): string {
  const json = JSON.stringify(event);
  return (
    SSE_WIRE.EVENT_FIELD +
    SSE_WIRE.FIELD_VALUE_SEPARATOR +
    event.event +
    SSE_WIRE.LINE_SEPARATOR +
    SSE_WIRE.DATA_FIELD +
    SSE_WIRE.FIELD_VALUE_SEPARATOR +
    json +
    SSE_WIRE.FRAME_SEPARATOR
  );
}

/**
 * 打开 SSE 响应。之后只通过 `emit` / `close` 写，避免头已发出再抛给过滤器。
 * @param res HTTP 响应
 */
export function openRecommendSse(res: SseReply): {
  emit: (event: RecommendStreamEvent) => void;
  close: () => void;
} {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let closed = false;
  const emit = (event: RecommendStreamEvent) => {
    if (closed || res.writableEnded) {
      closed = true;
      return;
    }
    try {
      res.write(encodeSseFrame(event));
    } catch {
      closed = true;
    }
  };
  const close = () => {
    if (closed || res.writableEnded) {
      closed = true;
      return;
    }
    closed = true;
    try {
      res.end();
    } catch {
      /* 客户端已断开 */
    }
  };
  return { emit, close };
}

/**
 * turn_events → 前端 stage。`llm_usage` / `error` 不推。
 * @param body 写入 Postgres 的那条事件
 * @returns 可推的 stage；内部事件返回 null
 * @example
 * `{ kind: "intent", actor: "orchestrator", intent: { type: "in_scope", reason: "电影" } }`
 * → `{ event: "stage", stage: "intent", intentType: "in_scope" }`
 * `{ kind: "llm_usage", actor: "orchestrator", stage: "intent", durationMs: 10, ok: true }`
 * → `null`
 */
export function toStreamStageEvent(
  body: TurnEventBody,
): RecommendStreamStageEvent | null {
  switch (body.kind) {
    case "intent":
      return {
        event: STREAM_EVENT.STAGE,
        stage: STREAM_STAGE.INTENT,
        intentType: body.intent.type,
      };
    case "plan":
      return {
        event: STREAM_EVENT.STAGE,
        stage: STREAM_STAGE.PLAN,
        agents: [...body.agents],
      };
    case "tool_call":
      return {
        event: STREAM_EVENT.STAGE,
        stage: STREAM_STAGE.TOOL,
        toolName: body.tool_name,
        ok: toolOutputOk(body.output),
      };
    case "agent_result":
      return {
        event: STREAM_EVENT.STAGE,
        stage: STREAM_STAGE.AGENT,
        actor: body.actor,
        success: body.success,
      };
    default:
      return null;
  }
}

function toolOutputOk(output: unknown): boolean {
  const rec = asRecord(output);
  if (!rec) return true;
  return rec.success !== false;
}
