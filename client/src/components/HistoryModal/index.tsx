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

                {renderConversationList({
                  conversations,
                  highlightedId,
                  activeConversationId,
                  listError,
                  showInitialLoading,
                  onSelect: selectConversation,
                })}
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

                {renderDetailBody({
                  previewId,
                  previewLoading,
                  previewError,
                  previewTitle,
                  previewMessages,
                  isNarrow,
                  onRetry: selectConversation,
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** 左侧会话列表的展示参数。 */
interface ConversationListProps {
  /** 当前用户的会话摘要。 */
  conversations: ConversationSummary[];
  /** 右栏正在预览的会话 id。 */
  highlightedId: string | null;
  /** 主聊天当前会话，用来标「当前」。 */
  activeConversationId?: string;
  /** 拉列表失败文案；有错时不重复渲染空提示。 */
  listError: string;
  /** 列表还没回来且本地为空。 */
  showInitialLoading: boolean;
  /** 点选一条会话。 */
  onSelect: (targetId: string) => void;
}

/**
 * 历史弹窗左侧会话列表：首载、空列表或条目。
 *
 * @param props 列表状态与点选回调
 * @returns 加载提示、空提示或会话按钮列表
 * @example
 * renderConversationList({
 *   conversations: [],
 *   highlightedId: null,
 *   listError: "",
 *   showInitialLoading: false,
 *   onSelect: () => undefined,
 * })
 * // 空列表提示
 */
function renderConversationList({
  conversations,
  highlightedId,
  activeConversationId,
  listError,
  showInitialLoading,
  onSelect,
}: ConversationListProps) {
  if (showInitialLoading) {
    return <p className={styles.hint}>{TEXT.workspace.loading}</p>;
  }
  if (conversations.length === 0) {
    return listError ? null : (
      <p className={styles.hint}>{TEXT.workspace.empty}</p>
    );
  }
  return (
    <ul className={styles.list} aria-label={TEXT.workspace.listAria}>
      {conversations.map((conversation) => {
        const selected = conversation.conversation_id === highlightedId;
        const isLive = conversation.conversation_id === activeConversationId;
        const itemTitle = conversationDisplayTitle(conversation);
        return (
          <li key={conversation.conversation_id}>
            <button
              type="button"
              className={classNames(styles.item, {
                [styles.itemActive]: selected,
              })}
              aria-current={selected ? "true" : undefined}
              onClick={() => void onSelect(conversation.conversation_id)}
            >
              <span className={styles.itemTitle}>
                <Tooltip
                  title={itemTitle}
                  placement="bottom-start"
                  enterDelay={400}
                  disableInteractive
                >
                  <span className={styles.itemTitleText}>{itemTitle}</span>
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
  );
}

/** 右侧详情区的展示参数。 */
interface DetailBodyProps {
  /** 正在预览的会话；未选则为 null。 */
  previewId: string | null;
  /** 详情还在 GET。 */
  previewLoading: boolean;
  /** 详情失败文案。 */
  previewError: string;
  /** 标题栏 / Tooltip 用的展示名。 */
  previewTitle: string;
  /** 右栏气泡。 */
  previewMessages: ChatMessage[];
  /** 窄屏时标题已在工具栏，这里不再重复。 */
  isNarrow: boolean;
  /** 详情失败后重试。 */
  onRetry: (targetId: string, bypassCache?: boolean) => void;
}

/**
 * 历史弹窗右侧详情：未选、加载、失败或消息。
 *
 * @param props 当前预览状态
 * @returns 提示、错误条或气泡列表
 * @example
 * renderDetailBody({
 *   previewId: null,
 *   previewLoading: false,
 *   previewError: "",
 *   previewTitle: "",
 *   previewMessages: [],
 *   isNarrow: false,
 *   onRetry: () => undefined,
 * })
 * // 未选会话提示
 */
function renderDetailBody({
  previewId,
  previewLoading,
  previewError,
  previewTitle,
  previewMessages,
  isNarrow,
  onRetry,
}: DetailBodyProps) {
  if (!previewId) {
    return <p className={styles.hint}>{TEXT.workspace.pickHint}</p>;
  }
  if (previewLoading) {
    return (
      <p className={styles.hint} role="status">
        {TEXT.workspace.detailLoading}
      </p>
    );
  }
  if (previewError) {
    return (
      <div className={styles.errorBanner} role="alert">
        <p>{previewError}</p>
        <button
          type="button"
          className={styles.retryButton}
          onClick={() => void onRetry(previewId, true)}
        >
          {TEXT.workspace.retry}
        </button>
      </div>
    );
  }
  return (
    <>
      {!isNarrow ? (
        <Tooltip title={previewTitle} placement="bottom-start" enterDelay={400}>
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
  );
}
