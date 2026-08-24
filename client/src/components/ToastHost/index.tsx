import { Alert, Snackbar } from '@mui/material';
import type { SnackbarCloseReason } from '@mui/material/Snackbar';
import { useToastStore } from '@/store/toast';

export default function ToastHost() {
  const open = useToastStore((s) => s.open);
  const message = useToastStore((s) => s.message);
  const severity = useToastStore((s) => s.severity);
  const id = useToastStore((s) => s.id);
  const close = useToastStore((s) => s.close);

  function handleClose(_event?: unknown, reason?: SnackbarCloseReason) {
    if (reason === 'clickaway') return;
    close();
  }

  return (
    <Snackbar
      key={id}
      open={open}
      autoHideDuration={3000}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert onClose={handleClose} severity={severity} variant="filled" sx={{ width: '100%' }}>
        {message}
      </Alert>
    </Snackbar>
  );
}
