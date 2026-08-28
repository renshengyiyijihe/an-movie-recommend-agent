import { useEffect, useState } from "react";
import classNames from "classnames";
import Modal from "@mui/material/Modal";
import { TEXT } from "@/constant";
import AccountPane from "./AccountPane";
import ChangePasswordForm from "./ChangePasswordForm";
import styles from "./index.module.less";

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** 配置弹窗左侧目录。新增设置页时加一项，右侧按 id 切详情。 */
const CONFIG_SECTION = {
  /** 帐户资料（用户名、邮箱、改密）。 */
  ACCOUNT: "account",
} as const;

type ConfigSection = (typeof CONFIG_SECTION)[keyof typeof CONFIG_SECTION];

const CONFIG_NAV: { id: ConfigSection; label: string }[] = [
  { id: CONFIG_SECTION.ACCOUNT, label: TEXT.config.accountNav },
];

function PasswordDialog({
  open,
  onClose,
  onSessionExpired,
}: {
  open: boolean;
  onClose: () => void;
  onSessionExpired: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="change-password-title"
      aria-describedby="change-password-description"
    >
      <div className={styles.detailOverlay} role="dialog" aria-modal="true">
        <div className={styles.accountDialog}>
          <div className={styles.detailHeader}>
            <div>
              <h3 id="change-password-title">{TEXT.config.changePassword}</h3>
              <p id="change-password-description" className={styles.detailSubtitle}>
                {TEXT.config.changePasswordHint}
              </p>
            </div>
            <button
              type="button"
              className={styles.detailCloseButton}
              onClick={onClose}
              aria-label={TEXT.config.closeChangePasswordAria}
            >
              ×
            </button>
          </div>
          <ChangePasswordForm
            visible={open}
            onClose={onClose}
            onSessionExpired={onSessionExpired}
          />
        </div>
      </div>
    </Modal>
  );
}

export default function ConfigModal({ visible, onClose }: Props) {
  const [section, setSection] = useState<ConfigSection>(CONFIG_SECTION.ACCOUNT);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  useEffect(() => {
    if (visible) return;
    setSection(CONFIG_SECTION.ACCOUNT);
    setPasswordDialogOpen(false);
  }, [visible]);

  function handleClose() {
    setPasswordDialogOpen(false);
    onClose();
  }

  const activeNav =
    CONFIG_NAV.find((item) => item.id === section) ?? CONFIG_NAV[0];

  return (
    <>
      <Modal
        open={visible}
        onClose={handleClose}
        disableEnforceFocus={passwordDialogOpen}
        aria-labelledby="config-modal-title"
        aria-describedby="config-modal-description"
      >
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.dialog}>
            <div className={styles.header}>
              <div>
                <h3 id="config-modal-title" className={styles.title}>
                  {TEXT.config.title}
                </h3>
                <p id="config-modal-description" className={styles.description}>
                  {TEXT.config.description}
                </p>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={handleClose}
                aria-label={TEXT.config.closeAria}
              >
                ×
              </button>
            </div>

            <div className={styles.body}>
              <nav className={styles.navPane} aria-label={TEXT.config.navAria}>
                <ul className={styles.navList}>
                  {CONFIG_NAV.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={classNames(styles.navItem, {
                          [styles.navItemActive]: item.id === section,
                        })}
                        aria-current={item.id === section ? "true" : undefined}
                        onClick={() => setSection(item.id)}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className={styles.detailPane}>
                <h4 className={styles.detailTitle}>{activeNav.label}</h4>
                {section === CONFIG_SECTION.ACCOUNT ? (
                  <AccountPane
                    onChangePassword={() => setPasswordDialogOpen(true)}
                    onSessionExpired={handleClose}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <PasswordDialog
        open={passwordDialogOpen}
        onClose={() => setPasswordDialogOpen(false)}
        onSessionExpired={handleClose}
      />
    </>
  );
}
