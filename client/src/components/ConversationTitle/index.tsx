import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Button from "@mui/material/Button";
import Popover from "@mui/material/Popover";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import { ApiError, isSessionExpiredError, request } from "@/api";
import {
  CONVERSATION_TITLE_MAX_LENGTH,
  conversationDetailPath,
  TEXT,
} from "@/constant";
import { toast } from "@/store/toast";
import styles from "./index.module.less";

interface Props {
  /** 当前展示用的标题（列表 / 详情 / 首条用户问题）。 */
  title: string;
  /** 已落库的会话 id；没有时不能 PATCH。 */
  conversationId?: string;
  /** 未登录或还没有 id 时只展示。 */
  editable: boolean;
  onRenamed: (conversationId: string, title: string) => void;
  onSessionExpired: () => void;
}

export default function ConversationTitle({
  title,
  conversationId,
  editable,
  onRenamed,
  onSessionExpired,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(title);
  const [overflowing, setOverflowing] = useState(false);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLElement | null>(null);
  const draftRef = useRef(draft);
  const titleRef = useRef(title);
  const cancelledRef = useRef(false);
  const committingRef = useRef(false);
  const confirmingRef = useRef(false);
  const saveGen = useRef(0);
  const askConfirmRef = useRef<() => void>(() => {});
  const cancelEditRef = useRef<() => void>(() => {});

  draftRef.current = draft;
  titleRef.current = title;

  useEffect(() => {
    saveGen.current += 1;
    cancelledRef.current = true;
    committingRef.current = false;
    confirmingRef.current = false;
    setConfirming(false);
    setEditing(false);
    setSaving(false);
    setDraft(titleRef.current);
  }, [conversationId]);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useLayoutEffect(() => {
    if (editing) {
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
  }, [title, editing, editable]);

  function beginEdit() {
    if (!editable || saving) return;
    cancelledRef.current = false;
    committingRef.current = false;
    confirmingRef.current = false;
    setConfirming(false);
    setDraft(title);
    setEditing(true);
  }

  function cancelEdit() {
    cancelledRef.current = true;
    committingRef.current = false;
    confirmingRef.current = false;
    setConfirming(false);
    setEditing(false);
    setDraft(titleRef.current);
    setSaving(false);
  }

  function askConfirm() {
    if (cancelledRef.current || committingRef.current || confirmingRef.current) {
      return;
    }
    const next = draftRef.current.trim();
    if (!next || next === titleRef.current) {
      cancelEdit();
      return;
    }
    if (next.length > CONVERSATION_TITLE_MAX_LENGTH) {
      toast.error(TEXT.workspace.titleTooLong);
      return;
    }
    confirmingRef.current = true;
    setConfirming(true);
  }

  async function commitEdit() {
    if (cancelledRef.current || committingRef.current) return;
    const next = draftRef.current.trim();
    if (!next || next === titleRef.current) {
      cancelEdit();
      return;
    }
    if (next.length > CONVERSATION_TITLE_MAX_LENGTH) {
      toast.error(TEXT.workspace.titleTooLong);
      return;
    }
    if (!conversationId) {
      cancelEdit();
      return;
    }

    committingRef.current = true;
    const gen = ++saveGen.current;
    setSaving(true);
    try {
      const result = await request<{
        conversation_id: string;
        title?: string | null;
      }>({
        method: "PATCH",
        url: conversationDetailPath(conversationId),
        data: { title: next },
      });
      if (gen !== saveGen.current) return;
      const saved = result.title?.trim() || next;
      confirmingRef.current = false;
      setConfirming(false);
      setEditing(false);
      setDraft(saved);
      onRenamed(result.conversation_id || conversationId, saved);
    } catch (err) {
      if (gen !== saveGen.current) return;
      if (isSessionExpiredError(err)) {
        onSessionExpired();
        return;
      }
      toast.error(
        err instanceof ApiError && err.message
          ? err.message
          : TEXT.workspace.titleSaveFailed,
      );
    } finally {
      if (gen === saveGen.current) {
        committingRef.current = false;
        setSaving(false);
      }
    }
  }

  askConfirmRef.current = askConfirm;
  cancelEditRef.current = cancelEdit;

  useEffect(() => {
    if (!editing || confirming) return;

    function onMouseDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target || slotRef.current?.contains(target)) return;

      const next = draftRef.current.trim();
      if (!next || next === titleRef.current) {
        cancelEditRef.current();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      askConfirmRef.current();
    }

    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [editing, confirming]);

  const label = (
    editable ? (
      <button
        ref={(node) => {
          labelRef.current = node;
        }}
        type="button"
        className={styles.titleButton}
        onClick={beginEdit}
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
    )
  );

  return (
    <div ref={slotRef} className={styles.slot}>
      {editing ? (
        <>
          <TextField
            className={styles.titleField}
            variant="standard"
            value={draft}
            autoFocus
            fullWidth
            disabled={saving}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => {
              if (!confirming) event.target.select();
            }}
            onBlur={() => {
              if (confirmingRef.current) return;
              askConfirm();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                askConfirm();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEdit();
              }
            }}
            slotProps={{
              htmlInput: {
                readOnly: confirming || saving,
                maxLength: Math.max(CONVERSATION_TITLE_MAX_LENGTH, title.length),
                "aria-label": TEXT.workspace.editTitleAria,
                autoComplete: "off",
                spellCheck: false,
              },
            }}
          />
          <Popover
            open={confirming}
            anchorEl={slotRef.current}
            onClose={() => {
              if (saving) return;
              cancelEdit();
            }}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            disableRestoreFocus
            aria-labelledby="confirm-rename-title"
            slotProps={{
              paper: { className: styles.confirmPaper, elevation: 3 },
            }}
          >
            <p id="confirm-rename-title" className={styles.confirmMessage}>
              {TEXT.workspace.confirmRename}
            </p>
            <div className={styles.confirmActions}>
              <Button
                type="button"
                size="small"
                variant="contained"
                disabled={saving}
                onClick={() => {
                  void commitEdit();
                }}
              >
                {TEXT.workspace.confirmRenameAction}
              </Button>
              <Button
                type="button"
                size="small"
                disabled={saving}
                onClick={cancelEdit}
              >
                {TEXT.workspace.cancelRename}
              </Button>
            </div>
          </Popover>
        </>
      ) : (
        <Tooltip
          title={title}
          placement="bottom-start"
          enterDelay={400}
          disableHoverListener={!overflowing}
          disableInteractive
        >
          {label}
        </Tooltip>
      )}
    </div>
  );
}
