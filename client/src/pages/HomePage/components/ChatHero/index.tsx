import AppLogo from "@/components/AppLogo";
import { TEXT } from "@/constant";
import styles from "./index.module.less";

interface ChatHeroProps {
  onPickPrompt: (prompt: string) => void;
}

/** 空会话时的欢迎区与快捷提示。 */
export function ChatHero({ onPickPrompt }: ChatHeroProps) {
  return (
    <header className={styles.heroHeader}>
      <div className={styles.titleRow}>
        <div>
          <h1>{TEXT.chat.heroTitle}</h1>
          <p>{TEXT.chat.heroSubtitle}</p>
        </div>
      </div>
      <div className={styles.quickPrompts}>
        {TEXT.chat.quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className={styles.chipButton}
            onClick={() => onPickPrompt(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    </header>
  );
}

/** 滚动区里的空态，和 hero 一起只在没有气泡时出现。 */
export function ChatEmptyState() {
  return (
    <div className={styles.emptyState}>
      <AppLogo className={styles.emptyStateIcon} size={44} />
      <h3>{TEXT.chat.emptyTitle}</h3>
      <p>{TEXT.chat.emptyHint}</p>
    </div>
  );
}
