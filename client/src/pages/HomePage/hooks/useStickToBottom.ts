import { useLayoutEffect, useRef } from "react";

/** 距底部小于该值视为仍贴底，继续跟随新气泡。 */
const STICK_TO_BOTTOM_PX = 80;

/**
 * 主聊天滚动：靠近底部时跟随新内容，用户上翻后不再抢滚动。
 *
 * @param messages 主聊天气泡；条数或内容变了且仍贴底则滚到底
 * @param loading 生成中占位气泡出现时同样跟随
 * @param streamStage 加载文案变化时同样跟随
 * @returns 容器 ref、强制贴底、滚动时更新贴底标记
 * @example
 * const scroll = useStickToBottom(messages, loading, streamStage);
 * <div ref={scroll.containerRef} onScroll={scroll.onScroll} />
 */
export function useStickToBottom(
  messages: unknown,
  loading: boolean,
  streamStage: unknown,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  function pin() {
    stickToBottomRef.current = true;
  }

  function onScroll() {
    const el = containerRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX;
  }

  useLayoutEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [messages, loading, streamStage]);

  return {
    containerRef,
    pin,
    onScroll,
  };
}
