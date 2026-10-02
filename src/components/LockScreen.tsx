import { useCallback, useState, FC, FormEvent } from "react";
import type { SessionInfo } from "../../shared/contracts";
import { userErrorMessage } from "../userError";
import PasswordInput from "./PasswordInput";

interface LockScreenProps {
  session: SessionInfo;
  onUnlocked: (session: SessionInfo) => void;
  onSwitch: (session: SessionInfo) => void;
}

const LockScreen: FC<LockScreenProps> = ({ session, onUnlocked, onSwitch }) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const online =
    session.connectivity.state === "online" ||
    session.connectivity.state === "degraded";

  const unlock = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault();
      setBusy(true);
      setError("");
      try {
        onUnlocked(await window.pos.unlock({ password }));
      } catch (caught: unknown) {
        setError(
          userErrorMessage(caught, "We could not unlock the app.", {
            AUTH_REQUIRED: "The password is incorrect. Please try again.",
          }),
        );
      } finally {
        setBusy(false);
      }
    },
    [onUnlocked, password],
  );

  const switchEmployee = useCallback(async (): Promise<void> => {
    setError("");
    try {
      onSwitch(await window.pos.logout());
    } catch (caught: unknown) {
      setError(userErrorMessage(caught, "We could not switch employees."));
    }
  }, [onSwitch]);

  return (
    <div className="h-screen bg-brand-navy grid place-items-center p-6">
      <form
        onSubmit={unlock}
        className="w-full max-w-md bg-white rounded-3xl p-8 space-y-5 text-center"
      >
        <div
          className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${online ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
        >
          {online ? "Online" : "Offline"}
        </div>
        <h1 className="font-display font-bold text-2xl">Session locked</h1>
        <p className="font-semibold">
          {session.member?.name} · {session.member?.employeeId}
        </p>
        <p className="text-sm text-brand-muted">{session.lockReason}</p>
        <p className="text-sm font-bold text-brand-red">
          Internet is required to unlock.
        </p>
        <PasswordInput
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Current password"
          className="w-full px-4 py-3 rounded-xl bg-brand-cream border"
        />
        {error && (
          <p className="text-sm text-brand-red font-semibold">{error}</p>
        )}
        <button
          disabled={!online || !password || busy}
          className="w-full py-3 rounded-xl bg-brand-red text-white font-bold disabled:opacity-50"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
        <button
          type="button"
          onClick={switchEmployee}
          className="text-sm font-bold text-brand-navy"
        >
          Switch employee
        </button>
      </form>
    </div>
  );
};

export default LockScreen;
