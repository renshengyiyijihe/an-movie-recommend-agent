import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import EditOutlined from "@mui/icons-material/EditOutlined";
import ConfirmPopover from "@/components/ConfirmPopover";
import { ApiError, isSessionExpiredError } from "@/api";
import {
  AUTH_USERNAME_MAX_LENGTH,
  AUTH_USERNAME_MIN_LENGTH,
  TEXT,
} from "@/constant";
import { useConfirmableEdit } from "@/hooks/useConfirmableEdit";
import useAuth from "@/store/auth";
import { toast } from "@/store/toast";
import styles from "./index.module.less";

interface Props {
  onChangePassword: () => void;
  onSessionExpired: () => void;
}

function formatChangeUsernameError(err: unknown): string {
  if (err instanceof ApiError && err.code && err.code in TEXT.errors) {
    return TEXT.errors[err.code as keyof typeof TEXT.errors];
  }
  if (err instanceof Error && err.message) return err.message;
  return TEXT.config.usernameSaveFailed;
}

export default function AccountPane({
  onChangePassword,
  onSessionExpired,
}: Props) {
  const user = useAuth((s) => s.user);
  const changeUsername = useAuth((s) => s.changeUsername);
  const username = user?.username ?? "";

  const edit = useConfirmableEdit({
    value: username,
    enabled: Boolean(user),
    validate: (draft) => {
      if (!draft || draft === username) return { type: "discard" };
      if (draft.length < AUTH_USERNAME_MIN_LENGTH) {
        return { type: "invalid", message: TEXT.auth.usernameMin };
      }
      if (draft.length > AUTH_USERNAME_MAX_LENGTH) {
        return { type: "invalid", message: TEXT.auth.usernameMax };
      }
      return { type: "confirm" };
    },
    commit: async (next) => {
      try {
        await changeUsername(next);
      } catch (err) {
        if (isSessionExpiredError(err)) {
          onSessionExpired();
          throw err;
        }
        toast.error(formatChangeUsernameError(err));
        throw err;
      }
    },
  });

  function handleChangePassword() {
    edit.cancelEdit();
    onChangePassword();
  }

  return (
    <div className={styles.accountPane}>
      {user ? (
        <dl className={styles.profileList}>
          <div className={styles.profileRow}>
            <dt>{TEXT.config.usernameLabel}</dt>
            <dd>
              <div ref={edit.slotRef} className={styles.usernameSlot}>
                {edit.editing ? (
                  <>
                    <TextField
                      className={styles.usernameField}
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
                          maxLength: AUTH_USERNAME_MAX_LENGTH,
                          "aria-label": TEXT.config.editUsernameAria,
                          autoComplete: "username",
                          spellCheck: false,
                        },
                      }}
                    />
                    <ConfirmPopover
                      open={edit.confirming}
                      anchorEl={edit.slotRef.current}
                      labelledBy="confirm-change-username"
                      message={TEXT.config.confirmUsername}
                      confirmLabel={TEXT.config.confirmUsernameAction}
                      cancelLabel={TEXT.config.cancelUsername}
                      saving={edit.saving}
                      onConfirm={() => {
                        void edit.commitEdit();
                      }}
                      onCancel={edit.cancelEdit}
                    />
                  </>
                ) : (
                  <>
                    <span className={styles.usernameValue}>{user.username}</span>
                    <IconButton
                      type="button"
                      size="small"
                      className={styles.editButton}
                      onClick={edit.beginEdit}
                      aria-label={TEXT.config.editUsernameAria}
                    >
                      <EditOutlined fontSize="small" />
                    </IconButton>
                  </>
                )}
              </div>
            </dd>
          </div>

          <div className={styles.profileRow}>
            <dt>{TEXT.config.emailLabel}</dt>
            <dd className={styles.emailValue}>{user.email}</dd>
          </div>

          <div className={styles.profileRow}>
            <dt>{TEXT.auth.password}</dt>
            <dd>
              <button
                type="button"
                className={styles.passwordButton}
                onClick={handleChangePassword}
              >
                {TEXT.config.changePassword}
              </button>
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
