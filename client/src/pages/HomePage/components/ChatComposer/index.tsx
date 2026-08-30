import classNames from "classnames";
import { TEXT } from "@/constant";
import styles from "./index.module.less";

interface Props {
  draft: string;
  imagePreview: string;
  disabled: boolean;
  sending: boolean;
  stopping: boolean;
  onDraftChange: (value: string) => void;
  onPickFile: (file: File | null) => void;
  onSend: () => void;
  onStop: () => void;
}

/** 主聊天输入区：草稿、可选图片、发送 / 停止。 */
export function ChatComposer({
  draft,
  imagePreview,
  disabled,
  sending,
  stopping,
  onDraftChange,
  onPickFile,
  onSend,
  onStop,
}: Props) {
  return (
    <div className={styles.inputArea}>
      <div className={styles.inputCard}>
        <textarea
          value={draft}
          disabled={disabled}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!sending) onSend();
            }
          }}
          placeholder={TEXT.chat.composerPlaceholder}
        />
        <div className={styles.inputActions}>
          <label className={styles.fileInput}>
            <span>{TEXT.chat.uploadImage}</span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              disabled={disabled}
              onChange={(event) =>
                onPickFile(event.target.files?.[0] ?? null)
              }
            />
          </label>
          <div className={styles.actionButtons}>
            <button
              type="button"
              className={classNames(styles.sendButton, {
                [styles.stopButton]: sending,
              })}
              onClick={() => {
                if (sending) onStop();
                else onSend();
              }}
              disabled={stopping}
            >
              {stopping
                ? TEXT.chat.stopping
                : sending
                  ? TEXT.chat.stop
                  : TEXT.chat.send}
            </button>
          </div>
        </div>
        {imagePreview ? (
          <img
            src={imagePreview}
            alt={TEXT.chat.imagePreviewAlt}
            className={styles.previewImage}
          />
        ) : null}
      </div>
    </div>
  );
}
