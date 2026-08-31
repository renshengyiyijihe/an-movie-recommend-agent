import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, isSessionExpiredError, request } from "@/api";
import {
  chatRoutePath,
  conversationDetailPath,
  CONVERSATION_PAGE,
  ROUTE,
  TEXT,
} from "@/constant";
import useAuth from "@/store/auth";
import { toast } from "@/store/toast";
import type { ChatMessage, ConversationDetail } from "@/types";
import { convertConversationToMessages } from "@/utils/chatUtils";

interface ConversationHistoryOptions {
  /** 地址栏上的会话 id；`/` 时为 undefined。 */
  conversationId: string | undefined;
  /** 发送中不允许换会话。用 getter，避免和 `useChatTurn` 循环依赖。 */
  isSending: () => boolean;
  onSessionExpired: () => void;
  onNeedLogin: () => void;
  /** 用一页气泡替换主聊天。 */
  replaceMessages: (next: ChatMessage[]) => void;
  /** 更早的一页接在最前面。 */
  prependMessages: (older: ChatMessage[]) => void;
  /** 回到「新对话」时清空主聊天。 */
  onLeaveConversation: () => void;
  /** 翻页前记录滚动锚点，插入后视口不跳。 */
  captureTopAnchor: () => void;
  /** 首页加载完贴底。 */
  pinMessagesToBottom: () => void;
  /** 详情到手，顶栏标题要用里面的 title。 */
  onDetailLoaded: (detail: ConversationDetail) => void;
}

/**
 * 主聊天的历史消息：跟着地址栏的会话 id 加载最近一页，上滑再往前翻。
 * 只管历史与游标，本轮 SSE 在 `useChatTurn`，会话目录在 `useConversationWorkspace`。
 */
