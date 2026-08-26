import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import Drawer from "@mui/material/Drawer";
import { ApiError, isSessionExpiredError, request, streamChat } from "@/api";
import {
  STREAM_EVENT,
  STREAM_STAGE,
  type ChatStreamEvent,
  type ChatStreamStageEvent,
} from "@an-movie/contracts";
import useAuth from "@/store/auth";
import { toast } from "@/store/toast";
import AuthModal from "@/components/AuthModal";
import AppLogo from "@/components/AppLogo";
import ConfigModal from "@/components/ConfigModal";
import ConversationSidebar from "@/components/ConversationSidebar";
import RecommendationPoster from "@/components/RecommendationPoster";
import TopBar from "@/components/TopBar";
import {
  API_PATH,
  conversationDetailPath,
  LAYOUT,
  TEXT,
} from "@/constant";
import styles from "./index.module.less";
import {
  convertConversationToMessages,
  chatMessageMovies,
  chatMessageText,
  getRecommendationGenres,
  renderMessageText,
  toAssistantMessage,
} from "@/utils/chatUtils";
import { resolveActiveConversationTitle } from "@/utils/conversation";
import { getTmdbImage } from "@/utils/tmdb";
import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  RecommendationItem,
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
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streamStage, setStreamStage] =
    useState<ChatStreamStageEvent | null>(null);
  const [error, setError] = useState("");

  const token = useAuth((s) => s.token);
  const userId = useAuth((s) => s.user?.id ?? null);
  const logout = useAuth((s) => s.logout);
  const sendingRef = useRef(false);
  const sessionGen = useRef(0);
  const conversationLoadGen = useRef(0);
  const interactionLocked = loading || detailsLoading;

  const handleSessionExpired = useCallback(() => {
    logout({ silent: true });
    toast.info(TEXT.auth.sessionExpired);
    setShowLoginModal(true);
  }, [logout]);

  const fetchConversations = useCallback(
    async (requestGen = sessionGen.current, options?: { silent?: boolean }) => {
      if (!token) return;

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
    [token, handleSessionExpired],
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

  async function loadConversation(targetId: string) {
    if (!token) {
      setShowLoginModal(true);
      return;
    }
    if (sendingRef.current) {
      toast.info(TEXT.workspace.waitUntilIdle);
      return;
    }
    if (targetId === conversationId && !detailsLoading) {
      setSidebarDrawerOpen(false);
      return;
    }

    const sessionAtStart = sessionGen.current;
    const loadGen = ++conversationLoadGen.current;
    setDetailsLoading(true);
    setError("");

    try {
      const detail = await request<ConversationDetail>({
        method: "GET",
        url: conversationDetailPath(targetId),
      });
      if (loadGen !== conversationLoadGen.current) return;
      if (sessionAtStart !== sessionGen.current) return;
      if (!detail?.conversation_id) {
        toast.error(TEXT.workspace.detailFailed);
        return;
      }
      setSelectedConversation(detail);
      setConversationId(detail.conversation_id);
      setMessages(convertConversationToMessages(detail.messages ?? []));
      setSidebarDrawerOpen(false);
    } catch (err) {
      if (loadGen !== conversationLoadGen.current) return;
      if (sessionAtStart !== sessionGen.current) return;
      if (isSessionExpiredError(err)) {
        handleSessionExpired();
        return;
      }
      toast.error(
        err instanceof ApiError && err.message
          ? err.message
          : TEXT.workspace.detailFailed,
      );
    } finally {
      if (
        loadGen === conversationLoadGen.current &&
        sessionAtStart === sessionGen.current
      ) {
        setDetailsLoading(false);
      }
    }
  }

  function openConfigModal() {
    if (!token) {
      setShowLoginModal(true);
      return;
    }

    setShowConfigModal(true);
    void fetchConversations();
  }

  function startNewConversation() {
    if (sendingRef.current) {
      toast.info(TEXT.workspace.waitUntilIdle);
      return;
    }
    conversationLoadGen.current += 1;
    setConversationId(undefined);
    setMessages([]);
    setSelectedConversation(null);
    setError("");
    setStreamStage(null);
    setDetailsLoading(false);
    setMessage("");
    setFile(null);
    setImageData("");
    setSidebarDrawerOpen(false);
  }

  useEffect(() => {
    const requestGen = ++sessionGen.current;
    conversationLoadGen.current += 1;
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
    setSidebarDrawerOpen(false);
    setLoading(false);
    setStreamStage(null);
    setHistoryLoading(false);
    setDetailsLoading(false);
    if (!token) return;
    void fetchConversations(requestGen);
  }, [userId, token, fetchConversations]);

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${LAYOUT.NARROW_MAX_PX}px)`);
    function closeDrawerOnWideViewport(event: MediaQueryListEvent) {
      if (!event.matches) setSidebarDrawerOpen(false);
    }
    media.addEventListener("change", closeDrawerOnWideViewport);
    return () => media.removeEventListener("change", closeDrawerOnWideViewport);
  }, []);

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
    if (!trimmedMessage || sendingRef.current || detailsLoading) return;
    if (!token) {
      setShowLoginModal(true);
      return;
    }

    const requestGen = sessionGen.current;
    sendingRef.current = true;
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
          applyChatStreamEvent(event, setConversationId, setMessages, setStreamStage);
          if (event.event === STREAM_EVENT.TURN) {
            rememberConversationIfNew(event.conversationId, trimmedMessage);
            void fetchConversations(requestGen, { silent: true });
          }
        },
      );
    } catch (err) {
      if (requestGen !== sessionGen.current) return;
      if (isSessionExpiredError(err)) {
        handleSessionExpired();
        return;
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
        setLoading(false);
        setStreamStage(null);
        setImageData("");
      }
    }
  }

  function renderRecommendationCard(item: RecommendationItem, index: number) {
    const title = item.name || item.title || item.original_title || "未知电影";
    const subtitle =
      item.original_title && item.original_title !== title
        ? item.original_title
        : "";
    const reason = item.reason || item.summary || item.overview || "暂无说明";
    const releaseDate = item.release_date ? item.release_date : "未知日期";
    const rating =
      typeof item.vote_average === "number"
        ? item.vote_average.toFixed(1)
        : "暂无";
    const voteCount =
      typeof item.vote_count === "number" ? `${item.vote_count}` : "0";
    const popularity =
      typeof item.popularity === "number"
        ? `${item.popularity.toFixed(1)}`
        : "暂无";
    const language = item.original_language || "未知";
    const genres = getRecommendationGenres(item);
    const posterUrl = getTmdbImage(item.poster_url || item.poster_path);

    const cardInner = (
      <div className={styles.recommendationCard} key={`${title}-${index}`}>
        <div className={styles.recommendationCardMedia}>
          <RecommendationPoster src={posterUrl} alt={title} />
        </div>
        <div className={styles.recommendationCardBody}>
          <div className={styles.recommendationCardHeader}>
            <div>
              <h4>{title}</h4>
              {subtitle ? (
                <p className={styles.recommendationCardSubtitle}>{subtitle}</p>
              ) : null}
            </div>
            {item.tmdb_url ? (
              <a
                href={item.tmdb_url}
                target="_blank"
                rel="noreferrer"
                className={styles.recommendationCardLink}
              >
                查看详情
              </a>
            ) : null}
          </div>
          <p
            title={reason}
            className={styles.recommendationCardReason}
            data-tooltip={reason}
            aria-label={reason}
          >
            {reason}
          </p>
          <div
            className={styles.recommendationCardMetaRow}
            aria-label="影片信息"
          >
            <span>上映: {releaseDate}</span>
            <span>评分: {rating}</span>
            <span>评分人数: {voteCount}</span>
            <span>热度: {popularity}</span>
            <span>语言: {language}</span>
            {item.adult ? <span>成人内容</span> : null}
            {item.video ? <span>含视频</span> : null}
          </div>
          {genres.length > 0 ? (
            <div
              className={styles.recommendationCardChipRow}
              aria-label="影片类型"
            >
              <span className={styles.recommendationCardChipLabel}>
                类型：
                {genres.map((genre) => (
                  <span key={`${title}-${genre}`}>{genre}</span>
                ))}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    );

    if (item.tmdb_url) {
      return (
        <a
          href={item.tmdb_url}
          target="_blank"
          rel="noreferrer"
          className={styles.recommendationCardLinkWrap}
          key={`${title}-${index}`}
        >
          {cardInner}
        </a>
      );
    }

    return cardInner;
  }

  function renderAssistantContent(item: ChatMessage) {
    const text = chatMessageText(item);
    const movies = chatMessageMovies(item);
    const paragraphs = text
      ? renderMessageText(text).map((line, lineIndex) => (
          <p key={`${item.kind}-${lineIndex}`}>{line}</p>
        ))
      : null;

    if (item.kind !== "recommendation") {
      return paragraphs;
    }

    return (
      <div className={styles.assistantBody}>
        {paragraphs}
        {movies.length > 0 ? (
          <div className={styles.recommendationList}>
            {movies.map((movie, movieIndex) =>
              renderRecommendationCard(movie, movieIndex),
            )}
          </div>
        ) : null}
      </div>
    );
  }

  const activeConversationTitle = resolveActiveConversationTitle({
    conversationId,
    conversations: conversationList,
    selectedTitle: selectedConversation?.title,
    messages,
  });

  const sidebarProps = {
    conversations: conversationList,
    activeConversationId: conversationId,
    listLoading: historyLoading,
    listError,
    interactionLocked,
    isGuest: !token,
    onNewConversation: startNewConversation,
    onSelectConversation: (id: string) => void loadConversation(id),
    onRetryList: () => void fetchConversations(),
    onLogin: () => setShowLoginModal(true),
  };

  const composerDisabled = loading || detailsLoading;

  return (
    <div className={styles.appShell}>
      <TopBar
        onOpenConfig={openConfigModal}
        onOpenSidebar={() => setSidebarDrawerOpen(true)}
        onOpenLogin={() => {
          setShowLoginModal(true);
        }}
        onOpenRegister={() => {
          setShowRegisterModal(true);
        }}
      />

      <ConfigModal
        visible={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        onSelectConversation={(id: string) => void loadConversation(id)}
        conversations={conversationList}
        selectedConversation={selectedConversation}
        loading={historyLoading}
        detailLoading={detailsLoading}
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

      <Drawer
        anchor="left"
        open={sidebarDrawerOpen}
        onClose={() => setSidebarDrawerOpen(false)}
        slotProps={{
          paper: {
            className: styles.drawerPaper,
            style: { width: LAYOUT.SIDEBAR_WIDTH_PX },
          },
        }}
      >
        <ConversationSidebar {...sidebarProps} />
      </Drawer>

      <div className={styles.workspace}>
        <aside className={styles.sidebarSlot}>
          <ConversationSidebar {...sidebarProps} />
        </aside>

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
            </header>
          )}

          {detailsLoading ? (
            <p className={styles.switchingBanner} role="status">
              {TEXT.workspace.switching}
            </p>
          ) : null}

          <div className={styles.messages}>
            {messages.length === 0 ? (
              <div className={styles.emptyState}>
                <AppLogo className={styles.emptyStateIcon} size={44} />
                <h3>从一句简单的话开始</h3>
                <p>比如“想看一部剧情片，时长2小时以内，最好有温情结局”。</p>
              </div>
            ) : (
              <>
                {messages.map((item, index) => {
                  const failed =
                    item.kind === "error" || item.kind === "reject";
                  return (
                    <div
                      key={`${item.role}-${item.kind}-${index}`}
                      className={`${styles.message} ${
                        item.role === "user"
                          ? styles.userMessage
                          : failed
                            ? styles.assistantErrorMessage
                            : styles.assistantMessage
                      }`}
                    >
                      <div className={styles.messageRole}>
                        {item.role === "user"
                          ? TEXT.chat.userRole
                          : failed
                            ? TEXT.chat.assistantErrorRole
                            : TEXT.chat.assistantRole}
                      </div>
                      <div className={styles.messageText}>
                        {item.role === "user"
                          ? renderMessageText(chatMessageText(item)).map(
                              (line, lineIndex) => (
                                <p key={`${item.kind}-${index}-${lineIndex}`}>
                                  {line}
                                </p>
                              ),
                            )
                          : renderAssistantContent(item)}
                      </div>
                    </div>
                  );
                })}
                {loading ? (
                  <div className={`${styles.message} ${styles.assistantMessage}`}>
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
                    className={styles.sendButton}
                    onClick={() => void sendMessage()}
                    disabled={composerDisabled}
                  >
                    {loading ? TEXT.chat.sending : TEXT.chat.send}
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
