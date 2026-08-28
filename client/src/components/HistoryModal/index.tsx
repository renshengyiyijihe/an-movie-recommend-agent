import { useEffect, useRef, useState } from "react";
import classNames from "classnames";
import Modal from "@mui/material/Modal";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ArrowBack from "@mui/icons-material/ArrowBack";
import { ApiError, isSessionExpiredError, request } from "@/api";
import ChatTranscript from "@/components/ChatTranscript";
import { conversationDetailPath, LAYOUT, TEXT } from "@/constant";
import type { ChatMessage, ConversationDetail, ConversationSummary } from "@/types";
import { convertConversationToMessages } from "@/utils/chatUtils";
import {
  conversationDisplayTitle,
  formatConversationTimestamp,
} from "@/utils/conversation";
import styles from "./index.module.less";

interface Props {
  visible: boolean;
  /** 账号切换时清掉详情缓存，避免串到下一个用户。 */
  userId: string | null;
  conversations: ConversationSummary[];
  activeConversationId?: string;
  /** 当前主聊天气泡。预览正在进行的会话时用这份，不额外 GET。 */
  activeMessages: ChatMessage[];
  listLoading: boolean;
  listError: string;
  /** 正在生成时点选只填右栏，不切换主聊天。 */
  sending: boolean;
  onClose: () => void;
  onRetryList: () => void;
  onActivate: (detail: ConversationDetail) => void;
  onSessionExpired: () => void;
}

const NARROW_MQ = `(max-width: ${LAYOUT.NARROW_MAX_PX}px)`;

