import {
  STREAM_EVENT,
  STREAM_STAGE,
  TURN_STATUS,
  type ChatStreamEvent,
  type ChatStreamStageEvent,
} from "@an-movie/contracts";
import { TEXT } from "@/constant";
import type { ChatMessage } from "@/types";
import { toAssistantMessage } from "@/utils/chatUtils";
import type { Dispatch, SetStateAction } from "react";

/** 把 SSE 事件写进主聊天 state 时用的 setter。 */
export interface ApplyChatStreamSetters {
  /** 会话 id 存在地址栏，这里是一次 navigate，不是 setState。 */
  setConversationId: (conversationId: string) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setStreamStage: Dispatch<SetStateAction<ChatStreamStageEvent | null>>;
}

/**
 * 把一条已解码的 chat SSE 写进主聊天 state。
 * `stage` 只改加载文案；`final` / `error` 才追加气泡。
 *
 * @param event `streamChat` 回调里的事件
 * @param setters 当前这一轮的 React setter
 * @example
 * applyChatStreamEvent(
 *   { event: STREAM_EVENT.TURN, conversationId: "c1", turnId: "t1" },
 *   { setConversationId, setMessages, setStreamStage },
 * )
 * // conversationId 变成 "c1"；messages / streamStage 不动
 */
export function applyChatStreamEvent(
  event: ChatStreamEvent,
  setters: ApplyChatStreamSetters,
) {
  const { setConversationId, setMessages, setStreamStage } = setters;

  switch (event.event) {
    case STREAM_EVENT.TURN:
      setConversationId(event.conversationId);
      return;
    case STREAM_EVENT.STAGE:
      setStreamStage(event);
      return;
    case STREAM_EVENT.FINAL:
      setMessages((prev) => [...prev, toAssistantMessage(event)]);
      if (event.conversationId) setConversationId(event.conversationId);
      return;
    case STREAM_EVENT.ERROR:
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          kind: TURN_STATUS.ERROR,
          payload: { kind: TURN_STATUS.ERROR, message: event.message },
        },
      ]);
      if (event.conversationId) setConversationId(event.conversationId);
      return;
    default:
      return;
  }
}

/**
 * 加载气泡上的阶段文案。还没收到 stage 时用兜底句。
 *
 * @param stage 最近一条 `event: stage`；没有则为 null
 * @returns `TEXT.chat.stages` 或失败 / 等待兜底
 * @example
 * chatStageLabel(null) // TEXT.chat.stagePending
 * chatStageLabel({ event: "stage", stage: STREAM_STAGE.TOOL, ok: false })
 * // TEXT.chat.stageToolFailed
 */
export function chatStageLabel(stage: ChatStreamStageEvent | null): string {
  if (!stage) return TEXT.chat.stagePending;
  if (stage.stage === STREAM_STAGE.TOOL && !stage.ok) {
    return TEXT.chat.stageToolFailed;
  }
  return TEXT.chat.stages[stage.stage];
}
