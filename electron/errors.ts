import type { PosErrorCode, SerializedIpcError } from "../shared/contracts";

export class PosError extends Error {
  readonly code: PosErrorCode;

  constructor(code: PosErrorCode, message: string) {
    super(message);
    this.name = "PosError";
    this.code = code;
  }
}

export function serializeError(error: unknown): SerializedIpcError {
  if (error instanceof PosError)
    return { name: error.name, message: error.message, code: error.code };
  if (error instanceof Error)
    return {
      name: error.name,
      message: "Something went wrong in the app. Please try again.",
      code: "POS_IPC_ERROR",
    };
  return {
    name: "Error",
    message: "Something went wrong in the app. Please try again.",
    code: "POS_IPC_ERROR",
  };
}
