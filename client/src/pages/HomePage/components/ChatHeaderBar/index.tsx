import Add from "@mui/icons-material/Add";
import ConversationTitle from "@/components/ConversationTitle";
import { TEXT } from "@/constant";
import styles from "./index.module.less";

interface Props {
  title: string;
  conversationId?: string;
  loggedIn: boolean;
  sending: boolean;
  onNewConversation: () => void;
  onRenamed: (conversationId: string, title: string) => void;
  onSessionExpired: () => void;
}

/** 有消息时的会话顶栏：标题 +「新对话」。 */
export function ChatHeaderBar({
  title,
  conversationId,
  loggedIn,
  sending,
  onNewConversation,
  onRenamed,
  onSessionExpired,
}: Props) {
  return (
    <header className={styles.chatHeader}>
      <ConversationTitle
        title={title}
        conversationId={conversationId}
        editable={Boolean(loggedIn && conversationId)}
        disabledReason={
          loggedIn
            ? TEXT.workspace.titleEditPending
            : TEXT.workspace.titleEditNeedLogin
        }
        onRenamed={onRenamed}
        onSessionExpired={onSessionExpired}
      />
      {loggedIn ? (
        <button
          type="button"
          className={styles.newConversationButton}
          onClick={onNewConversation}
          disabled={sending}
          aria-label={TEXT.workspace.newConversationAria}
        >
          <Add className={styles.actionIcon} fontSize="small" />
          {TEXT.workspace.newConversation}
        </button>
      ) : null}
    </header>
  );
}
