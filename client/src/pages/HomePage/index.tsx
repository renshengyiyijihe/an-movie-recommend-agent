import { useCallback, useEffect, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import ChatTranscript from "@/components/ChatTranscript";
import ConfigModal from "@/components/ConfigModal";
import HistoryModal from "@/components/HistoryModal";
import TopBar from "@/components/TopBar";
import { TEXT } from "@/constant";
import useAuth from "@/store/auth";
import { toast } from "@/store/toast";
import type { ChatMessage, ConversationDetail } from "@/types";
import { convertConversationToMessages } from "@/utils/chatUtils";
import { resolveActiveConversationTitle } from "@/utils/conversation";
import { ChatComposer } from "./components/ChatComposer";
import { ChatHeaderBar } from "./components/ChatHeaderBar";
import { ChatEmptyState, ChatHero } from "./components/ChatHero";
import { ChatLoadingBubble } from "./components/ChatLoadingBubble";
import { useChatTurn } from "./hooks/useChatTurn";
import { useComposer } from "./hooks/useComposer";
import { useConversationWorkspace } from "./hooks/useConversationWorkspace";
import { useStickToBottom } from "./hooks/useStickToBottom";
import styles from "./index.module.less";

export default function HomePage() {
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");

  const token = useAuth((s) => s.token);
  const userId = useAuth((s) => s.user?.id ?? null);
  const logout = useAuth((s) => s.logout);

  const handleSessionExpired = useCallback(() => {
    logout({ silent: true });
    toast.info(TEXT.auth.sessionExpired);
    setShowLoginModal(true);
  }, [logout]);

  const openLogin = useCallback(() => {
    setShowLoginModal(true);
  }, []);

  /**
   * 目录 hook 先于本轮 / 滚动创建。跨 hook 动作走 ref，避免循环依赖。
   */
  const pinRef = useRef(() => {});
  const turnApiRef = useRef({
    isSending: () => false,
    replaceMessages: (_next: ChatMessage[]) => {},
    resetForNewConversation: () => {},
  });

  const composer = useComposer();

  const workspace = useConversationWorkspace({
    onSessionExpired: handleSessionExpired,
    onNeedLogin: openLogin,
    isSending: () => turnApiRef.current.isSending(),
    onOpenConversation: (detail: ConversationDetail) => {
      pinRef.current();
      turnApiRef.current.replaceMessages(
        convertConversationToMessages(detail.messages ?? []),
      );
    },
    onLeaveCurrentChat: () => {
      turnApiRef.current.resetForNewConversation();
      composer.reset();
    },
  });

  const turn = useChatTurn({
    getSessionGen: workspace.getSessionGen,
    setConversationId: workspace.setConversationId,
    rememberConversationIfNew: workspace.rememberConversationIfNew,
    onSessionExpired: handleSessionExpired,
    onNeedLogin: openLogin,
    pinMessagesToBottom: () => pinRef.current(),
    onStarted: composer.clearDraftAndFile,
    onSettled: composer.clearImageData,
  });

  const scroll = useStickToBottom(
    turn.messages,
    turn.loading,
    turn.streamStage,
  );

  pinRef.current = scroll.pin;
  turnApiRef.current = {
    isSending: turn.isSending,
    replaceMessages: turn.replaceMessages,
    resetForNewConversation: turn.resetForNewConversation,
  };

  useEffect(() => {
    setShowConfigModal(false);
  }, [userId]);

  function openConfigModal() {
    if (!token) {
      setShowLoginModal(true);
      return;
    }
    setShowConfigModal(true);
  }

  function handleSend() {
    void turn.send({
      text: composer.draft,
      imageData: composer.imageData,
      conversationId: workspace.conversationId,
    });
  }

  const activeConversationTitle = resolveActiveConversationTitle({
    conversationId: workspace.conversationId,
    conversations: workspace.conversationList,
    selectedTitle: workspace.selectedConversation?.title,
    messages: turn.messages,
  });

  const hasMessages = turn.messages.length > 0;

  return (
    <div className={styles.appShell}>
      <TopBar
        onOpenHistory={workspace.openHistoryModal}
        onOpenConfig={openConfigModal}
        onOpenLogin={() => {
          setShowLoginModal(true);
        }}
        onOpenRegister={() => {
          setShowRegisterModal(true);
        }}
      />

      <HistoryModal
        visible={workspace.showHistoryModal}
        userId={userId}
        conversations={workspace.conversationList}
        activeConversationId={workspace.conversationId}
        activeMessages={turn.messages}
        listLoading={workspace.historyLoading}
        listError={workspace.listError}
        sending={turn.loading}
        onClose={workspace.closeHistoryModal}
        onRetryList={() => void workspace.fetchConversations()}
        onActivate={workspace.activateConversation}
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
          {hasMessages ? (
            <ChatHeaderBar
              title={activeConversationTitle}
              conversationId={workspace.conversationId}
              loggedIn={Boolean(token)}
              sending={turn.loading}
              onNewConversation={workspace.startNewConversation}
              onRenamed={workspace.applyConversationTitle}
              onSessionExpired={handleSessionExpired}
            />
          ) : (
            <ChatHero onPickPrompt={composer.setDraft} />
          )}

          <div
            className={styles.messages}
            ref={scroll.containerRef}
            onScroll={scroll.onScroll}
          >
            {hasMessages ? (
              <>
                <ChatTranscript messages={turn.messages} />
                {turn.loading ? (
                  <ChatLoadingBubble stage={turn.streamStage} />
                ) : null}
              </>
            ) : (
              <ChatEmptyState />
            )}
          </div>

          <ChatComposer
            draft={composer.draft}
            imagePreview={composer.imagePreview}
            disabled={turn.loading}
            sending={turn.loading}
            stopping={turn.stopping}
            onDraftChange={composer.setDraft}
            onPickFile={composer.setFile}
            onSend={handleSend}
            onStop={() => {
              void turn.stopGenerating();
            }}
          />
        </section>
      </div>
    </div>
  );
}
