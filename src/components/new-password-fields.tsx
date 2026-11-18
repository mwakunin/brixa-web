"use client";

import { useRef, useState } from "react";

import { TextField } from "@/components/text-field";
import { en } from "@/strings/en";

/**
 * A new password, typed twice, for accepting an invitation and for resetting
 * a forgotten password. The two must match before anything is sent; whether
 * the password is long enough is the API's to say.
 *
 * `onEdit` runs on every keystroke, so a form clears a message that no longer
 * applies.
 */
export function useNewPassword(onEdit: () => void) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const confirmRef = useRef<HTMLInputElement>(null);

  return {
    password,
    fields: {
      password,
      confirm,
      confirmRef,
      onPasswordChange: (value: string) => {
        setPassword(value);
        onEdit();
      },
      onConfirmChange: (value: string) => {
        setConfirm(value);
        onEdit();
      },
    },
    /** Whether the two match. When they do not, the second is cleared and the cursor put back in it. */
    matches(): boolean {
      if (password === confirm)
        return true;
      setConfirm("");
      confirmRef.current?.focus();
      return false;
    },
  };
}

interface NewPasswordFieldsProps {
  /** What the first field asks for: "Choose a password", "New password". */
  label: string;
  required?: boolean;
  /** While a request runs: what was sent stays what the page shows. */
  readOnly?: boolean;
  password: string;
  confirm: string;
  confirmRef: React.Ref<HTMLInputElement>;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
}

export function NewPasswordFields({ label, required, readOnly, password, confirm, confirmRef, onPasswordChange, onConfirmChange }: NewPasswordFieldsProps) {
  return (
    <>
      <TextField label={label} hint={en.newPassword.hint} type="password" name="password" autoComplete="new-password" required={required} readOnly={readOnly} value={password} onChange={event => onPasswordChange(event.target.value)} />
      <TextField ref={confirmRef} label={en.newPassword.confirm} type="password" name="confirm" autoComplete="new-password" required={required} readOnly={readOnly} value={confirm} onChange={event => onConfirmChange(event.target.value)} />
    </>
  );
}
