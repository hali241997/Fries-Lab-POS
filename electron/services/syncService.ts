import type {
  Bill,
  ConnectivityStatus,
  MenuItem,
  SessionMember,
} from "../../shared/contracts";
import { CloudClient, type SyncResponse } from "../cloud";
import type { LocalDatabase } from "../database/client";
import { PosError } from "../errors";
import type { SessionService } from "./sessionService";

const ONLINE_MESSAGE = "Connected. Your data is up to date.";
const OFFLINE_MESSAGE =
  "You’re offline. Orders will sync when the connection returns. Menu changes require internet.";
export const SYNC_BATCH_SIZE = 20;
const SYNC_CHANGE_PAGE_SIZE = 1_000;

export class ConnectivityService {
  private status: ConnectivityStatus = {
    state: "reconnecting",
    lastCheckedAt: null,
    lastSyncAt: null,
    offlineLeaseExpiresAt: null,
    offlineLeaseRemainingMs: null,
    pendingOutboxCount: 0,
    permanentErrorCount: 0,
    conflictCount: 0,
    message: "Checking connection…",
  };
  private readonly listeners = new Set<(status: ConnectivityStatus) => void>();
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;

  constructor(
    private readonly database: LocalDatabase,
    private readonly cloud: CloudClient,
    private readonly session: SessionService,
  ) {}

