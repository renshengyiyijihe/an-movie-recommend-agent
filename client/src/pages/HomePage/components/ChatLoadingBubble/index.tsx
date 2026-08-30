import type { ChatStreamStageEvent } from "@an-movie/contracts";
import { TEXT } from "@/constant";
import { chatStageLabel } from "../../utils/apply-chat-stream";
import styles from "./index.module.less";

interface Props {
  stage: ChatStreamStageEvent | null;
}

/** 生成中的助手占位气泡。不要写进 ChatTranscript，历史弹窗不应出现。 */
export function ChatLoadingBubble({ stage }: Props) {
  const label = chatStageLabel(stage);
  return (
    <div className={styles.bubble}>
      <div className={styles.role}>{TEXT.chat.assistantRole}</div>
      <div className={styles.text}>
        <div className={styles.status} aria-label={label}>
          <div className={styles.dots} aria-hidden="true" />
          <span className={styles.label}>{label}</span>
        </div>
      </div>
    </div>
  );
}
