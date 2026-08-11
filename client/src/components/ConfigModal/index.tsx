import { useState } from 'react';
import { Modal } from '@mui/material';
import type { ConversationDetail } from '../../types';
import styles from './index.module.less';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
  conversations: Array<{ conversation_id: string; title?: string | null; created_at: string }>;
  selectedConversation: ConversationDetail | null;
  loading: boolean;
  detailLoading: boolean;
}

const FEATURE_LIST = [
  { id: 'chat-history', label: '会话消息' },
];

export default function ConfigModal({
  visible,
  onClose,
  onSelectConversation,
  conversations,
  selectedConversation,
  loading,
  detailLoading,
}: Props) {
  const [activeFeature, setActiveFeature] = useState('chat-history');
  const [detailOpen, setDetailOpen] = useState(false);

  function openConversationDetail(conversationId: string) {
    setDetailOpen(true);
    onSelectConversation(conversationId);
  }

  function closeDetailModal() {
    setDetailOpen(false);
  }

  function handleClose() {
    closeDetailModal();
    onClose();
  }

  return (
    <>
      <Modal open={visible} onClose={handleClose} aria-labelledby="config-modal-title" aria-describedby="config-modal-description">
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <h3 id="config-modal-title" className={styles.modalTitle}>配置</h3>
                <p id="config-modal-description" className={styles.modalDescription}>管理功能与会话详情。</p>
              </div>
              <button className={styles.closeButton} onClick={handleClose} aria-label="关闭配置窗口">×</button>
            </div>
            <div className={styles.configGrid}>
              <div className={styles.sidebar}>
                {FEATURE_LIST.map((feature) => (
                  <button
                    key={feature.id}
                    type="button"
                    className={`${styles.sidebarItem} ${activeFeature === feature.id ? styles.sidebarItemActive : ''}`}
                    onClick={() => setActiveFeature(feature.id)}>
                    {feature.label}
                  </button>
                ))}
              </div>
              <div className={styles.content}>
                {activeFeature === 'chat-history' ? (
                  <div className={styles.historyList}>
                    {loading ? (
                      <p className={styles.noHistory}>加载会话列表中...</p>
                    ) : conversations.length === 0 ? (
                      <p className={styles.noHistory}>暂无会话，发送消息后会自动生成。</p>
                    ) : (
                      conversations.map((session) => (
                        <button
                          key={session.conversation_id}
                          type="button"
                          className={styles.historyItem}
                          onClick={() => openConversationDetail(session.conversation_id)}>
                          <div>{session.title ?? `会话 ${session.conversation_id.slice(0, 8)}`}</div>
                          <div className={styles.historyItemMeta}>{new Date(session.created_at).toLocaleString()}</div>
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
                <p id="conversation-detail-description" className={styles.detailSubtitle}>
                  点击右上角关闭，或点击弹窗外侧返回。
                </p>
              </div>
              <button className={styles.detailCloseButton} onClick={closeDetailModal} aria-label="关闭会话详情">×</button>
            </div>
            <div className={styles.detailBody}>
              {detailLoading ? (
                <p className={styles.detailLoading}>加载会话详情中...</p>
              ) : selectedConversation ? (
                <>
                  <div className={styles.detailMeta}>
                    <h4>{selectedConversation.title ?? '无标题会话'}</h4>
                    <p>会话 ID：{selectedConversation.conversation_id}</p>
                  </div>
                  <div className={styles.historyMessages}>
                    {selectedConversation.messages
                      .filter((item) => item.role === 'user' || item.message_type === 'final_response')
                      .map((item) => (
                        <div
                          key={item.id}
                          className={`${styles.message} ${item.role === 'user' ? styles.userMessage : styles.assistantMessage}`}
                        >
                          <div className={styles.messageRole}>{item.role === 'user' ? '你' : '智能体'}</div>
                          <div className={styles.messageText}>
                            {item.content
                              .split('\n')
                              .filter((line) => line.trim() !== '')
                              .map((line, idx) => (
                                <p key={`${item.id}-${idx}`}>{line}</p>
                              ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              ) : (
                <p className={styles.detailEmpty}>请先点击左侧会话列表中的某一个会话。</p>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
