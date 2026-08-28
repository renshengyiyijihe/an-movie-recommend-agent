import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import classNames from "classnames";
import Add from "@mui/icons-material/Add";
import { ApiError, isChatTimeoutError, isSessionExpiredError, request, streamChat } from "@/api";
import {
  CANCEL_REASON,
  STREAM_EVENT,
  STREAM_STAGE,
  type ChatStreamEvent,
  type ChatStreamStageEvent,
} from "@an-movie/contracts";
import useAuth from "@/store/auth";
import { toast } from "@/store/toast";
import AuthModal from "@/components/AuthModal";
import AppLogo from "@/components/AppLogo";
import ChatTranscript from "@/components/ChatTranscript";
import ConfigModal from "@/components/ConfigModal";
import HistoryModal from "@/components/HistoryModal";
import TopBar from "@/components/TopBar";
import {
  API_PATH,
  TEXT,
} from "@/constant";
import styles from "./index.module.less";
import {
  convertConversationToMessages,
  toAssistantMessage,
} from "@/utils/chatUtils";
import { resolveActiveConversationTitle } from "@/utils/conversation";
import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
} from "@/types";

const quickPrompts = [
  "想看一部科幻大片，时长2小时以内",
  "想要轻松爱情片，适合晚上放松",
  "推荐几部张力强、节奏快的动作片",
];

