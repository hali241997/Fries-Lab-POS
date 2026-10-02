import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  LegacyMenuConflict,
  LegacyMenuConflictChoice,
  LegacyMigrationPreview,
  LegacyMigrationResult,
  MenuItem,
  RunLegacyMigrationRequest,
} from "../../shared/contracts";
import {
  readLegacyData,
  type LegacyBillRow,
  type LegacyData,
  type LegacyMenuRow,
} from "../csvStore";
import type { LocalDatabase } from "../database/client";
import type {
  MenuItem as PrismaMenuItem,
  Order,
  Prisma,
} from "../generated/prisma/client";
import { PosError } from "../errors";
import type { SessionService } from "./sessionService";
import { toPaisas } from "./posService";

interface ResolvedMenuItems {
  idsByNormalizedName: Map<string, string>;
  resolutions: Record<string, LegacyMenuConflictChoice>;
}

interface LegacyImportSummary {
  menuRows?: number;
  salesRows?: number;
  billRows?: number;
  importedOrders?: number;
  conflictResolutions?: Record<string, LegacyMenuConflictChoice>;
}

function deterministicUuid(namespace: string, value: string): string {
  const hex = createHash("sha256")
    .update(`${namespace}:${value}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item)) ?? [];
    group.push(item);
    groups.set(key(item), group);
  }
  return groups;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function legacyUtc(value: string): string {
  if (!value) return new Date(0).toISOString();
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = new Date(hasZone ? value : `${value}+05:00`);
  if (Number.isNaN(parsed.getTime()))
    throw new Error(`Invalid legacy timestamp: ${value}`);
  return parsed.toISOString();
}

function validLegacyUtc(value: string): string | null {
  try {
    return legacyUtc(value);
  } catch {
    return null;
  }
}

function toMenuItem(item: PrismaMenuItem): MenuItem {
  return {
    id: item.id,
    name: item.name,
    costPrice: item.costPricePaisas / 100,
    salePrice: item.salePricePaisas / 100,
    active: item.deletedAt === null,
    availableForSale: item.availableForSale,
    version: item.version,
    updatedAt: item.updatedAt,
  };
}

function parseSummary(value: string): LegacyImportSummary {
  try {
    return JSON.parse(value) as LegacyImportSummary;
  } catch {
    return {};
  }
}

export class LegacyMigrationService {
  constructor(
    private readonly database: LocalDatabase,
    private readonly dataDir: string,
    private readonly session: SessionService,
  ) {}

  private requireOwner(): void {
    this.session.assertUsable();
    if (this.session.getMember().role !== "owner")
      throw new PosError("FORBIDDEN", "Only the owner can import legacy data.");
  }

  async preview(): Promise<LegacyMigrationPreview> {
    this.requireOwner();
    const completed = await this.database.legacyImportRun.findFirst({
      where: { status: "completed" },
      orderBy: { completedAt: "desc" },
    });
    const data = readLegacyData(this.dataDir);
    const summary = completed ? parseSummary(completed.summaryJson) : {};
    const conflicts = summary.conflictResolutions
      ? []
      : await this.findConflicts(data);
    return this.previewFromData(data, Boolean(completed), conflicts);
  }

  async run(request: RunLegacyMigrationRequest): Promise<LegacyMigrationResult> {
    this.requireOwner();
    const data = readLegacyData(this.dataDir);
    const completed = await this.database.legacyImportRun.findFirst({
      where: { status: "completed" },
      orderBy: { completedAt: "desc" },
    });
    const existingSummary = completed ? parseSummary(completed.summaryJson) : {};
    if (existingSummary.conflictResolutions)
      throw new PosError("CONFLICT", "Legacy data has already been imported.");

    const conflicts = await this.findConflicts(data);
    const resolutions = this.validateResolutions(conflicts, request);
    const preview = this.previewFromData(data, Boolean(completed), conflicts);

    if (completed) {
      const importedOrders = await this.database.$transaction(
        async (database) => {
          const resolved = await this.resolveMenuItems(
            database,
            data,
            conflicts,
            resolutions,
          );
          await this.repairImportedOrders(database, resolved.idsByNormalizedName);
          const summary = {
            ...existingSummary,
            importedOrders:
              existingSummary.importedOrders ??
              (await database.order.count({ where: { source: "legacy" } })),
            conflictResolutions: resolved.resolutions,
          };
          await database.legacyImportRun.update({
            where: { id: completed.id },
            data: { summaryJson: JSON.stringify(summary) },
          });
          return summary.importedOrders;
        },
      );
      return {
        ...preview,
        alreadyImported: true,
        importedOrders,
        backupPath: completed.backupPath,
      };
    }

    const timestamp = new Date().toISOString().replaceAll(":", "-");
    const backupPath = path.join(this.dataDir, "legacy-backups", timestamp);
    fs.mkdirSync(backupPath, { recursive: true });
    for (const source of data.sourceFiles)
      fs.copyFileSync(source, path.join(backupPath, path.basename(source)));
    const runId = randomUUID();
    const importedOrders = await this.database
      .$transaction(async (database) =>
        this.importAll(
          database,
          data,
          runId,
          backupPath,
          conflicts,
          resolutions,
        ),
      )
      .catch((error: unknown) => {
        if (error instanceof PosError) throw error;
        throw new PosError(
          "VALIDATION_ERROR",
          "Some existing data could not be imported. No changes were made.",
        );
      });
    return {
      ...preview,
      alreadyImported: true,
      importedOrders,
      backupPath,
    };
  }

  private previewFromData(
    data: LegacyData,
    alreadyImported: boolean,
    conflicts: LegacyMenuConflict[],
  ): LegacyMigrationPreview {
    return {
      alreadyImported,
      sourceFiles: data.sourceFiles,
      menuRows: data.menu.length,
      salesRows: data.sales.length,
      billRows: data.bills.length,
      cancelledBills: new Set(data.voids.map((row) => row.billId)).size,
      warnings: data.warnings,
      conflicts,
    };
  }

  private async findConflicts(data: LegacyData): Promise<LegacyMenuConflict[]> {
    const legacyByName = new Map<string, LegacyMenuRow>();
    for (const item of data.menu) legacyByName.set(normalizeName(item.name), item);
    if (!legacyByName.size) return [];
    const existing = await this.database.menuItem.findMany({
      where: { nameNormalized: { in: [...legacyByName.keys()] } },
    });
    return existing.flatMap((cloudRecord) => {
      const legacyItem = legacyByName.get(cloudRecord.nameNormalized);
      if (!legacyItem) return [];
      if (
        cloudRecord.id ===
        deterministicUuid("legacy-menu", cloudRecord.nameNormalized)
      )
        return [];
      const activityDates = [
        ...data.sales
          .filter(
            (row) => normalizeName(row.itemName) === cloudRecord.nameNormalized,
          )
          .map((row) => validLegacyUtc(row.dateTime)),
        ...data.bills
          .filter(
            (row) => normalizeName(row.itemName) === cloudRecord.nameNormalized,
          )
          .map((row) => validLegacyUtc(row.dateTime)),
      ].filter((value): value is string => value !== null);
      activityDates.sort((left, right) => Date.parse(right) - Date.parse(left));
      const latestLegacyActivityAt = activityDates[0] ?? null;
      const cloudItem = toMenuItem(cloudRecord);
      const samePrices =
        cloudItem.costPrice === legacyItem.costPrice &&
        cloudItem.salePrice === legacyItem.salePrice;
      const legacyIsNewer =
        latestLegacyActivityAt !== null &&
        Date.parse(latestLegacyActivityAt) > Date.parse(cloudItem.updatedAt);
      const recommendedChoice: LegacyMenuConflictChoice = samePrices
        ? "combine"
        : legacyIsNewer
          ? "legacy"
          : "cloud";
      const recommendationReason = samePrices
        ? "Both records have the same prices, so combining them avoids a duplicate while preserving all history."
        : legacyIsNewer
          ? "The legacy files contain more recent activity for this item than the cloud update."
          : "The cloud record was updated more recently than the dated legacy activity.";
      return [
        {
          key: cloudRecord.nameNormalized,
          cloudItem,
          legacyItem,
          legacyOrderLineCount: data.bills.filter(
            (row) => normalizeName(row.itemName) === cloudRecord.nameNormalized,
          ).length,
          latestLegacyActivityAt,
          recommendedChoice,
          recommendationReason,
        },
      ];
    });
  }

  private validateResolutions(
    conflicts: LegacyMenuConflict[],
    request: RunLegacyMigrationRequest,
  ): Map<string, LegacyMenuConflictChoice> {
    const allowed = new Set<LegacyMenuConflictChoice>([
      "cloud",
      "legacy",
      "combine",
    ]);
    const resolutions = new Map(
      request.resolutions.map((resolution) => [
        resolution.key,
        resolution.choice,
      ]),
    );
    for (const conflict of conflicts) {
      const choice = resolutions.get(conflict.key);
      if (!choice || !allowed.has(choice))
        throw new PosError(
          "VALIDATION_ERROR",
          "Choose how to resolve every conflicting menu item before importing.",
        );
    }
    return resolutions;
  }

  private shouldApplyLegacy(
    choice: LegacyMenuConflictChoice,
    conflict: LegacyMenuConflict,
  ): boolean {
    if (choice === "legacy") return true;
    if (choice === "cloud") return false;
    if (!conflict.latestLegacyActivityAt) return false;
    return (
      Date.parse(conflict.latestLegacyActivityAt) >
      Date.parse(conflict.cloudItem.updatedAt)
    );
  }

  private async resolveMenuItems(
    database: Prisma.TransactionClient,
    data: LegacyData,
    conflicts: LegacyMenuConflict[],
    requestedResolutions: Map<string, LegacyMenuConflictChoice>,
  ): Promise<ResolvedMenuItems> {
    const allExisting = await database.menuItem.findMany();
    const recordsByName = new Map(
      allExisting.map((item) => [item.nameNormalized, item]),
    );
    const idsByNormalizedName = new Map(
      allExisting.map((item) => [item.nameNormalized, item.id]),
    );
    const conflictsByName = new Map(
      conflicts.map((conflict) => [conflict.key, conflict]),
    );
    const resolutions: Record<string, LegacyMenuConflictChoice> = {};

    for (const item of data.menu) {
      const nameNormalized = normalizeName(item.name);
      const existing = recordsByName.get(nameNormalized);
      if (existing) {
        if (existing.id === deterministicUuid("legacy-menu", nameNormalized)) {
          idsByNormalizedName.set(nameNormalized, existing.id);
          continue;
        }
        const conflict = conflictsByName.get(nameNormalized);
        const choice = requestedResolutions.get(nameNormalized);
        if (!conflict || !choice)
          throw new PosError(
            "VALIDATION_ERROR",
            "Choose how to resolve every conflicting menu item before importing.",
          );
        resolutions[nameNormalized] = choice;
        idsByNormalizedName.set(nameNormalized, existing.id);
        if (this.shouldApplyLegacy(choice, conflict)) {
          const updatedAt = new Date().toISOString();
          const updated = await database.menuItem.update({
            where: { id: existing.id },
            data: {
              name: item.name,
              costPricePaisas: toPaisas(item.costPrice),
              salePricePaisas: toPaisas(item.salePrice),
              availableForSale: true,
              version: existing.version + 1,
              updatedAt,
              deletedAt: null,
            },
          });
          await this.upsertMenuOutbox(database, updated, updatedAt);
          recordsByName.set(nameNormalized, updated);
        }
        continue;
      }

      const menuId = deterministicUuid("legacy-menu", nameNormalized);
      const updatedAt = new Date().toISOString();
      const created = await database.menuItem.create({
        data: {
          id: menuId,
          storeId: this.session.getStoreId(),
          name: item.name,
          nameNormalized,
          costPricePaisas: toPaisas(item.costPrice),
          salePricePaisas: toPaisas(item.salePrice),
          availableForSale: true,
          version: 1,
          updatedAt,
          deletedAt: null,
        },
      });
      await this.upsertMenuOutbox(database, created, updatedAt);
      recordsByName.set(nameNormalized, created);
      idsByNormalizedName.set(nameNormalized, menuId);
    }
    return { idsByNormalizedName, resolutions };
  }

  private async upsertMenuOutbox(
    database: Prisma.TransactionClient,
    item: PrismaMenuItem,
    occurredAt: string,
  ): Promise<void> {
    const operationId = deterministicUuid(
      "legacy-menu-outbox",
      `${item.id}:${item.version}:${item.costPricePaisas}:${item.salePricePaisas}`,
    );
    const data = {
      operationType: "menu.imported",
      aggregateType: "menu_item",
      aggregateId: item.id,
      payloadJson: JSON.stringify(toMenuItem(item)),
      actorMemberId: null,
      terminalId: this.session.getDevice().id,
      permissionSnapshotToken: this.session.getSnapshotToken(),
      occurredAt,
      attempts: 0,
      lastError: null,
      status: "pending",
    };
    await database.outboxOperation.upsert({
      where: { id: operationId },
      create: { id: operationId, ...data },
      update: data,
    });
  }

  private async repairImportedOrders(
    database: Prisma.TransactionClient,
    idsByNormalizedName: Map<string, string>,
  ): Promise<void> {
    const legacyOrders = await database.order.findMany({
      where: { source: "legacy" },
      include: { revisions: { select: { id: true } } },
    });
    const revisionIds = legacyOrders.flatMap((order) =>
      order.revisions.map((revision) => revision.id),
    );
    if (revisionIds.length) {
      const items = await database.orderItem.findMany({
        where: { revisionId: { in: revisionIds } },
      });
      for (const item of items) {
        await database.orderItem.update({
          where: { id: item.id },
          data: {
            menuItemId:
              idsByNormalizedName.get(normalizeName(item.itemName)) ?? null,
          },
        });
      }
    }
    const operations = await database.outboxOperation.findMany({
      where: { operationType: "order.imported", status: "pending" },
    });
    for (const operation of operations) {
      const payload = JSON.parse(operation.payloadJson) as {
        lines?: Array<{ name: string; menuItemId: string | null }>;
      };
      if (!payload.lines) continue;
      payload.lines = payload.lines.map((line) => ({
        ...line,
        menuItemId: idsByNormalizedName.get(normalizeName(line.name)) ?? null,
      }));
      await database.outboxOperation.update({
        where: { id: operation.id },
        data: { payloadJson: JSON.stringify(payload), lastError: null },
      });
    }
  }

  private async importAll(
    database: Prisma.TransactionClient,
    data: LegacyData,
    runId: string,
    backupPath: string,
    conflicts: LegacyMenuConflict[],
    requestedResolutions: Map<string, LegacyMenuConflictChoice>,
  ): Promise<number> {
    const resolved = await this.resolveMenuItems(
      database,
      data,
      conflicts,
      requestedResolutions,
    );
    const salesByBill = groupBy(data.sales, (row) => row.orderId);
    const voids = new Map(data.voids.map((row) => [row.billId, row]));
    const billsById = groupBy(data.bills, (row) => row.billId);
    const billGroups = [...billsById.entries()]
      .map(([billId, rows]) => ({ billId, rows, first: rows[0] }))
      .filter(
        (
          entry,
        ): entry is {
          billId: string;
          rows: LegacyBillRow[];
          first: LegacyBillRow;
        } => Boolean(entry.first),
      );
    const orders = groupBy(
      billGroups,
      (entry) => entry.first.orderNo || entry.billId,
    );
    for (const [legacyOrderNo, revisions] of orders) {
      revisions.sort(
        (a, b) =>
          Date.parse(legacyUtc(a.first.dateTime)) -
            Date.parse(legacyUtc(b.first.dateTime)) ||
          a.first.sourceIndex - b.first.sourceIndex,
      );
      const orderId = deterministicUuid("legacy-order", legacyOrderNo);
      const latest = revisions.at(-1);
      if (!latest) continue;
      const latestVoid = voids.get(latest.billId);
      const cancelled = Boolean(
        latestVoid && !latestVoid.reason.toLowerCase().startsWith("edit"),
      );
      const order: Order = await database.order.create({
        data: {
          id: orderId,
          storeId: this.session.getStoreId(),
          orderNo: legacyOrderNo,
          occurredAt: legacyUtc(
            revisions[0]?.first.dateTime ?? latest.first.dateTime,
          ),
          status: cancelled ? "cancelled" : "active",
          currentRevisionId: deterministicUuid(
            "legacy-revision",
            latest.billId,
          ),
          createdByMemberId: null,
          terminalId: null,
          source: "legacy",
          updatedAt: legacyUtc(latest.first.dateTime),
        },
      });
      for (const [index, revisionGroup] of revisions.entries()) {
        const isLatest = index === revisions.length - 1;
        const revisionId = deterministicUuid(
          "legacy-revision",
          revisionGroup.billId,
        );
        const saleRows = salesByBill.get(revisionGroup.billId) ?? [];
        const costQueues = groupBy(saleRows, (row) => row.itemName);
        const totalPaisas = revisionGroup.rows.reduce(
          (sum, row) => sum + toPaisas(row.lineTotal),
          0,
        );
        await database.orderRevision.create({
          data: {
            id: revisionId,
            orderId,
            revisionNumber: index + 1,
            customerName: revisionGroup.first.customerName,
            totalPaisas,
            createdAt: legacyUtc(revisionGroup.first.dateTime),
            createdByMemberId: null,
            terminalId: null,
            employeeName: null,
            terminalCode: null,
            status: isLatest
              ? cancelled
                ? "cancelled"
                : "current"
              : "superseded",
          },
        });
        for (const [lineIndex, line] of revisionGroup.rows.entries()) {
          const sales = costQueues.get(line.itemName) ?? [];
          const sale = sales.shift();
          await database.orderItem.create({
            data: {
              id: deterministicUuid(
                "legacy-line",
                `${revisionGroup.billId}:${lineIndex}`,
              ),
              revisionId,
              menuItemId:
                resolved.idsByNormalizedName.get(normalizeName(line.itemName)) ??
                null,
              itemName: line.itemName,
              quantity: line.quantity,
              costPricePaisas: toPaisas(sale?.costPrice ?? 0),
              salePricePaisas: toPaisas(line.salePrice),
            },
          });
        }
        await database.orderEvent.create({
          data: {
            id: deterministicUuid("legacy-event", revisionGroup.billId),
            orderId,
            revisionId,
            type: index === 0 ? "created" : "revised",
            occurredAt: legacyUtc(revisionGroup.first.dateTime),
            actorMemberId: null,
            terminalId: null,
            detailsJson: JSON.stringify({
              source: "legacy",
              billId: revisionGroup.billId,
            }),
          },
        });
      }
      if (cancelled && latestVoid) {
        await database.orderEvent.create({
          data: {
            id: deterministicUuid("legacy-cancel", latest.billId),
            orderId,
            revisionId: order.currentRevisionId,
            type: "cancelled",
            occurredAt: legacyUtc(latestVoid.voidedAt || latest.first.dateTime),
            actorMemberId: null,
            terminalId: null,
            detailsJson: JSON.stringify({
              source: "legacy",
              reason: latestVoid.reason,
            }),
          },
        });
      }
      const latestSales = groupBy(
        salesByBill.get(latest.billId) ?? [],
        (row) => row.itemName,
      );
      const payload = {
        id: orderId,
        revisionId: order.currentRevisionId,
        revisionNumber: revisions.length,
        orderNo: order.orderNo,
        dateTime: order.occurredAt,
        revisedAt: legacyUtc(latest.first.dateTime),
        customerName: latest.first.customerName,
        lines: latest.rows.map((line, index) => {
          const sale = (latestSales.get(line.itemName) ?? []).shift();
          return {
            id: deterministicUuid("legacy-line", `${latest.billId}:${index}`),
            menuItemId:
              resolved.idsByNormalizedName.get(normalizeName(line.itemName)) ??
              null,
            name: line.itemName,
            quantity: line.quantity,
            costPrice: sale?.costPrice ?? 0,
            salePrice: line.salePrice,
          };
        }),
        total: latest.rows.reduce((sum, row) => sum + row.lineTotal, 0),
        status: order.status,
        cancellationReason: cancelled ? (latestVoid?.reason ?? null) : null,
        source: "legacy",
      };
      await database.outboxOperation.create({
        data: {
          id: deterministicUuid("legacy-outbox", orderId),
          operationType: "order.imported",
          aggregateType: "order",
          aggregateId: orderId,
          payloadJson: JSON.stringify(payload),
          actorMemberId: null,
          terminalId: this.session.getDevice().id,
          permissionSnapshotToken: this.session.getSnapshotToken(),
          occurredAt: order.occurredAt,
          attempts: 0,
          lastError: null,
          status: "pending",
        },
      });
    }

    const summary: LegacyImportSummary = {
      menuRows: data.menu.length,
      salesRows: data.sales.length,
      billRows: data.bills.length,
      importedOrders: orders.size,
      conflictResolutions: resolved.resolutions,
    };
    await database.legacyImportRun.create({
      data: {
        id: runId,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: "completed",
        summaryJson: JSON.stringify(summary),
        backupPath,
      },
    });
    return orders.size;
  }
}
