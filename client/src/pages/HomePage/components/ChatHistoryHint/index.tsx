import { TEXT } from "@/constant";
import styles from "./index.module.less";

interface Props {
  /** 首屏正在拉这个会话的最近一页。 */
  loadingInitial: boolean;
  /** 正在往前翻一页。 */
  loadingEarlier: boolean;
  /** 翻页失败文案；空串表示没出错。 */
  error: string;
  /** 还有更早的气泡，继续上滑就会加载。 */
  hasMore: boolean;
  /** 已经翻到头，且会话长到值得提示一句。 */
  showStart: boolean;
}

/** 主聊天滚动区顶部的一行提示：翻页中、翻页失败、或已经到最早。 */
export function ChatHistoryHint({
  loadingInitial,
  loadingEarlier,
  error,
  hasMore,
  showStart,
}: Props) {
  if (loadingInitial) {
    return (
      <p className={styles.hint} role="status">
        {TEXT.workspace.detailLoading}
      </p>
    );
  }
  if (loadingEarlier) {
    return (
      <p className={styles.hint} role="status">
        {TEXT.workspace.loadingEarlier}
      </p>
    );
  }
  if (error) {
    return (
      <p className={styles.error} role="alert">
        {error}
      </p>
    );
  }
  if (!hasMore && showStart) {
    return <p className={styles.hint}>{TEXT.workspace.historyStart}</p>;
  }
  return null;
}
