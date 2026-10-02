import type { SessionInfo } from "../shared/contracts";

export const requiresPasswordChange = (session: SessionInfo): boolean =>
  session.state === "active" && Boolean(session.member?.mustChangePassword);
