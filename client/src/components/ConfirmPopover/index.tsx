import Button from "@mui/material/Button";
import Popover from "@mui/material/Popover";
import styles from "./index.module.less";

interface Props {
  open: boolean;
  anchorEl: HTMLElement | null;
  labelledBy: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 行内编辑的二次确认。锚在编辑槽上，点确认才提交，点取消 / 空白恢复原值。 */
export default function ConfirmPopover({
  open,
  anchorEl,
  labelledBy,
  message,
  confirmLabel,
  cancelLabel,
  saving,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={() => {
        if (saving) return;
        onCancel();
      }}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      disableAutoFocus
      disableRestoreFocus
      aria-labelledby={labelledBy}
      slotProps={{
        paper: { className: styles.paper, elevation: 3 },
      }}
    >
      <p id={labelledBy} className={styles.message}>
        {message}
      </p>
      <div className={styles.actions}>
        <Button
          type="button"
          size="small"
          variant="contained"
          disabled={saving}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
        <Button type="button" size="small" disabled={saving} onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </Popover>
  );
}
