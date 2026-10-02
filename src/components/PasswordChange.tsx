import { useCallback, useState, FC, ChangeEvent, FormEvent } from "react";
import type { SessionInfo } from "../../shared/contracts";
import { userErrorMessage } from "../userError";
import PasswordInput from "./PasswordInput";

interface PasswordChangeProps {
  onChanged: (session: SessionInfo) => void;
}

const PasswordChange: FC<PasswordChangeProps> = ({ onChanged }) => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordsMatch = newPassword === confirmPassword;
  const hasPasswordMismatch = confirmPassword.length > 0 && !passwordsMatch;

  const changeNewPassword = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setNewPassword(event.target.value);
      setError("");
    },
    [],
  );

  const changeConfirmPassword = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setConfirmPassword(event.target.value);
      setError("");
    },
    [],
  );

  const submit = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault();
      setError("");
      if (!passwordsMatch) {
        setError("Passwords do not match.");
        return;
      }
      setBusy(true);
      try {
        onChanged(
          await window.pos.changePassword({ newPassword, confirmPassword }),
        );
        void window.pos.syncNow();
      } catch (caught: unknown) {
        setError(
          userErrorMessage(
            caught,
            "We could not change your password. Choose a different password and try again.",
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [confirmPassword, newPassword, onChanged, passwordsMatch],
  );

  return (
    <div className="fixed inset-0 bg-brand-navy z-[100] grid place-items-center p-6">
      <form
        onSubmit={submit}
        className="bg-white rounded-3xl p-8 w-full max-w-md space-y-4"
      >
        <h1 className="font-display font-bold text-2xl">
          Create a new password
        </h1>
        <p className="text-sm text-brand-muted font-semibold">
          Your temporary password must be replaced before using the POS.
        </p>
        <div>
          <label
            htmlFor="new-password"
            className="block text-xs font-bold uppercase text-brand-muted mb-1"
          >
            New password
          </label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            placeholder="At least 10 characters"
            value={newPassword}
            onChange={changeNewPassword}
            className="w-full px-4 py-3 rounded-xl bg-brand-cream border"
          />
        </div>
        <div>
          <label
            htmlFor="confirm-new-password"
            className="block text-xs font-bold uppercase text-brand-muted mb-1"
          >
            Confirm new password
          </label>
          <PasswordInput
            id="confirm-new-password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={changeConfirmPassword}
            className={`w-full px-4 py-3 rounded-xl bg-brand-cream border ${hasPasswordMismatch ? "border-brand-red" : ""}`}
            aria-invalid={hasPasswordMismatch}
            aria-describedby={
              hasPasswordMismatch ? "password-match-message" : undefined
            }
          />
          {hasPasswordMismatch && (
            <p
              id="password-match-message"
              className="text-brand-red text-xs font-bold mt-1"
            >
              Passwords do not match.
            </p>
          )}
        </div>
        {error && <p className="text-brand-red text-sm font-bold">{error}</p>}
        <button
          disabled={
            busy ||
            newPassword.length < 10 ||
            !confirmPassword ||
            !passwordsMatch
          }
          className="w-full py-3 rounded-xl bg-brand-red text-white font-bold disabled:opacity-40"
        >
          {busy ? "Changing password…" : "Change password"}
        </button>
      </form>
    </div>
  );
};

export default PasswordChange;
