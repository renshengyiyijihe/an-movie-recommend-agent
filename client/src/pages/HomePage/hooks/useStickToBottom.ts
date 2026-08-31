import { useLayoutEffect, useRef } from "react";

/** 距底部小于该值视为仍贴底，继续跟随新气泡。 */
const STICK_TO_BOTTOM_PX = 80;
/** 距顶部小于该值触发加载更早的消息。 */
const LOAD_EARLIER_PX = 120;

/** 插入更早气泡前记下的位置，用来在高度变化后把视口钉回原处。 */
interface TopAnchor {
  scrollHeight: number;
  scrollTop: number;
}

/**
 * 主聊天滚动：靠近底部时跟随新内容，用户上翻后不再抢滚动；
 * 滚到顶部附近触发加载更早的消息，插入后保持原来看到的那条不动。
 *
 * @param messages 主聊天气泡；条数或内容变了且仍贴底则滚到底
 * @param loading 生成中占位气泡出现时同样跟随
 * @param streamStage 加载文案变化时同样跟随
 * @param onReachTop 滚到顶部附近时调用，通常是翻上一页
 * @returns 容器 ref、强制贴底、滚动回调、翻页前记录锚点
 * @example
 * const scroll = useStickToBottom(messages, loading, streamStage, loadEarlier);
 * <div ref={scroll.containerRef} onScroll={scroll.onScroll} />
 */
export function useStickToBottom(
  messages: unknown,
  loading: boolean,
  streamStage: unknown,
  onReachTop?: () => void,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const topAnchorRef = useRef<TopAnchor | null>(null);
  const onReachTopRef = useRef(onReachTop);
  onReachTopRef.current = onReachTop;

  function pin() {
    stickToBottomRef.current = true;
  }

  /** 翻上一页前调用；下一次布局会按这个锚点还原视口位置。 */
  function captureTopAnchor() {
    const el = containerRef.current;
    if (!el) return;
    topAnchorRef.current = {
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
    };
  }

  function onScroll() {
    const el = containerRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX;
    if (el.scrollTop <= LOAD_EARLIER_PX) onReachTopRef.current?.();
  }

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const anchor = topAnchorRef.current;
    if (anchor) {
      topAnchorRef.current = null;
      // 容器是 scroll-behavior: smooth，直接赋值会看到一段动画，先临时关掉。
      const previousBehavior = el.style.scrollBehavior;
      el.style.scrollBehavior = "auto";
      el.scrollTop = anchor.scrollTop + (el.scrollHeight - anchor.scrollHeight);
      el.style.scrollBehavior = previousBehavior;
      return;
    }

    if (!stickToBottomRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [messages, loading, streamStage]);

  return {
    containerRef,
    pin,
    onScroll,
    captureTopAnchor,
  };
}