export default function HomePage() {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageData, setImageData] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(
    undefined,
  );
  const [conversationList, setConversationList] = useState<
    ConversationSummary[]
  >([]);
  const [selectedConversation, setSelectedConversation] =
    useState<ConversationDetail | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [streamStage, setStreamStage] =
    useState<ChatStreamStageEvent | null>(null);
  const [error, setError] = useState("");

  const token = useAuth((s) => s.token);
  const userId = useAuth((s) => s.user?.id ?? null);
  const logout = useAuth((s) => s.logout);
  const sendingRef = useRef(false);
  const stoppingRef = useRef(false);
  const turnIdRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);
  const sessionGen = useRef(0);

  const handleSessionExpired = useCallback(() => {
    logout({ silent: true });
    toast.info(TEXT.auth.sessionExpired);
    setShowLoginModal(true);
  }, [logout]);

  const fetchConversations = useCallback(
    async (requestGen = sessionGen.current, options?: { silent?: boolean }) => {
      if (!useAuth.getState().token) return;

      if (!options?.silent) {
        setHistoryLoading(true);
        setListError("");
      }
      try {
        const result = await request<{ conversations?: ConversationSummary[] }>({
          method: "GET",
          url: API_PATH.conversations,
        });
        if (requestGen !== sessionGen.current) return;
        setConversationList(
          Array.isArray(result.conversations) ? result.conversations : [],
        );
        setListError("");
      } catch (err) {
        if (requestGen !== sessionGen.current) return;
        if (isSessionExpiredError(err)) {
          handleSessionExpired();
          return;
        }
        setListError(
          err instanceof ApiError && err.message
            ? err.message
            : TEXT.workspace.loadFailed,
        );
      } finally {
        if (requestGen === sessionGen.current && !options?.silent) {
          setHistoryLoading(false);
        }
      }
    },
    [handleSessionExpired],
  );

  function rememberConversationIfNew(id: string, title: string) {
    setConversationList((prev) => {
      if (prev.some((item) => item.conversation_id === id)) return prev;
      return [
        {
          conversation_id: id,
          title,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ];
    });
  }

  function activateConversation(detail: ConversationDetail) {
    if (sendingRef.current) return;
    setSelectedConversation(detail);
    setConversationId(detail.conversation_id);
    setMessages(convertConversationToMessages(detail.messages ?? []));
    setError("");
    setStreamStage(null);
  }

  function openHistoryModal() {
    if (!token) {
      setShowLoginModal(true);
      return;
    }
    setShowHistoryModal(true);
    void fetchConversations(sessionGen.current, {
      silent: conversationList.length > 0,
    });
  }

  function openConfigModal() {
    if (!token) {
      setShowLoginModal(true);
      return;
    }

    setShowConfigModal(true);
  }

  function startNewConversation() {
    if (sendingRef.current) {
      toast.info(TEXT.workspace.waitUntilIdle);
      return;
    }
    setShowHistoryModal(false);
    setConversationId(undefined);
    setMessages([]);
    setSelectedConversation(null);
    setError("");
    setStreamStage(null);
    setMessage("");
    setFile(null);
    setImageData("");
  }

  useEffect(() => {
    sessionGen.current += 1;
    sendingRef.current = false;
    setConversationId(undefined);
    setMessages([]);
    setSelectedConversation(null);
    setConversationList([]);
    setListError("");
    setError("");
    setMessage("");
    setFile(null);
    setImageData("");
    setShowConfigModal(false);
    setShowHistoryModal(false);
    setLoading(false);
    setStreamStage(null);
    setHistoryLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!file) {
      setImagePreview("");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setImagePreview(objectUrl);

    const reader = new FileReader();
    reader.onload = () => setImageData(reader.result as string);
    reader.readAsDataURL(file);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  async function sendMessage() {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || sendingRef.current) return;
    if (!token) {
      setShowLoginModal(true);
      return;
    }

    const requestGen = sessionGen.current;
    sendingRef.current = true;
    stoppingRef.current = false;
    stopRequestedRef.current = false;
    turnIdRef.current = null;
    setStopping(false);
    setLoading(true);
    setStreamStage(null);
    setError("");

    const userMessage: ChatMessage = {
      role: "user",
      kind: "user_query",
      payload: { kind: "user_query", text: trimmedMessage },
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setFile(null);

    try {
      await streamChat(
        {
          message: trimmedMessage,
          imageData,
          conversationId,
        },
        (event) => {
          if (requestGen !== sessionGen.current) return;
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
          applyChatStreamEvent(event, setConversationId, setMessages, setStreamStage);
        },
      );
    } catch (err) {
      if (requestGen !== sessionGen.current) return;
      if (isSessionExpiredError(err)) {
        handleSessionExpired();
        return;
      }
      if (isChatTimeoutError(err) && turnIdRef.current) {
        try {
          await requestCancelTurn(turnIdRef.current, CANCEL_REASON.TIMEOUT);
        } catch {
          /* 超时气泡照样展示；收口失败则轮次仍可能 running */
        }
      }
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : TEXT.chat.requestFailed,
      );
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          kind: "error",
          payload: {
            kind: "error",
            message:
              err instanceof ApiError && err.message
                ? err.message
                : TEXT.chat.requestFailedBubble,
          },
        },
      ]);
    } finally {
      if (requestGen === sessionGen.current) {
        sendingRef.current = false;
        stoppingRef.current = false;
        stopRequestedRef.current = false;
        turnIdRef.current = null;
        setStopping(false);
        setLoading(false);
        setStreamStage(null);
        setImageData("");
      }
    }
  }

  async function requestCancelTurn(
    turnId: string,
    reason: typeof CANCEL_REASON.USER | typeof CANCEL_REASON.TIMEOUT,
  ) {
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
      handleSessionExpired();
      return;
    }
    toast.error(TEXT.chat.cancelFailed);
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

  const activeConversationTitle = resolveActiveConversationTitle({
    conversationId,
    conversations: conversationList,
    selectedTitle: selectedConversation?.title,
    messages,
  });

  const composerDisabled = loading;
  const sendOrStopDisabled = stopping;

  return (
    <div className={styles.appShell}>
      <TopBar
        onOpenHistory={openHistoryModal}
        onOpenConfig={openConfigModal}
        onOpenLogin={() => {
          setShowLoginModal(true);
        }}
        onOpenRegister={() => {
          setShowRegisterModal(true);
        }}
      />

      <HistoryModal
        visible={showHistoryModal}
        userId={userId}
        conversations={conversationList}
        activeConversationId={conversationId}
        activeMessages={messages}
        listLoading={historyLoading}
        listError={listError}
        sending={loading}
        onClose={() => setShowHistoryModal(false)}
        onRetryList={() => void fetchConversations()}
        onActivate={activateConversation}
        onSessionExpired={handleSessionExpired}
      />
      <ConfigModal
        visible={showConfigModal}
        onClose={() => setShowConfigModal(false)}
      />
      <AuthModal
        visible={showLoginModal}
        mode="login"
        initialEmail={loginEmail}
        onClose={() => {
          setShowLoginModal(false);
        }}
        onSwitchMode={() => {
          setShowLoginModal(false);
          setShowRegisterModal(true);
        }}
      />
      <AuthModal
        visible={showRegisterModal}
        mode="register"
        onClose={() => setShowRegisterModal(false)}
        onSwitchMode={() => {
          setShowRegisterModal(false);
          setShowLoginModal(true);
        }}
        onRegistered={(email) => {
          setShowRegisterModal(false);
          setLoginEmail(email);
          setShowLoginModal(true);
        }}
      />

      <div className={styles.workspace}>
        <section className={styles.chatPanel}>
          {messages.length === 0 ? (
            <header className={styles.heroHeader}>
              <div className={styles.titleRow}>
                <div>
                  <h1>为你挑选你喜欢的电影</h1>
                  <p>说出你的口味、风格和观影需求，马上帮你推荐合适影片。</p>
                </div>
              </div>
              <div className={styles.quickPrompts}>
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className={styles.chipButton}
                    onClick={() => setMessage(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </header>
          ) : (
            <header className={styles.chatHeader}>
              <h2>{activeConversationTitle}</h2>
              {token ? (
                <button
                  type="button"
                  className={styles.newConversationButton}
                  onClick={startNewConversation}
                  disabled={loading}
                  aria-label={TEXT.workspace.newConversationAria}
                >
                  <Add className={styles.actionIcon} fontSize="small" />
                  {TEXT.workspace.newConversation}
                </button>
              ) : null}
            </header>
          )}

          <div className={styles.messages}>
            {messages.length === 0 ? (
              <div className={styles.emptyState}>
                <AppLogo className={styles.emptyStateIcon} size={44} />
                <h3>从一句简单的话开始</h3>
                <p>比如“想看一部剧情片，时长2小时以内，最好有温情结局”。</p>
              </div>
            ) : (
              <>
                <ChatTranscript messages={messages} />
                {loading ? (
                  <div
                    className={classNames(
                      styles.message,
                      styles.assistantMessage,
                    )}
                  >
                    <div className={styles.messageRole}>
                      {TEXT.chat.assistantRole}
                    </div>
                    <div className={styles.messageText}>
                      <div
                        className={styles.loadingStatus}
                        aria-label={chatStageLabel(streamStage)}
                      >
                        <div className={styles.loadingDots} aria-hidden="true" />
                        <span className={styles.loadingLabel}>
                          {chatStageLabel(streamStage)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className={styles.inputArea}>
            <div className={styles.inputCard}>
              <textarea
                value={message}
                disabled={composerDisabled}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="输入你的观影偏好、类型或心情，比如：想看科幻片，2小时以内，有精彩视觉效果。"
              />
              <div className={styles.inputActions}>
                <label className={styles.fileInput}>
                  <span>📷 上传图片（可选）</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    disabled={composerDisabled}
                    onChange={(event) =>
                      setFile(event.target.files?.[0] ?? null)
                    }
                  />
                </label>
                <div className={styles.actionButtons}>
                  <button
                    type="button"
                    className={classNames(styles.sendButton, {
                      [styles.stopButton]: loading,
                    })}
                    onClick={() => {
                      if (loading) void stopGenerating();
                      else void sendMessage();
                    }}
                    disabled={sendOrStopDisabled}
                  >
                    {stopping
                      ? TEXT.chat.stopping
                      : loading
                        ? TEXT.chat.stop
                        : TEXT.chat.send}
                  </button>
                </div>
              </div>
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="图片预览"
                  className={styles.previewImage}
                />
              ) : null}
            </div>
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function applyChatStreamEvent(
  event: ChatStreamEvent,
  setConversationId: Dispatch<SetStateAction<string | undefined>>,
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  setStreamStage: Dispatch<SetStateAction<ChatStreamStageEvent | null>>,
) {
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
          kind: "error",
          payload: { kind: "error", message: event.message },
        },
      ]);
      if (event.conversationId) setConversationId(event.conversationId);
      return;
    default:
      return;
  }
}

function chatStageLabel(stage: ChatStreamStageEvent | null): string {
  if (!stage) return TEXT.chat.stagePending;
  if (stage.stage === STREAM_STAGE.TOOL && !stage.ok) {
    return TEXT.chat.stageToolFailed;
  }
  return TEXT.chat.stages[stage.stage];
}