export default function HistoryModal({
  visible,
  userId,
  conversations,
  activeConversationId,
  activeMessages,
  listLoading,
  listError,
  sending,
  onClose,
  onRetryList,
  onActivate,
  onSessionExpired,
}: Props) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewDetail, setPreviewDetail] = useState<ConversationDetail | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(NARROW_MQ).matches,
  );
  const loadGen = useRef(0);
  const detailCache = useRef(new Map<string, ConversationDetail>());

  useEffect(() => {
    const media = window.matchMedia(NARROW_MQ);
    function onViewportChange(event: MediaQueryListEvent) {
      setIsNarrow(event.matches);
    }
    media.addEventListener("change", onViewportChange);
    return () => media.removeEventListener("change", onViewportChange);
  }, []);

  useEffect(() => {
    if (visible) return;
    loadGen.current += 1;
    setPreviewId(null);
    setPreviewDetail(null);
    setPreviewLoading(false);
    setPreviewError("");
  }, [visible]);

  useEffect(() => {
    detailCache.current.clear();
    loadGen.current += 1;
    setPreviewId(null);
    setPreviewDetail(null);
    setPreviewLoading(false);
    setPreviewError("");
  }, [userId]);

  const showInitialLoading = listLoading && conversations.length === 0;
  const highlightedId = previewId;
  const previewingLive = Boolean(
    previewId && previewId === activeConversationId,
  );
  const previewMessages = previewingLive
    ? activeMessages
    : convertConversationToMessages(previewDetail?.messages ?? []);
  const previewTitle = previewId
    ? conversationDisplayTitle(
        conversations.find((item) => item.conversation_id === previewId) ??
          (previewDetail?.conversation_id === previewId
            ? previewDetail
            : {
                conversation_id: previewId,
                title: null,
              }),
      )
    : "";
  const showDetailPane = Boolean(previewId);
  const showListPane = !isNarrow || !showDetailPane;

  async function selectConversation(targetId: string, bypassCache = false) {
    const gen = ++loadGen.current;
    setPreviewId(targetId);
    setPreviewError("");

    if (targetId === activeConversationId) {
      setPreviewDetail(null);
      setPreviewLoading(false);
      return;
    }

    if (bypassCache) detailCache.current.delete(targetId);
    const cached = bypassCache ? undefined : detailCache.current.get(targetId);
    if (cached) {
      setPreviewDetail(cached);
      setPreviewLoading(false);
      if (!sending) onActivate(cached);
      return;
    }

    setPreviewLoading(true);
    setPreviewDetail(null);
    try {
      const detail = await request<ConversationDetail>({
        method: "GET",
        url: conversationDetailPath(targetId),
      });
      if (gen !== loadGen.current) return;
      if (!detail?.conversation_id) {
        setPreviewError(TEXT.workspace.detailFailed);
        return;
      }
      detailCache.current.set(targetId, detail);
      setPreviewDetail(detail);
      if (!sending) onActivate(detail);
    } catch (err) {
      if (gen !== loadGen.current) return;
      if (isSessionExpiredError(err)) {
        onSessionExpired();
        return;
      }
      setPreviewError(
        err instanceof ApiError && err.message
          ? err.message
          : TEXT.workspace.detailFailed,
      );
    } finally {
      if (gen === loadGen.current) setPreviewLoading(false);
    }
  }

  function clearPreview() {
    loadGen.current += 1;
    setPreviewId(null);
    setPreviewDetail(null);
    setPreviewLoading(false);
    setPreviewError("");
  }

  return (
    <Modal
      open={visible}
      onClose={onClose}
      aria-labelledby="history-modal-title"
    >
      <div className={styles.overlay} role="dialog" aria-modal="true">
        <div className={styles.dialog}>
          <div className={styles.header}>
            <h3 id="history-modal-title" className={styles.title}>
              {TEXT.workspace.historyTitle}
            </h3>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label={TEXT.workspace.closeHistory}
            >
              ×
            </button>
          </div>

          <div className={styles.body}>
            {showListPane ? (
              <div className={styles.listPane}>
                {listError ? (
                  <div className={styles.errorBanner} role="alert">
                    <p>{listError}</p>
                    <button
                      type="button"
                      className={styles.retryButton}
                      onClick={onRetryList}
                    >
                      {TEXT.workspace.retry}
                    </button>
                  </div>
                ) : null}

                {showInitialLoading ? (
                  <p className={styles.hint}>{TEXT.workspace.loading}</p>
                ) : conversations.length === 0 ? (
                  listError ? null : (
                    <p className={styles.hint}>{TEXT.workspace.empty}</p>
                  )
                ) : (
                  <ul className={styles.list} aria-label={TEXT.workspace.listAria}>
                    {conversations.map((conversation) => {
                      const selected =
                        conversation.conversation_id === highlightedId;
                      const isLive =
                        conversation.conversation_id === activeConversationId;
                      const itemTitle = conversationDisplayTitle(conversation);
                      return (
                        <li key={conversation.conversation_id}>
                          <button
                            type="button"
                            className={classNames(styles.item, {
                              [styles.itemActive]: selected,
                            })}
                            aria-current={selected ? "true" : undefined}
                            onClick={() =>
                              void selectConversation(conversation.conversation_id)
                            }
                          >
                            <span className={styles.itemTitle}>
                              <Tooltip
                                title={itemTitle}
                                placement="bottom-start"
                                enterDelay={400}
                                disableInteractive
                              >
                                <span className={styles.itemTitleText}>
                                  {itemTitle}
                                </span>
                              </Tooltip>
                              {isLive ? (
                                <span className={styles.currentBadge}>
                                  {TEXT.workspace.currentConversation}
                                </span>
                              ) : null}
                            </span>
                            <span className={styles.itemMeta}>
                              {formatConversationTimestamp(conversation.created_at)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}

            {showDetailPane || !isNarrow ? (
              <div className={styles.detailPane}>
                {isNarrow && showDetailPane ? (
                  <div className={styles.detailToolbar}>
                    <Tooltip title={TEXT.workspace.backToList}>
                      <IconButton
                        type="button"
                        size="small"
                        onClick={clearPreview}
                        aria-label={TEXT.workspace.backToList}
                      >
                        <ArrowBack />
                      </IconButton>
                    </Tooltip>
                    <Tooltip
                      title={previewTitle}
                      placement="bottom-start"
                      enterDelay={400}
                    >
                      <h4 className={styles.detailTitle}>{previewTitle}</h4>
                    </Tooltip>
                  </div>
                ) : null}

                {!previewId ? (
                  <p className={styles.hint}>{TEXT.workspace.pickHint}</p>
                ) : previewLoading ? (
                  <p className={styles.hint} role="status">
                    {TEXT.workspace.detailLoading}
                  </p>
                ) : previewError ? (
                  <div className={styles.errorBanner} role="alert">
                    <p>{previewError}</p>
                    <button
                      type="button"
                      className={styles.retryButton}
                      onClick={() => void selectConversation(previewId, true)}
                    >
                      {TEXT.workspace.retry}
                    </button>
                  </div>
                ) : (
                  <>
                    {!isNarrow ? (
                      <Tooltip
                        title={previewTitle}
                        placement="bottom-start"
                        enterDelay={400}
                      >
                        <h4 className={styles.detailTitle}>{previewTitle}</h4>
                      </Tooltip>
                    ) : null}
                    {previewMessages.length === 0 ? (
                      <p className={styles.hint}>{TEXT.workspace.emptyMessages}</p>
                    ) : (
                      <div className={styles.detailMessages}>
                        <ChatTranscript messages={previewMessages} />
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}
