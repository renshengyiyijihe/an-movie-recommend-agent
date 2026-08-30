import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, isSessionExpiredError, request } from "@/api";
import { API_PATH, TEXT } from "@/constant";
import useAuth from "@/store/auth";
import { toast } from "@/store/toast";
import type { ConversationDetail, ConversationSummary } from "@/types";

interface ConversationWorkspaceOptions {
  onSessionExpired: () => void;
  onNeedLogin: () => void;
  /** 发送中禁止切主聊天 / 新建。用 getter，避免和 `useChatTurn` 循环依赖。 */
  isSending: () => boolean;
  /** 空闲点选历史后，把详情填进主聊天（贴底、换气泡）。 */
  onOpenConversation: (detail: ConversationDetail) => void;
  /** 开始本地新对话：清气泡、stage、输入区。 */
  onLeaveCurrentChat: () => void;
}

/**
 * 会话目录：列表缓存、当前 id、打开历史、改标题、空闲切主聊天。
 * 不持有 `messages`；换号只清自己的字段并递增 `sessionGen`。
 */
export function useConversationWorkspace(options: ConversationWorkspaceOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [conversationId, setConversationId] = useState<string | undefined>(
    undefined,
  );
  const [conversationList, setConversationList] = useState<
    ConversationSummary[]
  >([]);
  const [selectedConversation, setSelectedConversation] =
    useState<ConversationDetail | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const token = useAuth((s) => s.token);
  const userId = useAuth((s) => s.user?.id ?? null);
  const sessionGen = useRef(0);

  const getSessionGen = useCallback(() => sessionGen.current, []);

  const fetchConversations = useCallback(
    async (requestGen = sessionGen.current, refresh?: { silent?: boolean }) => {
      if (!useAuth.getState().token) return;

      if (!refresh?.silent) {
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
          optionsRef.current.onSessionExpired();
          return;
        }
        setListError(
          err instanceof ApiError && err.message
            ? err.message
            : TEXT.workspace.loadFailed,
        );
      } finally {
        if (requestGen === sessionGen.current && !refresh?.silent) {
          setHistoryLoading(false);
        }
      }
    },
    [],
  );

  const rememberConversationIfNew = useCallback((id: string, title: string) => {
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
  }, []);

  const applyConversationTitle = useCallback((id: string, title: string) => {
    setConversationList((prev) =>
      prev.map((item) =>
        item.conversation_id === id ? { ...item, title } : item,
      ),
    );
    setSelectedConversation((prev) =>
      prev && prev.conversation_id === id ? { ...prev, title } : prev,
    );
  }, []);

  function activateConversation(detail: ConversationDetail) {
    if (optionsRef.current.isSending()) return;
    setSelectedConversation(detail);
    setConversationId(detail.conversation_id);
    optionsRef.current.onOpenConversation(detail);
  }

  function openHistoryModal() {
    if (!token) {
      optionsRef.current.onNeedLogin();
      return;
    }
    setShowHistoryModal(true);
    void fetchConversations(sessionGen.current, {
      silent: conversationList.length > 0,
    });
  }

  function closeHistoryModal() {
    setShowHistoryModal(false);
  }

  function startNewConversation() {
    if (optionsRef.current.isSending()) {
      toast.info(TEXT.workspace.waitUntilIdle);
      return;
    }
    setShowHistoryModal(false);
    setConversationId(undefined);
    setSelectedConversation(null);
    optionsRef.current.onLeaveCurrentChat();
  }

  useEffect(() => {
    sessionGen.current += 1;
    setConversationId(undefined);
    setSelectedConversation(null);
    setConversationList([]);
    setListError("");
    setShowHistoryModal(false);
    setHistoryLoading(false);
  }, [userId]);

  return {
    conversationId,
    setConversationId,
    conversationList,
    selectedConversation,
    historyLoading,
    listError,
    showHistoryModal,
    getSessionGen,
    fetchConversations,
    rememberConversationIfNew,
    applyConversationTitle,
    activateConversation,
    openHistoryModal,
    closeHistoryModal,
    startNewConversation,
  };
}
