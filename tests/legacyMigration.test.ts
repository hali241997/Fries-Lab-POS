import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CloudClient } from "../electron/cloud";
import {
  createLocalDatabase,
  type LocalDatabase,
} from "../electron/database/client";
import { LegacyMigrationService } from "../electron/services/legacyMigrationService";
import { PosService } from "../electron/services/posService";
import type { SessionService } from "../electron/services/sessionService";
import type { ConnectivityService } from "../electron/services/syncService";
import { ROLE_DEFAULTS } from "../shared/contracts";

function sessionStub(): SessionService {
  const permissions = [...ROLE_DEFAULTS.owner];
  return {
    assertUsable: () => undefined,
    requirePermission: () => undefined,
    getStoreId: () => "store-1",
    getMember: () => ({
      id: "owner-1",
      employeeId: "ALI",
      name: "Ali",
      role: "owner",
      permissions,
      mustChangePassword: false,
    }),
    getDevice: () => ({ id: "device-1", terminalCode: "T01" }),
    getSnapshotToken: () => "snapshot.signature",
  } as unknown as SessionService;
}

describe("legacy CSV migration", () => {
  let directory: string;
  let dataDirectory: string;
  let database: LocalDatabase;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "fries-lab-migration-"));
    dataDirectory = path.join(directory, "data");
    fs.mkdirSync(dataDirectory);
    database = await createLocalDatabase(directory);
  });

  afterEach(async () => {
    await database.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("backs up, imports once, and preserves cancellation-adjusted profit", async () => {
    fs.writeFileSync(
      path.join(dataDirectory, "menu.csv"),
      "name,costPrice,salePrice\nFries,100,300\n",
    );
    fs.writeFileSync(
      path.join(dataDirectory, "sales_log_2026_09.csv"),
      [
        "orderId,dateTime,itemName,quantity,costPrice,salePrice,lineProfit",
        "bill-1,2026-09-25T10:00:00,Fries,1,100,200,100",
        "bill-2,2026-09-25T11:00:00,Fries,1,100,300,200",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(dataDirectory, "bills_2026_09.csv"),
      [
        "billId,orderNo,dateTime,customerName,itemName,quantity,salePrice,lineTotal",
        "bill-1,001,2026-09-25T10:00:00,First,Fries,1,200,200",
        "bill-2,002,2026-09-25T11:00:00,Second,Fries,1,300,300",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(dataDirectory, "voids.csv"),
      "billId,voidedAt,reason\nbill-1,2026-09-25T12:00:00,cancelled\n",
    );

    const session = sessionStub();
    const migration = new LegacyMigrationService(
      database,
      dataDirectory,
      session,
    );
    const preview = await migration.preview();
    expect(preview.billRows).toBe(2);
    const result = await migration.run({ resolutions: [] });
    expect(result.importedOrders).toBe(2);
    expect(
      result.backupPath &&
        fs.existsSync(path.join(result.backupPath, "menu.csv")),
    ).toBe(true);
    expect(fs.existsSync(path.join(dataDirectory, "menu.csv"))).toBe(true);

    const connectivity = { isOnline: () => false } as ConnectivityService;
    const pos = new PosService(
      database,
      {} as CloudClient,
      session,
      connectivity,
    );
    const report = await pos.getDailyReport({ kind: "all" });
    expect(report.totalQuantity).toBe(1);
    expect(report.totalRevenue).toBe(300);
    expect(report.totalProfit).toBe(200);
    await expect(migration.run({ resolutions: [] })).rejects.toThrow(
      "already been imported",
    );
  });

  it("requires and applies a choice for every conflicting menu item", async () => {
    fs.writeFileSync(
      path.join(dataDirectory, "menu.csv"),
      "name,costPrice,salePrice\nFries,100,300\n",
    );
    fs.writeFileSync(
      path.join(dataDirectory, "sales_log_2026_09.csv"),
      [
        "orderId,dateTime,itemName,quantity,costPrice,salePrice,lineProfit",
        "bill-1,2026-09-25T10:00:00,Fries,1,100,300,200",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(dataDirectory, "bills_2026_09.csv"),
      [
        "billId,orderNo,dateTime,customerName,itemName,quantity,salePrice,lineTotal",
        "bill-1,001,2026-09-25T10:00:00,First,Fries,1,300,300",
      ].join("\n"),
    );
    await database.menuItem.create({
      data: {
        id: "636ec765-43e2-4073-94a4-5e2afe4ff73e",
        storeId: "store-1",
        name: "Fries",
        nameNormalized: "fries",
        costPricePaisas: 9_000,
        salePricePaisas: 25_000,
        availableForSale: true,
        version: 2,
        updatedAt: "2026-10-01T00:00:00.000Z",
        deletedAt: null,
      },
    });

    const migration = new LegacyMigrationService(
      database,
      dataDirectory,
      sessionStub(),
    );
    const preview = await migration.preview();
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.conflicts[0]?.recommendedChoice).toBe("cloud");
    await expect(migration.run({ resolutions: [] })).rejects.toThrow(
      "Choose how to resolve every conflicting menu item",
    );

    await migration.run({
      resolutions: [{ key: "fries", choice: "cloud" }],
    });
    const operation = await database.outboxOperation.findFirstOrThrow({
      where: { operationType: "order.imported" },
    });
    const payload = JSON.parse(operation.payloadJson) as {
      lines: Array<{ menuItemId: string | null }>;
    };
    expect(payload.lines[0]?.menuItemId).toBe(
      "636ec765-43e2-4073-94a4-5e2afe4ff73e",
    );
    const menu = await database.menuItem.findUniqueOrThrow({
      where: { nameNormalized: "fries" },
    });
    expect(menu.salePricePaisas).toBe(25_000);

    const importRun = await database.legacyImportRun.findFirstOrThrow();
    const originalSummary = JSON.parse(importRun.summaryJson) as Record<
      string,
      unknown
    >;
    delete originalSummary.conflictResolutions;
    await database.legacyImportRun.update({
      where: { id: importRun.id },
      data: { summaryJson: JSON.stringify(originalSummary) },
    });
    const brokenPayload = JSON.parse(operation.payloadJson) as {
      lines: Array<{ menuItemId: string | null }>;
    };
    if (brokenPayload.lines[0])
      brokenPayload.lines[0].menuItemId =
        "470f63fc-5f5a-4e74-a74d-8a9f7174d639";
    await database.outboxOperation.update({
      where: { id: operation.id },
      data: { payloadJson: JSON.stringify(brokenPayload) },
    });

    const recoveryPreview = await migration.preview();
    expect(recoveryPreview.alreadyImported).toBe(true);
    expect(recoveryPreview.conflicts).toHaveLength(1);
    await migration.run({
      resolutions: [{ key: "fries", choice: "cloud" }],
    });
    const repaired = await database.outboxOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
    const repairedPayload = JSON.parse(repaired.payloadJson) as {
      lines: Array<{ menuItemId: string | null }>;
    };
    expect(repairedPayload.lines[0]?.menuItemId).toBe(
      "636ec765-43e2-4073-94a4-5e2afe4ff73e",
    );
  });
});
