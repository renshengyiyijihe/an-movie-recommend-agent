import { useState } from 'react';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
} from 'react-hook-form';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

export interface AuthFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  rules?: RegisterOptions<T, FieldPath<T>>;
  label: string;
  type?: 'text' | 'email';
  autoComplete?: string;
  autoFocus?: boolean;
  placeholder?: string;
  passwordToggle?: boolean;
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
  onAfterChange?: () => void;
}

const FIELD_SX = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '14px',
    backgroundColor: '#f8fafc',
  },
} as const;

export default function AuthField<T extends FieldValues>({
  control,
  name,
  rules,
  label,
  type = 'text',
  autoComplete,
  autoFocus,
  placeholder,
  passwordToggle = false,
  showPasswordLabel,
  hidePasswordLabel,
  onAfterChange,
}: AuthFieldProps<T>) {
  const [visible, setVisible] = useState(false);
  const inputType = passwordToggle ? (visible ? 'text' : 'password') : type;

  return (
    <Controller
      name={name}
      control={control}
      rules={rules}
      render={({ field: { ref, onChange, ...field }, fieldState }) => (
        <TextField
          {...field}
          inputRef={ref}
          type={inputType}
          label={label}
          autoFocus={autoFocus}
          placeholder={placeholder}
          fullWidth
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message}
          sx={FIELD_SX}
          onChange={(event) => {
            onChange(event);
            onAfterChange?.();
          }}
          slotProps={{
            htmlInput: {
              autoComplete,
              spellCheck: passwordToggle ? false : undefined,
              inputMode: type === 'email' ? 'email' : undefined,
            },
            input: passwordToggle
              ? {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        type="button"
                        edge="end"
                        aria-label={visible ? hidePasswordLabel : showPasswordLabel}
                        aria-pressed={visible}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setVisible((open) => !open)}
                      >
                        {visible ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }
              : undefined,
          }}
        />
      )}
    />
  );
}
