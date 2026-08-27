import { useEffect, useRef } from "react";
import classNames from "classnames";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Add from "@mui/icons-material/Add";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Login from "@mui/icons-material/Login";
import { LAYOUT, TEXT } from "@/constant";
import type { ConversationSummary } from "@/types";
import {
  conversationDisplayTitle,
  formatConversationTimestamp,
} from "@/utils/conversation";
import styles from "./index.module.less";

interface Props {
  conversations: ConversationSummary[];
  activeConversationId?: string;
  listLoading: boolean;
  listError: string;
  /** 发送中或正在拉取某条详情时，禁止切换 / 新建。 */
  interactionLocked: boolean;
  isGuest: boolean;
  /** 桌面收起到图标轨时为 true；抽屉里的实例始终为 false。 */
  collapsed: boolean;
  onNewConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  onRetryList: () => void;
  onLogin: () => void;
  /** 桌面切换折叠；窄屏抽屉里点收起则关掉抽屉。 */
  onToggleCollapse: () => void;
}

export default function ConversationSidebar({
  conversations,
  activeConversationId,
  listLoading,
  listError,
  interactionLocked,
  isGuest,
  collapsed,
  onNewConversation,
  onSelectConversation,
  onRetryList,
  onLogin,
  onToggleCollapse,
}: Props) {
  const isDraft = !activeConversationId;
  const showInitialLoading = listLoading && conversations.length === 0;
  const mainRef = useRef<HTMLDivElement>(null);
  const collapseLabel = collapsed
    ? TEXT.workspace.expandSidebar
    : TEXT.workspace.collapseSidebar;

  useEffect(() => {
    const node = mainRef.current;
    if (!node) return;
    if (collapsed) node.setAttribute("inert", "");
    else node.removeAttribute("inert");
  }, [collapsed]);

  return (
    <div
      className={classNames(styles.sidebar, {
        [styles.isCollapsed]: collapsed,
      })}
      style={{
        width: LAYOUT.SIDEBAR_WIDTH_PX,
        minWidth: LAYOUT.SIDEBAR_WIDTH_PX,
      }}
    >
      <div
        className={styles.rail}
        style={{
          width: LAYOUT.SIDEBAR_RAIL_WIDTH_PX,
          flexBasis: LAYOUT.SIDEBAR_RAIL_WIDTH_PX,
        }}
      >
        <Tooltip title={collapseLabel}>
          <IconButton
            type="button"
            size="small"
            className={styles.railButton}
            onClick={onToggleCollapse}
            aria-label={collapseLabel}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </IconButton>
        </Tooltip>
        {collapsed ? (
          isGuest ? (
            <Tooltip title={TEXT.workspace.loginToView}>
              <IconButton
                type="button"
                size="small"
                className={styles.railButton}
                onClick={onLogin}
                aria-label={TEXT.workspace.loginToView}
              >
                <Login />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title={TEXT.workspace.newConversation}>
              <span>
                <IconButton
                  type="button"
                  size="small"
                  className={classNames(styles.railButton, {
                    [styles.railButtonActive]: isDraft,
                  })}
                  onClick={onNewConversation}
                  disabled={interactionLocked}
                  aria-label={TEXT.workspace.newConversationAria}
                  aria-pressed={isDraft}
                >
                  <Add />
                </IconButton>
              </span>
            </Tooltip>
          )
        ) : null}
      </div>

      <div ref={mainRef} className={styles.main} aria-hidden={collapsed}>
        <div className={styles.header}>
          <h2 className={styles.title}>{TEXT.workspace.title}</h2>
          {isGuest ? (
            <Button
              type="button"
              className={styles.loginButton}
              onClick={onLogin}
              startIcon={<Login />}
            >
              {TEXT.workspace.loginToView}
            </Button>
          ) : (
            <Button
              type="button"
              className={classNames(styles.newButton, {
                [styles.newButtonActive]: isDraft,
              })}
              onClick={onNewConversation}
              disabled={interactionLocked}
              aria-label={TEXT.workspace.newConversationAria}
              aria-pressed={isDraft}
              startIcon={<Add />}
            >
              {TEXT.workspace.newConversation}
            </Button>
          )}
        </div>

        {isGuest ? (
          <p className={styles.hint}>{TEXT.workspace.guestHint}</p>
        ) : (
          <div className={styles.listPane}>
            {listError ? (
              <div className={styles.errorBanner} role="alert">
                <p>{listError}</p>
                <button type="button" className={styles.retryButton} onClick={onRetryList}>
                  {TEXT.workspace.retry}
                </button>
              </div>
            ) : null}

            {showInitialLoading ? (
              <p className={styles.hint}>{TEXT.workspace.loading}</p>
            ) : conversations.length === 0 && !listError ? (
              <p className={styles.hint}>{TEXT.workspace.empty}</p>
            ) : (
              <ul className={styles.list} aria-label={TEXT.workspace.listAria}>
                {conversations.map((conversation) => {
                  const selected =
                    conversation.conversation_id === activeConversationId;
                  return (
                    <li key={conversation.conversation_id}>
                      <button
                        type="button"
                        className={classNames(styles.item, {
                          [styles.itemActive]: selected,
                        })}
                        disabled={interactionLocked}
                        aria-current={selected ? "page" : undefined}
                        onClick={() =>
                          onSelectConversation(conversation.conversation_id)
                        }
                      >
                        <span className={styles.itemTitle}>
                          {conversationDisplayTitle(conversation)}
                        </span>
                        <span className={styles.itemMeta}>
                          {formatConversationTimestamp(conversation.created_at)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
