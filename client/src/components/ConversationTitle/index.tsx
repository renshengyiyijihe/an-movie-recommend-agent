import { useLayoutEffect, useRef, useState } from "react";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import EditOutlined from "@mui/icons-material/EditOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import ConfirmPopover from "@/components/ConfirmPopover";
import { ApiError, isSessionExpiredError, request } from "@/api";
import {
  CONVERSATION_TITLE_MAX_LENGTH,
  conversationDetailPath,
  TEXT,
} from "@/constant";
import { useConfirmableEdit } from "@/hooks/useConfirmableEdit";
import { toast } from "@/store/toast";
import styles from "./index.module.less";

interface Props {
  /** 当前展示用的标题（列表 / 详情 / 首条用户问题）。 */
  title: string;
  /** 已落库的会话 id；没有时不能 PATCH。 */
  conversationId?: string;
  /** 未登录或还没有 id 时只展示。 */
  editable: boolean;
  /** 不能编辑时锁图标 Tooltip 的原因；可编辑时忽略。 */
  disabledReason: string;
  onRenamed: (conversationId: string, title: string) => void;
  onSessionExpired: () => void;
}

export default function ConversationTitle({
  title,
  conversationId,
  editable,
  disabledReason,
  onRenamed,
  onSessionExpired,
}: Props) {
  const [overflowing, setOverflowing] = useState(false);
  const labelRef = useRef<HTMLElement | null>(null);

  const edit = useConfirmableEdit({
    value: title,
    resetKey: conversationId,
    enabled: editable,
    validate: (draft) => {
      if (!draft || draft === title) return { type: "discard" };
      if (draft.length > CONVERSATION_TITLE_MAX_LENGTH) {
        return { type: "invalid", message: TEXT.workspace.titleTooLong };
      }
      return { type: "confirm" };
    },
    commit: async (next) => {
      if (!conversationId) {
        throw new Error(TEXT.workspace.titleSaveFailed);
      }
      try {
        const result = await request<{
          conversation_id: string;
          title?: string | null;
        }>({
          method: "PATCH",
          url: conversationDetailPath(conversationId),
          data: { title: next },
        });
        const saved = result.title?.trim() || next;
        onRenamed(result.conversation_id || conversationId, saved);
      } catch (err) {
        if (isSessionExpiredError(err)) {
          onSessionExpired();
          throw err;
        }
        toast.error(
          err instanceof ApiError && err.message
            ? err.message
            : TEXT.workspace.titleSaveFailed,
        );
        throw err;
      }
    },
  });

  useLayoutEffect(() => {
    if (edit.editing) {
      setOverflowing(false);
      return;
    }

    const el = labelRef.current;
    if (!el) return;

    function measure() {
      const node = labelRef.current;
      if (!node) return;
      setOverflowing(node.scrollWidth - node.clientWidth > 1);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [title, edit.editing, editable]);

  const label = editable ? (
    <button
      ref={(node) => {
        labelRef.current = node;
      }}
      type="button"
      className={styles.titleButton}
      onClick={edit.beginEdit}
      aria-label={`${title}，${TEXT.workspace.editTitleAria}`}
    >
      {title}
    </button>
  ) : (
    <h2
      ref={(node) => {
        labelRef.current = node;
      }}
      className={styles.titleText}
    >
      {title}
    </h2>
  );

  return (
    <div ref={edit.slotRef} className={styles.slot}>
      {edit.editing ? (
        <>
          <TextField
            className={styles.titleField}
            variant="standard"
            value={edit.draft}
            autoFocus
            fullWidth
            disabled={edit.saving}
            onChange={(event) => edit.setDraft(event.target.value)}
            onFocus={(event) => {
              if (!edit.confirming) event.target.select();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (edit.confirming) {
                  void edit.commitEdit();
                } else {
                  edit.askConfirm();
                }
              }
              if (event.key === "Escape") {
                event.preventDefault();
                edit.cancelEdit();
              }
            }}
            slotProps={{
              htmlInput: {
                readOnly: edit.confirming || edit.saving,
                maxLength: Math.max(CONVERSATION_TITLE_MAX_LENGTH, title.length),
                "aria-label": TEXT.workspace.editTitleAria,
                autoComplete: "off",
                spellCheck: false,
              },
            }}
          />
          <ConfirmPopover
            open={edit.confirming}
            anchorEl={edit.slotRef.current}
            labelledBy="confirm-rename-title"
            message={TEXT.workspace.confirmRename}
            confirmLabel={TEXT.workspace.confirmRenameAction}
            cancelLabel={TEXT.workspace.cancelRename}
            saving={edit.saving}
            onConfirm={() => {
              void edit.commitEdit();
            }}
            onCancel={edit.cancelEdit}
          />
        </>
      ) : (
        <div className={styles.displayRow}>
          <Tooltip
            title={title}
            placement="bottom-start"
            enterDelay={400}
            disableHoverListener={!overflowing}
            disableInteractive
          >
            <span className={styles.titleTooltipWrap}>{label}</span>
          </Tooltip>
          {editable ? (
            <Tooltip
              title={TEXT.workspace.editTitleHint}
              placement="bottom"
              disableInteractive
            >
              <IconButton
                type="button"
                size="small"
                className={styles.editButton}
                onClick={edit.beginEdit}
                aria-label={TEXT.workspace.editTitleAria}
              >
                <EditOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title={disabledReason} placement="bottom" disableInteractive>
              <span
                className={styles.lockIcon}
                tabIndex={0}
                role="img"
                aria-label={disabledReason}
              >
                <LockOutlined fontSize="small" />
              </span>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}
