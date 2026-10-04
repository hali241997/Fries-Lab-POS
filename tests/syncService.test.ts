import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CloudClient, SyncResponse } from "../electron/cloud";
import {
  createLocalDatabase,
  type LocalDatabase,
} from "../electron/database/client";
import { PosError } from "../electron/errors";
import type { SessionService } from "../electron/services/sessionService";
import {
  ConnectivityService,
  SYNC_BATCH_SIZE,
} from "../electron/services/syncService";
import { ROLE_DEFAULTS, type SessionMember } from "../shared/contracts";

const member: SessionMember = {
  id: "owner-1",
  employeeId: "OWNER-001",
  name: "Owner",
  role: "owner",
  permissions: [...ROLE_DEFAULTS.owner],
  mustChangePassword: false,
};

const permissionSnapshot = {
  id: "snapshot-1",
  token: "snapshot.signature",
  version: 1,
  issuedAt: "2026-10-04T00:00:00.000Z",
};

function sessionStub(): SessionService {
  return {
    checkLease: () => undefined,
    getInfo: () => ({ state: "active" }),
    getMember: () => member,
    getStoreId: () => "store-1",
    getLeaseExpiresAt: () => null,
    getRemainingLeaseMs: () => null,
    renewFromValidation: async () => undefined,
    lock: () => undefined,
  } as unknown as SessionService;
}

function response(
  cursor: string,
  acceptedOperationIds: string[],
): SyncResponse {
  return {
    cursor,
    acceptedOperationIds,
    permanentErrors: [],
    changes: [],
    member,
    permissionSnapshot,
  };
}

describe("ConnectivityService", () => {
  let directory: string;
  let database: LocalDatabase;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "fries-lab-sync-"));
    database = await createLocalDatabase(directory);
  });

  afterEach(async () => {
    await database.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("uploads pending operations in bounded batches with menu imports first", async () => {
    const operations = Array.from({ length: 45 }, (_, index) => ({
      id: `order-${String(index).padStart(2, "0")}`,
      operationType: index === 0 ? "order.cancelled" : "order.created",
      aggregateType: "order",
      aggregateId: `order-${index}`,
      payloadJson: "{}",
      actorMemberId: member.id,
      terminalId: "device-1",
      permissionSnapshotToken: permissionSnapshot.token,
      occurredAt: new Date(index * 1_000).toISOString(),
      attempts: 0,
      lastError: null,
      status: "pending",
    }));
    operations.push({
      ...operations[0],
      id: "menu-newer-than-orders",
      operationType: "menu.imported",
      aggregateType: "menu_item",
      aggregateId: "menu-1",
      occurredAt: new Date(100_000).toISOString(),
    });
    await database.outboxOperation.createMany({ data: operations });

    const batches: string[][] = [];
    const cloud = {
      sync: async (payload: Record<string, unknown>) => {
        const batch = payload.operations as Array<{ id: string }>;
        batches.push(batch.map((operation) => operation.id));
        return response(String(batches.length), batches.at(-1) ?? []);
      },
      validate: async () => member,
      ping: async () => undefined,
    } as unknown as CloudClient;
    const connectivity = new ConnectivityService(
      database,
      cloud,
      sessionStub(),
    );

    const status = await connectivity.syncNow();

    expect(batches.map((batch) => batch.length)).toEqual([20, 20, 6]);
    expect(batches.every((batch) => batch.length <= SYNC_BATCH_SIZE)).toBe(
      true,
    );
    expect(batches[0]?.[0]).toBe("menu-newer-than-orders");
    expect(batches[0]?.[1]).toBe("order-00");
    expect(await database.outboxOperation.count()).toBe(0);
    expect(status.state).toBe("online");
    expect(status.pendingOutboxCount).toBe(0);
  });

  it("leaves interrupted work pending and permits the next retry", async () => {
    await database.outboxOperation.create({
      data: {
        id: "order-1",
        operationType: "order.imported",
        aggregateType: "order",
        aggregateId: "order-1",
        payloadJson: "{}",
        actorMemberId: member.id,
        terminalId: "device-1",
        permissionSnapshotToken: permissionSnapshot.token,
        occurredAt: "2026-10-04T00:00:00.000Z",
        status: "pending",
      },
    });
    let attempts = 0;
    const cloud = {
      sync: async (payload: Record<string, unknown>) => {
        attempts += 1;
        if (attempts === 1)
          throw new PosError("SYNC_ERROR", "The sync request timed out.");
        const batch = payload.operations as Array<{ id: string }>;
        return response("1", batch.map((operation) => operation.id));
      },
      validate: async () => member,
      ping: async () => undefined,
    } as unknown as CloudClient;
    const connectivity = new ConnectivityService(
      database,
      cloud,
      sessionStub(),
    );

    const interrupted = await connectivity.syncNow();
    expect(interrupted.state).toBe("degraded");
    expect(interrupted.pendingOutboxCount).toBe(1);
    expect(interrupted.message).toContain("saved changes are safe");

    const retried = await connectivity.syncNow();
    expect(retried.state).toBe("online");
    expect(retried.pendingOutboxCount).toBe(0);
  });
});
