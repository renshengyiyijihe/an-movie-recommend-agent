import { useState, type ReactNode } from "react";
import { Modal } from "@mui/material";
import { TEXT } from "@/constant";
import type { ConversationDetail } from "@/types";
import { chatItemPreviewText } from "@/utils/chatUtils";
import AccountPane from "./AccountPane";
import ChangePasswordForm from "./ChangePasswordForm";
import ChangeUsernameForm from "./ChangeUsernameForm";
import styles from "./index.module.less";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
  conversations: Array<{
    conversation_id: string;
    title?: string | null;
    created_at: string;
  }>;
  selectedConversation: ConversationDetail | null;
  loading: boolean;
  detailLoading: boolean;
}

const FEATURE = {
  ACCOUNT: "account",
  CHAT_HISTORY: "chat-history",
} as const;

const FEATURE_LIST = [
  { id: FEATURE.ACCOUNT, label: TEXT.config.account },
  { id: FEATURE.CHAT_HISTORY, label: TEXT.config.chatHistory },
];

function AccountActionDialog({
  open,
  titleId,
  descriptionId,
  title,
  description,
  closeAria,
  onClose,
  children,
}: {
  open: boolean;
  titleId: string;
  descriptionId: string;
  title: string;
  description: string;
  closeAria: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className={styles.detailOverlay} role="dialog" aria-modal="true">
        <div className={styles.accountDialog}>
          <div className={styles.detailHeader}>
            <div>
              <h3 id={titleId}>{title}</h3>
              <p id={descriptionId} className={styles.detailSubtitle}>
                {description}
              </p>
            </div>
            <button
              className={styles.detailCloseButton}
              onClick={onClose}
              aria-label={closeAria}
            >
              ×
            </button>
          </div>
          {children}
        </div>
      </div>
    </Modal>
  );
}

