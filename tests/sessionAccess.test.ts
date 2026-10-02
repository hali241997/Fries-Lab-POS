import { describe, expect, it } from "vitest";
import type { SessionInfo } from "../shared/contracts";
import { requiresPasswordChange } from "../src/sessionAccess";

const session = (mustChangePassword: boolean): SessionInfo => ({
  state: "active",
  member: {
    id: "owner-1",
    employeeId: "OWNER-001",
    name: "Owner",
    role: "owner",
    permissions: [],
    mustChangePassword,
  },
  lockReason: null,
  connectivity: {
    state: "online",
    lastCheckedAt: null,
    lastSyncAt: null,
    offlineLeaseExpiresAt: null,
    offlineLeaseRemainingMs: null,
    pendingOutboxCount: 0,
    permanentErrorCount: 0,
    conflictCount: 0,
    message: "Online",
  },
});

describe("session access", () => {
  it("keeps the POS unavailable until the required password change completes", () => {
    expect(requiresPasswordChange(session(true))).toBe(true);
    expect(requiresPasswordChange(session(false))).toBe(false);
  });
});
