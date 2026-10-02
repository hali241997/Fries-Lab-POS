import type { PosErrorCode } from "../shared/contracts";

type ErrorMessageOverrides = Partial<Record<PosErrorCode, string>>;

const USER_ERROR_MESSAGES: Partial<Record<PosErrorCode, string>> = {
  AUTH_REQUIRED: "Your session is no longer valid. Please sign in again.",
  SESSION_LOCKED: "Your session is locked. Please unlock it to continue.",
  OFFLINE_LEASE_EXPIRED:
    "Offline access has expired. Connect to the internet and unlock the app.",
  FORBIDDEN: "You do not have permission to do that.",
  ONLINE_REQUIRED: "Connect to the internet and try again.",
  CONFLICT:
    "This information changed on another computer. Refresh and try again.",
  SYNC_ERROR:
    "We could not reach the online service. Check your connection and try again.",
  POS_IPC_ERROR: "Something went wrong in the app. Please try again.",
};

const errorCode = (error: unknown): PosErrorCode | null => {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = error.code;
  return typeof code === "string" && code in USER_ERROR_MESSAGES
    ? (code as PosErrorCode)
    : code === "VALIDATION_ERROR"
      ? code
      : null;
};

export const userErrorMessage = (
  error: unknown,
  fallback: string,
  overrides: ErrorMessageOverrides = {},
): string => {
  const code = errorCode(error);
  if (!code) return fallback;
  return overrides[code] ?? USER_ERROR_MESSAGES[code] ?? fallback;
};
