import { useState, type ReactNode } from "react";
import { Modal } from "@mui/material";
import { TEXT } from "@/constant";
import AccountPane from "./AccountPane";
import ChangePasswordForm from "./ChangePasswordForm";
import ChangeUsernameForm from "./ChangeUsernameForm";
import styles from "./index.module.less";

interface Props {
  visible: boolean;
  onClose: () => void;
}

function AccountActionDialog({
  open,
  titleId,
  descriptionId,
  title,
  description,
  closeAria,
  onClose,
  children,
}: {
  open: boolean;
  titleId: string;
  descriptionId: string;
  title: string;
  description: string;
  closeAria: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className={styles.detailOverlay} role="dialog" aria-modal="true">
        <div className={styles.accountDialog}>
          <div className={styles.detailHeader}>
            <div>
              <h3 id={titleId}>{title}</h3>
              <p id={descriptionId} className={styles.detailSubtitle}>
                {description}
              </p>
            </div>
            <button
              className={styles.detailCloseButton}
              onClick={onClose}
              aria-label={closeAria}
            >
              ×
            </button>
          </div>
          {children}
        </div>
      </div>
    </Modal>
  );
}

export default function ConfigModal({ visible, onClose }: Props) {
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false);

  function closeAccountDialogs() {
    setPasswordDialogOpen(false);
    setUsernameDialogOpen(false);
  }

  function handleClose() {
    closeAccountDialogs();
    onClose();
  }

  return (
    <>
      <Modal
        open={visible}
        onClose={handleClose}
        disableEnforceFocus={passwordDialogOpen || usernameDialogOpen}
        aria-labelledby="config-modal-title"
        aria-describedby="config-modal-description"
      >
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <h3 id="config-modal-title" className={styles.modalTitle}>
                  {TEXT.config.title}
                </h3>
                <p
                  id="config-modal-description"
                  className={styles.modalDescription}
                >
                  {TEXT.config.description}
                </p>
              </div>
              <button
                className={styles.closeButton}
                onClick={handleClose}
                aria-label={TEXT.config.closeAria}
              >
                ×
              </button>
            </div>
            {visible ? (
              <AccountPane
                onChangeUsername={() => setUsernameDialogOpen(true)}
                onChangePassword={() => setPasswordDialogOpen(true)}
              />
            ) : null}
          </div>
        </div>
      </Modal>

      <AccountActionDialog
        open={usernameDialogOpen}
        titleId="change-username-title"
        descriptionId="change-username-description"
        title={TEXT.config.changeUsername}
        description={TEXT.config.changeUsernameHint}
        closeAria={TEXT.config.closeChangeUsernameAria}
        onClose={() => setUsernameDialogOpen(false)}
      >
        <ChangeUsernameForm
          visible={usernameDialogOpen}
          onClose={() => setUsernameDialogOpen(false)}
          onSessionExpired={handleClose}
        />
      </AccountActionDialog>

      <AccountActionDialog
        open={passwordDialogOpen}
        titleId="change-password-title"
        descriptionId="change-password-description"
        title={TEXT.config.changePassword}
        description={TEXT.config.changePasswordHint}
        closeAria={TEXT.config.closeChangePasswordAria}
        onClose={() => setPasswordDialogOpen(false)}
      >
        <ChangePasswordForm
          visible={passwordDialogOpen}
          onClose={() => setPasswordDialogOpen(false)}
          onSessionExpired={handleClose}
        />
      </AccountActionDialog>
    </>
  );
}
