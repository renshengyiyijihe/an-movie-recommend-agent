import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, isSessionExpiredError, request } from "@/api";
import { API_PATH, chatRoutePath, ROUTE, TEXT } from "@/constant";
import useAuth from "@/store/auth";
import { toast } from "@/store/toast";
import type { ConversationDetail, ConversationSummary } from "@/types";

interface ConversationWorkspaceOptions {
  onSessionExpired: () => void;
  onNeedLogin: () => void;
  /** 发送中禁止切主聊天 / 新建。用 getter，避免和 `useChatTurn` 循环依赖。 */
  isSending: () => boolean;
  /** 空闲点选历史后，把详情填进主聊天（贴底、换气泡、接管分页游标）。 */
  onOpenConversation: (detail: ConversationDetail) => void;
  /** 开始本地新对话：清气泡、stage、输入区。 */
  onLeaveCurrentChat: () => void;
}

/**
 * 会话目录：列表缓存、打开历史、改标题、空闲切主聊天。
 * 当前会话 id 只认地址栏（`/chat/:conversationId`），本 hook 不再自己存一份。
 * 不持有 `messages`；换号只清自己的字段并递增 `sessionGen`。
 */
export function useConversationWorkspace(options: ConversationWorkspaceOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const navigate = useNavigate();
  const { conversationId } = useParams();

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

  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const setConversationId = useCallback(
    (id: string) => {
      if (conversationIdRef.current === id) return;
      // SSE 建好会话后补地址栏。用 replace，避免后退回到还留着气泡的空白页。
      navigate(chatRoutePath(id), { replace: true });
    },
    [navigate],
  );

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
    // 先把详情交给主聊天，再改地址；地址变化触发的加载会看到这条已被接管。
    optionsRef.current.onOpenConversation(detail);
    navigate(chatRoutePath(detail.conversation_id));
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
    setSelectedConversation(null);
    optionsRef.current.onLeaveCurrentChat();
    navigate(ROUTE.home);
  }

  const previousUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const previous = previousUserIdRef.current;
    // navigate 的引用每次跳转都会变，只有 userId 真的换了才重置工作台。
    if (previous === userId) return;
    previousUserIdRef.current = userId;
    // 首次挂载，以及未登录 → 登录，都要保留地址栏上的会话，否则直达链接会被冲掉。
    if (previous === undefined || (previous === null && userId)) return;

    sessionGen.current += 1;
    setSelectedConversation(null);
    setConversationList([]);
    setListError("");
    setShowHistoryModal(false);
    setHistoryLoading(false);
    navigate(ROUTE.home, { replace: true });
  }, [userId, navigate]);

  return {
    conversationId,
    setConversationId,
    conversationList,
    selectedConversation,
    setSelectedConversation,
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