export function useConversationHistory(options: ConversationHistoryOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const { conversationId } = options;
  const navigate = useNavigate();
  const token = useAuth((s) => s.token);

  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");

  /** 主聊天当前装着哪个会话的气泡；和地址栏一致时不再重复拉。 */
  const loadedIdRef = useRef<string | undefined>(undefined);
  /** 更早一页的 `before`；为空表示没有更早的了。 */
  const beforeCursorRef = useRef<string | null>(null);
  /** 换会话 / 换号后丢弃在途响应。 */
  const loadGen = useRef(0);
  const loadingEarlierRef = useRef(false);
  const loadingInitialRef = useRef(false);

  const resetPaging = useCallback(() => {
    loadGen.current += 1;
    loadedIdRef.current = undefined;
    beforeCursorRef.current = null;
    loadingEarlierRef.current = false;
    loadingInitialRef.current = false;
    setHasMore(false);
    setLoadingInitial(false);
    setLoadingEarlier(false);
    setError("");
  }, []);

  /**
   * 本轮刚建好的会话没有更早的历史，直接认领，别再去拉一次把气泡冲掉。
   * 已经是当前会话时什么都不做，否则会把用户翻页翻出来的游标清掉。
   */
  const markLoaded = useCallback((id: string) => {
    if (loadedIdRef.current === id) return;
    loadGen.current += 1;
    loadedIdRef.current = id;
    beforeCursorRef.current = null;
    setHasMore(false);
    setError("");
  }, []);

  /** 历史弹窗已经拉过的详情直接接管，省掉主聊天再请求一次。 */
  const adoptDetail = useCallback((detail: ConversationDetail) => {
    loadGen.current += 1;
    loadedIdRef.current = detail.conversation_id;
    beforeCursorRef.current = detail.before_cursor ?? null;
    loadingEarlierRef.current = false;
    loadingInitialRef.current = false;
    setHasMore(Boolean(detail.has_more));
    setLoadingInitial(false);
    setLoadingEarlier(false);
    setError("");
  }, []);

  const loadFirstPage = useCallback(
    async (id: string) => {
      const gen = ++loadGen.current;
      loadingInitialRef.current = true;
      setLoadingInitial(true);
      setError("");
      optionsRef.current.replaceMessages([]);

      try {
        const detail = await request<ConversationDetail>({
          method: "GET",
          url: conversationDetailPath(id, {
            limit: CONVERSATION_PAGE.DEFAULT_SIZE,
          }),
        });
        if (gen !== loadGen.current) return;
        if (!detail?.conversation_id) {
          setError(TEXT.workspace.detailFailed);
          return;
        }

        loadedIdRef.current = id;
        beforeCursorRef.current = detail.before_cursor ?? null;
        setHasMore(Boolean(detail.has_more));
        optionsRef.current.onDetailLoaded(detail);
        optionsRef.current.pinMessagesToBottom();
        optionsRef.current.replaceMessages(
          convertConversationToMessages(detail.messages ?? []),
        );
      } catch (err) {
        if (gen !== loadGen.current) return;
        if (isSessionExpiredError(err)) {
          optionsRef.current.onSessionExpired();
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          toast.error(TEXT.workspace.conversationMissing);
          navigate(ROUTE.home, { replace: true });
          return;
        }
        setError(
          err instanceof ApiError && err.message
            ? err.message
            : TEXT.workspace.detailFailed,
        );
      } finally {
        loadingInitialRef.current = false;
        if (gen === loadGen.current) setLoadingInitial(false);
      }
    },
    [navigate],
  );

  /** 滚到顶部时翻上一页。没有游标、或已有请求在跑就直接忽略。 */
  const loadEarlier = useCallback(async () => {
    const id = loadedIdRef.current;
    const cursor = beforeCursorRef.current;
    if (!id || !cursor) return;
    if (loadingEarlierRef.current || loadingInitialRef.current) return;

    const gen = loadGen.current;
    loadingEarlierRef.current = true;
    setLoadingEarlier(true);
    setError("");

    try {
      const detail = await request<ConversationDetail>({
        method: "GET",
        url: conversationDetailPath(id, {
          limit: CONVERSATION_PAGE.DEFAULT_SIZE,
          before: cursor,
        }),
      });
      if (gen !== loadGen.current || loadedIdRef.current !== id) return;

      beforeCursorRef.current = detail.before_cursor ?? null;
      setHasMore(Boolean(detail.has_more));
      const older = convertConversationToMessages(detail.messages ?? []);
      if (older.length > 0) {
        // 记锚点和插入必须挨在一起：中间不能有 await，否则锚点对不上这次布局。
        optionsRef.current.captureTopAnchor();
        optionsRef.current.prependMessages(older);
      }
    } catch (err) {
      if (gen !== loadGen.current) return;
      if (isSessionExpiredError(err)) {
        optionsRef.current.onSessionExpired();
        return;
      }
      setError(TEXT.workspace.historyLoadFailed);
    } finally {
      loadingEarlierRef.current = false;
      if (gen === loadGen.current) setLoadingEarlier(false);
    }
  }, []);

  useEffect(() => {
    // 发送中不换会话：浏览器前进 / 后退也在这里被拽回来。
    if (optionsRef.current.isSending()) {
      const running = loadedIdRef.current;
      if (conversationId !== running) {
        toast.info(TEXT.workspace.waitUntilIdle);
        navigate(running ? chatRoutePath(running) : ROUTE.home, {
          replace: true,
        });
      }
      return;
    }

    if (!conversationId) {
      // 从某个会话退回「新对话」（含浏览器后退）才需要清；停在 / 时不重复清。
      if (loadedIdRef.current !== undefined) {
        resetPaging();
        optionsRef.current.onLeaveConversation();
      }
      return;
    }
    if (loadedIdRef.current === conversationId) return;
    if (!token) {
      optionsRef.current.onNeedLogin();
      return;
    }
    void loadFirstPage(conversationId);
  }, [conversationId, token, navigate, resetPaging, loadFirstPage]);

  return {
    loadingInitial,
    loadingEarlier,
    hasMore,
    error,
    loadEarlier,
    adoptDetail,
    markLoaded,
  };
}
