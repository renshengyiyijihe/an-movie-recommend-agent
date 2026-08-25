import {
  RECOMMEND_RESULT_TYPES,
  RecommendStreamEvent,
  RecommendStreamStageEvent,
  SSE_WIRE,
  STREAM_EVENT,
  STREAM_EVENTS,
  STREAM_STAGE,
  STREAM_STAGES,
  type AssistantPayload,
  type RecommendResultType,
  type StreamEventName,
  type StreamStage,
} from "@an-movie/contracts";

/**
 * 从缓冲里切出完整 SSE 帧，半帧留在 rest。
 * @param buffer 已收到的文本（调用方负责把 `\r\n` 收成 `\n`）
 * @returns 完整帧列表 + 尚未结束的尾巴
 * @example
 * `"event: turn\ndata: {\"event\":\"turn\"}\n\nevent: sta"`
 * → 一帧完整 `"event: turn\ndata: {\"event\":\"turn\"}"`，rest 为 `"event: sta"`
 */
export function consumeSseFrames(buffer: string): {
  frames: string[];
  rest: string;
} {
  const parts = buffer.split(SSE_WIRE.FRAME_SEPARATOR);
  const rest = parts.pop() ?? "";
  return {
    frames: parts.filter((part) => part.trim() !== ""),
    rest,
  };
}

/**
 * 解析一帧 SSE。JSON 不合格或缺字段则丢弃，不抛。
 * @param frame 不含结尾空行的一帧
 * @returns 推荐流事件；无法识别则为 null
 * @example
 * `"event: turn\ndata: {\"event\":\"turn\",\"conversationId\":\"c1\",\"turnId\":\"t1\"}"`
 * → `{ event: "turn", conversationId: "c1", turnId: "t1" }`
 */
export function parseRecommendSseFrame(
  frame: string,
): RecommendStreamEvent | null {
  const parsed = readSseFields(frame);
  if (!parsed.data) return null;

  let record: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(parsed.data);
    if (!isRecord(value)) return null;
    record = value;
  } catch {
    return null;
  }

  const eventName = readEventName(record.event) ?? readEventName(parsed.event);
  if (!eventName) return null;

  return toStreamEvent(eventName, record);
}

function readSseFields(frame: string): { event?: string; data?: string } {
  let event: string | undefined;
  const dataLines: string[] = [];

  for (const rawLine of frame.split(SSE_WIRE.LINE_SEPARATOR)) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line || line.startsWith(SSE_WIRE.COMMENT_PREFIX)) continue;
    const idx = line.indexOf(":");
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? "" : line.slice(idx + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === SSE_WIRE.EVENT_FIELD) event = value;
    else if (field === SSE_WIRE.DATA_FIELD) dataLines.push(value);
  }

  return {
    event,
    data: dataLines.length > 0 ? dataLines.join(SSE_WIRE.LINE_SEPARATOR) : undefined,
  };
}

function toStreamEvent(
  eventName: StreamEventName,
  record: Record<string, unknown>,
): RecommendStreamEvent | null {
  switch (eventName) {
    case STREAM_EVENT.TURN: {
      if (
        typeof record.conversationId !== "string" ||
        typeof record.turnId !== "string"
      ) {
        return null;
      }
      return {
        event: STREAM_EVENT.TURN,
        conversationId: record.conversationId,
        turnId: record.turnId,
      };
    }
    case STREAM_EVENT.STAGE:
      return toStageEvent(record);
    case STREAM_EVENT.FINAL: {
      if (!isRecommendResultType(record.type) || !isRecord(record.data)) {
        return null;
      }
      return {
        event: STREAM_EVENT.FINAL,
        conversationId: optionalString(record.conversationId),
        type: record.type,
        data: record.data as AssistantPayload,
      };
    }
    case STREAM_EVENT.ERROR: {
      if (typeof record.message !== "string" || !record.message.trim()) {
        return null;
      }
      return {
        event: STREAM_EVENT.ERROR,
        conversationId: optionalString(record.conversationId),
        message: record.message,
      };
    }
    default:
      return null;
  }
}

function toStageEvent(
  record: Record<string, unknown>,
): RecommendStreamStageEvent | null {
  if (!isStreamStage(record.stage)) return null;
  const stage = record.stage;

  switch (stage) {
    case STREAM_STAGE.INTENT: {
      if (typeof record.intentType !== "string") return null;
      return {
        event: STREAM_EVENT.STAGE,
        stage,
        intentType: record.intentType,
      };
    }
    case STREAM_STAGE.PLAN: {
      if (!isStringArray(record.agents)) return null;
      return {
        event: STREAM_EVENT.STAGE,
        stage,
        agents: record.agents,
      };
    }
    case STREAM_STAGE.TOOL: {
      if (typeof record.toolName !== "string" || typeof record.ok !== "boolean") {
        return null;
      }
      return {
        event: STREAM_EVENT.STAGE,
        stage,
        toolName: record.toolName,
        ok: record.ok,
      };
    }
    case STREAM_STAGE.AGENT: {
      if (
        typeof record.actor !== "string" ||
        typeof record.success !== "boolean"
      ) {
        return null;
      }
      return {
        event: STREAM_EVENT.STAGE,
        stage,
        actor: record.actor,
        success: record.success,
      };
    }
    default:
      return null;
  }
}

function readEventName(value: unknown): StreamEventName | undefined {
  if (typeof value !== "string") return undefined;
  return (STREAM_EVENTS as readonly string[]).includes(value)
    ? (value as StreamEventName)
    : undefined;
}

function isStreamStage(value: unknown): value is StreamStage {
  return (
    typeof value === "string" &&
    (STREAM_STAGES as readonly string[]).includes(value)
  );
}

function isRecommendResultType(value: unknown): value is RecommendResultType {
  return (
    typeof value === "string" &&
    (RECOMMEND_RESULT_TYPES as readonly string[]).includes(value)
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** 响应 Content-Type 是否为 SSE（允许带 charset）。 */
export function isEventStreamContentType(contentType: string | null): boolean {
  return (contentType ?? "").toLowerCase().includes("text/event-stream");
}
