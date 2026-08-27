import IconButton from "@mui/material/IconButton";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import { TEXT } from "@/constant";
import type { ConversationSummary } from "@/types";
import {
  conversationDisplayTitle,
  formatConversationTimestamp,
} from "@/utils/conversation";
import styles from "./index.module.less";

interface Props {
  conversations: ConversationSummary[];
  activeConversationId?: string;
  listLoading: boolean;
  listError: string;
  /** 发送中或正在拉取某条详情时，禁止切换 / 新建。 */
  interactionLocked: boolean;
  isGuest: boolean;
  onNewConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  onRetryList: () => void;
  onLogin: () => void;
  onCollapse: () => void;
}

export default function ConversationSidebar({
  conversations,
  activeConversationId,
  listLoading,
  listError,
  interactionLocked,
  isGuest,
  onNewConversation,
  onSelectConversation,
  onRetryList,
  onLogin,
  onCollapse,
}: Props) {
  const isDraft = !activeConversationId;
  const showInitialLoading = listLoading && conversations.length === 0;

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <h2 className={styles.title}>{TEXT.workspace.title}</h2>
          <IconButton
            type="button"
            size="small"
            className={styles.collapseButton}
            onClick={onCollapse}
            aria-label={TEXT.workspace.collapseSidebarAria}
          >
            <ChevronLeft />
          </IconButton>
        </div>
        {isGuest ? (
          <button
            type="button"
            className={styles.loginButton}
            onClick={onLogin}
          >
            {TEXT.workspace.loginToView}
          </button>
        ) : (
          <button
            type="button"
            className={`${styles.newButton} ${isDraft ? styles.newButtonActive : ""}`}
            onClick={onNewConversation}
            disabled={interactionLocked}
            aria-label={TEXT.workspace.newConversationAria}
            aria-pressed={isDraft}
          >
            {TEXT.workspace.newConversation}
          </button>
        )}
      </div>

      {isGuest ? (
        <p className={styles.hint}>{TEXT.workspace.guestHint}</p>
      ) : (
        <div className={styles.listPane}>
          {listError ? (
            <div className={styles.errorBanner} role="alert">
              <p>{listError}</p>
              <button type="button" className={styles.retryButton} onClick={onRetryList}>
                {TEXT.workspace.retry}
              </button>
            </div>
          ) : null}

          {showInitialLoading ? (
            <p className={styles.hint}>{TEXT.workspace.loading}</p>
          ) : conversations.length === 0 && !listError ? (
            <p className={styles.hint}>{TEXT.workspace.empty}</p>
          ) : (
            <ul className={styles.list} aria-label={TEXT.workspace.listAria}>
              {conversations.map((conversation) => {
                const selected =
                  conversation.conversation_id === activeConversationId;
                return (
                  <li key={conversation.conversation_id}>
                    <button
                      type="button"
                      className={`${styles.item} ${selected ? styles.itemActive : ""}`}
                      disabled={interactionLocked}
                      aria-current={selected ? "page" : undefined}
                      onClick={() =>
                        onSelectConversation(conversation.conversation_id)
                      }
                    >
                      <span className={styles.itemTitle}>
                        {conversationDisplayTitle(conversation)}
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
      )}
    </div>
  );
}
