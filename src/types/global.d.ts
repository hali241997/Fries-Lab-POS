import type { PosApi } from "../../shared/contracts";

declare global {
  interface Window {
    pos: PosApi
  }
}

export {};
