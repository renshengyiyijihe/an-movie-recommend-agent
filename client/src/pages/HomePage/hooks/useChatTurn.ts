import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ApiError, isChatTimeoutError, isSessionExpiredError, request, streamChat } from "@/api";
import {
  CANCEL_REASON,
  STREAM_EVENT,
  TURN_STATUS,
  type CancelReason,
  type ChatStreamStageEvent,
} from "@an-movie/contracts";
import { API_PATH, TEXT } from "@/constant";
import useAuth from "@/store/auth";
import { toast } from "@/store/toast";
import type { ChatMessage } from "@/types";
import { applyChatStreamEvent } from "../utils/apply-chat-stream";

interface ChatTurnOptions {
  getSessionGen: () => number;
  setConversationId: Dispatch<SetStateAction<string | undefined>>;
  rememberConversationIfNew: (id: string, title: string) => void;
  onSessionExpired: () => void;
  onNeedLogin: () => void;
  pinMessagesToBottom: () => void;
  /** 本轮真正开始后清输入草稿和 File；`imageData` 仍留给这次请求。 */
  onStarted: () => void;
  /** `finally` 且仍是当前世代时清掉 Data URL。 */
  onSettled: () => void;
}

/**
 * 主聊天这一轮：气泡、SSE、停止。不持有会话列表。
 * 换号只清自己的字段，不递增 `sessionGen`。
 */
export function useChatTurn(options: ChatTurnOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [streamStage, setStreamStage] =
    useState<ChatStreamStageEvent | null>(null);

  const token = useAuth((s) => s.token);
  const userId = useAuth((s) => s.user?.id ?? null);
  const sendingRef = useRef(false);
  const stoppingRef = useRef(false);
  const turnIdRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);

  function isSending() {
    return sendingRef.current;
  }

  function replaceMessages(next: ChatMessage[]) {
    setMessages(next);
    setStreamStage(null);
  }

  function resetForNewConversation() {
    setMessages([]);
    setStreamStage(null);
  }

  async function requestCancelTurn(turnId: string, reason: CancelReason) {
    await request({
      method: "POST",
      url: API_PATH.chatCancel,
      data: { turnId, reason },
    });
  }

  function handleCancelFailure(err: unknown) {
    stoppingRef.current = false;
    setStopping(false);
    if (isSessionExpiredError(err)) {
      optionsRef.current.onSessionExpired();
      return;
    }
    toast.error(TEXT.chat.cancelFailed);
  }

  async function send(input: {
    text: string;
    imageData: string;
    conversationId: string | undefined;
  }) {
    const trimmedMessage = input.text.trim();
    if (!trimmedMessage || sendingRef.current) return;
    if (!token) {
      optionsRef.current.onNeedLogin();
      return;
    }

    const { getSessionGen, setConversationId, rememberConversationIfNew } =
      optionsRef.current;
    const requestGen = getSessionGen();
    sendingRef.current = true;
    stoppingRef.current = false;
    stopRequestedRef.current = false;
    turnIdRef.current = null;
    setStopping(false);
    setLoading(true);
    setStreamStage(null);
    optionsRef.current.pinMessagesToBottom();
    optionsRef.current.onStarted();

    const userMessage: ChatMessage = {
      role: "user",
      kind: "user_query",
      payload: { kind: "user_query", text: trimmedMessage },
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      await streamChat(
        {
          message: trimmedMessage,
          imageData: input.imageData,
          conversationId: input.conversationId,
        },
        (event) => {
          if (requestGen !== optionsRef.current.getSessionGen()) return;
          if (event.event === STREAM_EVENT.TURN) {
            turnIdRef.current = event.turnId;
            rememberConversationIfNew(event.conversationId, trimmedMessage);
            if (stopRequestedRef.current) {
              void requestCancelTurn(event.turnId, CANCEL_REASON.USER).catch(
                (cancelError: unknown) => {
                  handleCancelFailure(cancelError);
                },
              );
            }
          }
          applyChatStreamEvent(event, {
            setConversationId,
            setMessages,
            setStreamStage,
          });
        },
      );
    } catch (err) {
      if (requestGen !== optionsRef.current.getSessionGen()) return;
      if (isSessionExpiredError(err)) {
        optionsRef.current.onSessionExpired();
        return;
      }
      if (isChatTimeoutError(err) && turnIdRef.current) {
        try {
          await requestCancelTurn(turnIdRef.current, CANCEL_REASON.TIMEOUT);
        } catch {
          /* 超时气泡照样展示；收口失败则轮次仍可能 running */
        }
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          kind: TURN_STATUS.ERROR,
          payload: {
            kind: TURN_STATUS.ERROR,
            message:
              err instanceof ApiError && err.message
                ? err.message
                : TEXT.chat.requestFailedBubble,
          },
        },
      ]);
    } finally {
      if (requestGen === optionsRef.current.getSessionGen()) {
        sendingRef.current = false;
        stoppingRef.current = false;
        stopRequestedRef.current = false;
        turnIdRef.current = null;
        setStopping(false);
        setLoading(false);
        setStreamStage(null);
        optionsRef.current.onSettled();
      }
    }
  }

  async function stopGenerating() {
    if (!sendingRef.current || stoppingRef.current) return;
    stoppingRef.current = true;
    setStopping(true);
    stopRequestedRef.current = true;
    const turnId = turnIdRef.current;
    if (!turnId) return;
    try {
      await requestCancelTurn(turnId, CANCEL_REASON.USER);
    } catch (err) {
      handleCancelFailure(err);
    }
  }

  useEffect(() => {
    sendingRef.current = false;
    stoppingRef.current = false;
    stopRequestedRef.current = false;
    turnIdRef.current = null;
    setMessages([]);
    setLoading(false);
    setStopping(false);
    setStreamStage(null);
  }, [userId]);

  return {
    messages,
    loading,
    stopping,
    streamStage,
    isSending,
    send,
    stopGenerating,
    replaceMessages,
    resetForNewConversation,
  };
}
