import { useState } from 'react';
import { Modal } from '@mui/material';
import type { ConversationDetail } from '../types';

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

  return (
    <Modal open={visible} onClose={onClose} aria-labelledby="config-modal-title" aria-describedby="config-modal-description">
      <div className="modal-overlay modal-overlay--centered" role="dialog" aria-modal="true">
        <div className="modal config-modal">
          <div className="modal-header">
            <div>
              <h3 id="config-modal-title">配置</h3>
              <p id="config-modal-description">管理功能与会话详情。</p>
            </div>
            <button className="modal-close" onClick={onClose} aria-label="关闭配置窗口">×</button>
          </div>
          <div className="config-grid">
            <div className="config-sidebar">
              {FEATURE_LIST.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  className={`config-sidebar-item ${activeFeature === feature.id ? 'active' : ''}`}
                  onClick={() => setActiveFeature(feature.id)}>
                  {feature.label}
                </button>
              ))}
            </div>
            <div className="config-content">
              {activeFeature === 'chat-history' ? (
                <div className="history-grid">
                  <div className="history-list">
                    {loading ? (
                      <p>加载会话列表中...</p>
                    ) : conversations.length === 0 ? (
                      <p>暂无会话，发送消息后会自动生成。</p>
                    ) : (
                      conversations.map((session) => (
                        <button
                          key={session.conversation_id}
                          type="button"
                          className="history-item"
                          onClick={() => onSelectConversation(session.conversation_id)}>
                          <div>{session.title ?? `会话 ${session.conversation_id.slice(0, 8)}`}</div>
                          <div className="history-item-meta">{new Date(session.created_at).toLocaleString()}</div>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="history-detail">
                    {detailLoading ? (
                      <p>加载会话详情中...</p>
                    ) : selectedConversation ? (
                      <>
                        <div className="history-detail-header">
                          <h4>{selectedConversation.title ?? '无标题会话'}</h4>
                          <p>会话 ID：{selectedConversation.conversation_id}</p>
                        </div>
                        <div className="history-messages">
                          {selectedConversation.messages
                            .filter((item) => item.role === 'user' || item.message_type === 'final_response')
                            .map((item) => (
                              <div key={item.id} className={`message ${item.role === 'user' ? 'user' : 'assistant'}`}>
                                <div className="message-role">{item.role === 'user' ? '你' : '智能体'}</div>
                                <div className="message-text">
                                  {item.content.split('\n').filter((line) => line.trim() !== '').map((line, idx) => (
                                    <p key={`${item.id}-${idx}`}>{line}</p>
                                  ))}
                                </div>
                              </div>
                            ))}
                        </div>
                      </>
                    ) : (
                      <p>选择一个会话以查看详情。</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
