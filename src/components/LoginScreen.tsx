import { useCallback, useState, FC, FormEvent } from "react";
import logo from "../assets/logo.png";
import type { SessionInfo } from "../../shared/contracts";
import { userErrorMessage } from "../userError";
import PasswordInput from "./PasswordInput";

interface LoginScreenProps {
  onAuthenticated: (session: SessionInfo) => void;
}

const LoginScreen: FC<LoginScreenProps> = ({ onAuthenticated }) => {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault();
      setBusy(true);
      setError("");
      try {
        onAuthenticated(await window.pos.login({ employeeId, password }));
      } catch (caught: unknown) {
        setError(
          userErrorMessage(
            caught,
            "We could not sign you in. Please try again.",
            {
              AUTH_REQUIRED:
                "The employee ID or password is incorrect. Please try again.",
            },
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [employeeId, onAuthenticated, password],
  );

  return (
    <div className="h-screen bg-brand-cream grid place-items-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-3xl shadow-pos p-8 space-y-5"
      >
        <div className="text-center">
          <img
            src={logo}
            alt="Fries Lab"
            className="w-20 h-20 rounded-2xl mx-auto mb-4"
          />
          <h1 className="font-display font-bold text-2xl text-brand-navy">
            Employee login
          </h1>
          <p className="text-sm text-brand-muted font-semibold mt-1">
            Internet is required every time the app opens.
          </p>
        </div>
        <label className="block text-xs font-bold uppercase text-brand-muted">
          Employee ID
          <input
            autoFocus
            value={employeeId}
            onChange={(event) =>
              setEmployeeId(event.target.value.toUpperCase())
            }
            className="mt-1 w-full px-4 py-3 rounded-xl bg-brand-cream border"
          />
        </label>
        <div>
          <label
            htmlFor="login-password"
            className="block text-xs font-bold uppercase text-brand-muted mb-1"
          >
            Password
          </label>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-brand-cream border"
          />
        </div>
        {error && (
          <p className="text-sm font-semibold text-brand-red">{error}</p>
        )}
        <button
          disabled={busy || !employeeId.trim() || !password}
          className="w-full py-3 rounded-xl bg-brand-red text-white font-bold disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
};

export default LoginScreen;