export default function ConfigModal({
  visible,
  onClose,
  onSelectConversation,
  conversations,
  selectedConversation,
  loading,
  detailLoading,
}: Props) {
  const [activeFeature, setActiveFeature] = useState<string>(FEATURE.ACCOUNT);
  const [detailOpen, setDetailOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false);

  function openConversationDetail(conversationId: string) {
    setDetailOpen(true);
    onSelectConversation(conversationId);
  }

  function closeDetailModal() {
    setDetailOpen(false);
  }

  function closeAccountDialogs() {
    setPasswordDialogOpen(false);
    setUsernameDialogOpen(false);
  }

  function handleClose() {
    closeDetailModal();
    closeAccountDialogs();
    onClose();
  }

  return (
    <>
      <Modal
        open={visible}
        onClose={handleClose}
        disableEnforceFocus={passwordDialogOpen || usernameDialogOpen || detailOpen}
        aria-labelledby="config-modal-title"
        aria-describedby="config-modal-description"
      >
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <h3 id="config-modal-title" className={styles.modalTitle}>
                  {TEXT.config.title}
                </h3>
                <p
                  id="config-modal-description"
                  className={styles.modalDescription}
                >
                  {TEXT.config.description}
                </p>
              </div>
              <button
                className={styles.closeButton}
                onClick={handleClose}
                aria-label={TEXT.config.closeAria}
              >
                ×
              </button>
            </div>
            <div className={styles.configGrid}>
              <div className={styles.sidebar}>
                {FEATURE_LIST.map((feature) => (
                  <button
                    key={feature.id}
                    type="button"
                    className={`${styles.sidebarItem} ${activeFeature === feature.id ? styles.sidebarItemActive : ""}`}
                    onClick={() => setActiveFeature(feature.id)}
                  >
                    {feature.label}
                  </button>
                ))}
              </div>
              <div className={styles.content}>
                {visible && activeFeature === FEATURE.ACCOUNT ? (
                  <AccountPane
                    onChangeUsername={() => setUsernameDialogOpen(true)}
                    onChangePassword={() => setPasswordDialogOpen(true)}
                  />
                ) : null}
                {activeFeature === FEATURE.CHAT_HISTORY ? (
                  <div className={styles.historyList}>
                    {loading ? (
                      <p className={styles.noHistory}>{TEXT.workspace.loading}</p>
                    ) : conversations.length === 0 ? (
                      <p className={styles.noHistory}>{TEXT.workspace.empty}</p>
                    ) : (
                      conversations.map((session) => (
                        <button
                          key={session.conversation_id}
                          type="button"
                          className={styles.historyItem}
                          onClick={() =>
                            openConversationDetail(session.conversation_id)
                          }
                        >
                          <div>
                            {session.title ??
                              `会话 ${session.conversation_id.slice(0, 8)}`}
                          </div>
                          <div className={styles.historyItemMeta}>
                            {new Date(session.created_at).toLocaleString()}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <AccountActionDialog
        open={usernameDialogOpen}
        titleId="change-username-title"
        descriptionId="change-username-description"
        title={TEXT.config.changeUsername}
        description={TEXT.config.changeUsernameHint}
        closeAria={TEXT.config.closeChangeUsernameAria}
        onClose={() => setUsernameDialogOpen(false)}
      >
        <ChangeUsernameForm
          visible={usernameDialogOpen}
          onClose={() => setUsernameDialogOpen(false)}
          onSessionExpired={handleClose}
        />
      </AccountActionDialog>

      <AccountActionDialog
        open={passwordDialogOpen}
        titleId="change-password-title"
        descriptionId="change-password-description"
        title={TEXT.config.changePassword}
        description={TEXT.config.changePasswordHint}
        closeAria={TEXT.config.closeChangePasswordAria}
        onClose={() => setPasswordDialogOpen(false)}
      >
        <ChangePasswordForm
          visible={passwordDialogOpen}
          onClose={() => setPasswordDialogOpen(false)}
          onSessionExpired={handleClose}
        />
      </AccountActionDialog>

      <Modal
        open={detailOpen}
        onClose={closeDetailModal}
        aria-labelledby="conversation-detail-title"
        aria-describedby="conversation-detail-description"
      >
        <div className={styles.detailOverlay} role="dialog" aria-modal="true">
          <div className={styles.detailModal}>
            <div className={styles.detailHeader}>
              <div>
                <h3 id="conversation-detail-title">会话详情</h3>
                <p
                  id="conversation-detail-description"
                  className={styles.detailSubtitle}
                >
                  点击右上角关闭，或点击弹窗外侧返回。
                </p>
              </div>
              <button
                className={styles.detailCloseButton}
                onClick={closeDetailModal}
                aria-label="关闭会话详情"
              >
                ×
              </button>
            </div>
            <div className={styles.detailBody}>
              {detailLoading ? (
                <p className={styles.detailLoading}>加载会话详情中...</p>
              ) : selectedConversation ? (
                <>
                  <div className={styles.detailMeta}>
                    <h4>{selectedConversation.title ?? "无标题会话"}</h4>
                    <p>会话 ID：{selectedConversation.conversation_id}</p>
                  </div>
                  <div className={styles.historyMessages}>
                    {selectedConversation.messages.map((item) => {
                      const preview = chatItemPreviewText(item);
                      return (
                        <div
                          key={item.id}
                          className={`${styles.message} ${item.role === "user" ? styles.userMessage : styles.assistantMessage}`}
                        >
                          <div className={styles.messageRole}>
                            {item.role === "user" ? "你" : "智能体"}
                          </div>
                          {preview ? (
                            <div className={styles.messageText}>
                              {preview
                                .split("\n")
                                .filter((line) => line.trim() !== "")
                                .map((line, idx) => (
                                  <p key={`${item.id}-${idx}`}>{line}</p>
                                ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className={styles.detailEmpty}>
                  请先点击左侧会话列表中的某一个会话。
                </p>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