  onChange(listener: (status: ConnectivityStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(): ConnectivityStatus {
    return { ...this.status };
  }

  isOnline(): boolean {
    return (
      this.status.state === "online" ||
      this.status.state === "syncing" ||
      this.status.state === "degraded"
    );
  }

  requireOnline(): void {
    if (!this.isOnline())
      throw new PosError(
        "ONLINE_REQUIRED",
        "Reconnect to the internet to complete this operation.",
      );
  }

  private async counts(): Promise<{
    pending: number;
    permanent: number;
    conflicts: number;
  }> {
    const [pending, permanent, conflicts] = await Promise.all([
      this.database.outboxOperation.count({ where: { status: "pending" } }),
      this.database.outboxOperation.count({ where: { status: "permanent" } }),
      this.database.syncConflict.count({ where: { resolvedAt: null } }),
    ]);
    return { pending, permanent, conflicts };
  }

  private async update(patch: Partial<ConnectivityStatus>): Promise<void> {
    const counts = await this.counts();
    this.status = {
      ...this.status,
      ...patch,
      pendingOutboxCount: counts.pending,
      permanentErrorCount: counts.permanent,
      conflictCount: counts.conflicts,
      offlineLeaseExpiresAt: this.session.getLeaseExpiresAt(),
      offlineLeaseRemainingMs: this.session.getRemainingLeaseMs(),
    };
    for (const listener of this.listeners) listener(this.getStatus());
  }

  async start(): Promise<void> {
    const syncState = await this.database.syncState.findUnique({
      where: { id: "primary" },
    });
    if (syncState?.lastSyncAt) this.status.lastSyncAt = syncState.lastSyncAt;
    await this.check();
    this.timer = setInterval(() => void this.syncNow(), 30_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async check(): Promise<ConnectivityStatus> {
    await this.update({
      state: "reconnecting",
      message: "Checking connection…",
    });
    try {
      await this.cloud.ping();
      await this.update({
        state: "online",
        lastCheckedAt: new Date().toISOString(),
        message: ONLINE_MESSAGE,
      });
    } catch {
      await this.update({
        state: "offline",
        lastCheckedAt: new Date().toISOString(),
        message: OFFLINE_MESSAGE,
      });
    }
    return this.getStatus();
  }

  async syncNow(): Promise<ConnectivityStatus> {
    if (this.syncing) return this.getStatus();
    this.session.checkLease();
    if (this.session.getInfo().state === "signed-out") return this.check();
    if (this.session.getInfo().state === "locked") {
      await this.check();
      return this.getStatus();
    }
    if (this.session.getMember().mustChangePassword) return this.check();

    this.syncing = true;
    await this.update({ state: "syncing", message: "Synchronizing…" });
    try {
      let completedRequest = false;
      let pullMoreChanges = true;
      let permanentErrorsFound = false;
      let lastSyncAt = new Date().toISOString();

      while (true) {
        const menuOperations =
          await this.database.outboxOperation.findMany({
            where: { status: "pending", operationType: "menu.imported" },
            orderBy: { occurredAt: "asc" },
            take: SYNC_BATCH_SIZE,
          });
        const orderOperations = menuOperations.length < SYNC_BATCH_SIZE
          ? await this.database.outboxOperation.findMany({
              where: {
                status: "pending",
                operationType: { not: "menu.imported" },
              },
              orderBy: { occurredAt: "asc" },
              take: SYNC_BATCH_SIZE - menuOperations.length,
            })
          : [];
        const operations = [...menuOperations, ...orderOperations];
        if (!operations.length && completedRequest && !pullMoreChanges) break;

        const syncState = await this.database.syncState.findUniqueOrThrow({
          where: { id: "primary" },
        });
        const response = await this.cloud.sync({
          cursor: syncState.cursor,
          operations: operations.map((operation) => ({
            id: operation.id,
            type: operation.operationType,
            aggregateType: operation.aggregateType,
            aggregateId: operation.aggregateId,
            payload: JSON.parse(operation.payloadJson) as unknown,
            actorMemberId: operation.actorMemberId,
            terminalId: operation.terminalId,
            permissionSnapshot: operation.permissionSnapshotToken,
            occurredAt: operation.occurredAt,
          })),
        });
        completedRequest = true;
        pullMoreChanges =
          response.changes.length === SYNC_CHANGE_PAGE_SIZE;
        permanentErrorsFound ||= response.permanentErrors.length > 0;
        await this.applySyncResponse(response);
        const handledOperationIds = new Set([
          ...response.acceptedOperationIds,
          ...response.permanentErrors.map((error) => error.operationId),
        ]);
        if (
          operations.some(
            (operation) => !handledOperationIds.has(operation.id),
          )
        )
          throw new PosError(
            "SYNC_ERROR",
            "The online service did not finish processing the sync batch.",
          );
        lastSyncAt = new Date().toISOString();
        await this.database.syncState.update({
          where: { id: syncState.id },
          data: { cursor: response.cursor, lastSyncAt },
        });
        if (response.member)
          await this.session.renewFromValidation(
            response.member,
            response.permissionSnapshot,
          );
        else
          await this.session.renewFromValidation(await this.cloud.validate());

        if (operations.length)
          await this.update({
            state: "syncing",
            message: "Synchronizing saved changes…",
          });
      }

      await this.update({
        state: permanentErrorsFound ? "degraded" : "online",
        lastCheckedAt: lastSyncAt,
        lastSyncAt,
        message: permanentErrorsFound
          ? "Connected, but one or more changes need attention."
          : ONLINE_MESSAGE,
      });
    } catch (error: unknown) {
      if (
        error instanceof PosError &&
        (error.code === "AUTH_REQUIRED" || error.code === "FORBIDDEN")
      ) {
        this.session.lock(
          "Your account could not be validated. Connect and enter your password to continue.",
        );
      }
      const lastCheckedAt = new Date().toISOString();
      try {
        await this.cloud.ping();
        await this.update({
          state: "degraded",
          lastCheckedAt,
          message:
            "You’re connected, but synchronization was interrupted. Your saved changes are safe and will retry automatically.",
        });
      } catch {
        await this.update({
          state: "offline",
          lastCheckedAt,
          message: OFFLINE_MESSAGE,
        });
      }
    } finally {
      this.syncing = false;
    }
    return this.getStatus();
  }

  private async applySyncResponse(response: SyncResponse): Promise<void> {
    await this.database.$transaction(async (database) => {
      if (response.acceptedOperationIds.length) {
        await database.outboxOperation.deleteMany({
          where: { id: { in: response.acceptedOperationIds } },
        });
      }
      for (const failure of response.permanentErrors) {
        await database.outboxOperation.updateMany({
          where: { id: failure.operationId },
          data: { status: "permanent", lastError: failure.message },
        });
      }
      for (const change of response.changes) {
        if (change.entityType === "menu_item") {
          const menu = change.payload as MenuItem;
          const record = {
            storeId: this.session.getStoreId(),
            name: menu.name,
            nameNormalized: menu.name.trim().toLowerCase(),
            costPricePaisas: Math.round(menu.costPrice * 100),
            salePricePaisas: Math.round(menu.salePrice * 100),
            availableForSale: menu.availableForSale ?? true,
            version: menu.version,
            updatedAt: menu.updatedAt,
            deletedAt: menu.active ? null : menu.updatedAt,
          };
          await database.menuItem.upsert({
            where: { id: menu.id },
            create: { id: menu.id, ...record },
            update: record,
          });
        } else if (change.entityType === "order") {
          const bill = change.payload as Bill;
          const existing = await database.order.findUnique({
            where: { id: bill.id },
          });
          if (existing && existing.currentRevisionId !== bill.revisionId) {
            await database.orderRevision.updateMany({
              where: { id: existing.currentRevisionId, status: "current" },
              data: { status: "superseded" },
            });
          }
          const order = {
            storeId: this.session.getStoreId(),
            orderNo: bill.orderNo,
            occurredAt: bill.dateTime,
            status: bill.status,
            currentRevisionId: bill.revisionId,
            createdByMemberId: null,
            terminalId: null,
            source: bill.source,
            updatedAt: bill.revisedAt,
          };
          await database.order.upsert({
            where: { id: bill.id },
            create: { id: bill.id, ...order },
            update: order,
          });
          const revision = {
            orderId: bill.id,
            revisionNumber: bill.revisionNumber,
            customerName: bill.customerName,
            totalPaisas: Math.round(bill.total * 100),
            createdAt: bill.revisedAt,
            createdByMemberId: null,
            terminalId: null,
            employeeName: bill.employeeName,
            terminalCode: bill.terminalCode,
            status: bill.status === "cancelled" ? "cancelled" : "current",
          };
          await database.orderRevision.upsert({
            where: { id: bill.revisionId },
            create: { id: bill.revisionId, ...revision },
            update: revision,
          });
          for (const line of bill.lines) {
            const item = {
              revisionId: bill.revisionId,
              menuItemId: line.menuItemId,
              itemName: line.name,
              quantity: line.quantity,
              costPricePaisas: Math.round(line.costPrice * 100),
              salePricePaisas: Math.round(line.salePrice * 100),
            };
            await database.orderItem.upsert({
              where: { id: line.id },
              create: { id: line.id, ...item },
              update: item,
            });
          }
          if (bill.status === "cancelled") {
            const eventId = `${bill.id}:remote-cancel:${bill.revisionNumber}`;
            const event = {
              orderId: bill.id,
              revisionId: bill.revisionId,
              type: "cancelled",
              occurredAt: bill.revisedAt,
              actorMemberId: null,
              terminalId: null,
              detailsJson: JSON.stringify({
                reason: bill.cancellationReason,
                source: "sync",
              }),
            };
            await database.orderEvent.upsert({
              where: { id: eventId },
              create: { id: eventId, ...event },
              update: event,
            });
          }
        } else if (change.operation === "conflict") {
          const conflict = change.payload as {
            id?: string;
            aggregate_type?: string;
            aggregate_id?: string;
            losing_payload?: unknown;
            winning_payload?: unknown;
            created_at?: string;
          };
          const id = conflict.id ?? crypto.randomUUID();
          const record = {
            aggregateType: conflict.aggregate_type ?? "order",
            aggregateId: conflict.aggregate_id ?? change.entityId,
            localPayloadJson: JSON.stringify(conflict.losing_payload ?? {}),
            serverPayloadJson: JSON.stringify(conflict.winning_payload ?? {}),
            createdAt: conflict.created_at ?? new Date().toISOString(),
            resolvedAt: null,
          };
          await database.syncConflict.upsert({
            where: { id },
            create: { id, ...record },
            update: record,
          });
        }
      }
    });
  }
}

export type { SessionMember };
