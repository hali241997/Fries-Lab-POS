import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ROLE_DEFAULTS } from "../shared/contracts";
import {
  createLocalDatabase,
  type LocalDatabase,
} from "../electron/database/client";
import { PosService } from "../electron/services/posService";
import type { CloudClient } from "../electron/cloud";
import type { SessionService } from "../electron/services/sessionService";
import type { ConnectivityService } from "../electron/services/syncService";

describe("POS domain", () => {
  let directory: string;
  let database: LocalDatabase;
  let service: PosService;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "fries-lab-test-"));
    fs.mkdirSync(path.join(directory, "data"));
    database = await createLocalDatabase(directory);
    const permissions = [...ROLE_DEFAULTS.owner];
    const session = {
      requirePermission: (permission: string) => {
        if (!permissions.includes(permission as never))
          throw new Error("forbidden");
      },
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
      getSnapshotToken: () => "signed-snapshot",
    } as unknown as SessionService;
    const connectivity = {
      isOnline: () => false,
      requireOnline: () => undefined,
      syncNow: async () => undefined,
    } as unknown as ConnectivityService;
    service = new PosService(
      database,
      {} as CloudClient,
      session,
      connectivity,
    );
    await database.menuItem.create({
      data: {
        id: "fries",
        storeId: "store-1",
        name: "Fries",
        nameNormalized: "fries",
        costPricePaisas: 10_000,
        salePricePaisas: 20_000,
        availableForSale: true,
        version: 1,
        updatedAt: "2026-09-25T05:00:00.000Z",
        deletedAt: null,
      },
    });
  });

  afterEach(async () => {
    await database.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("keeps historical prices through menu changes and removes cancelled sales from reports", async () => {
    const first = await service.createOrder({
      customerName: "First",
      lines: [{ menuItemId: "fries", quantity: 1 }],
    });
    await database.menuItem.update({
      where: { id: "fries" },
      data: { salePricePaisas: 30_000, version: 2 },
    });
    const second = await service.createOrder({
      customerName: "Second",
      lines: [{ menuItemId: "fries", quantity: 1 }],
    });

    let report = await service.getDailyReport({ kind: "all" });
    expect(report.totalRevenue).toBe(500);
    expect(report.totalProfit).toBe(300);
    expect(report.items[0]?.latestSalePrice).toBe(300);

    await service.cancelOrder({
      orderId: first.id,
      reason: "Customer cancelled",
    });
    report = await service.getDailyReport({ kind: "all" });
    expect(report.totalQuantity).toBe(1);
    expect(report.totalRevenue).toBe(300);
    expect(report.totalProfit).toBe(200);
    expect(report.items[0]?.latestCostPrice).toBe(100);
    expect(second.orderNo).toMatch(/^FL-\d{8}-T01-002$/);
  });

  it("creates audited revisions and an outbox operation in each transaction", async () => {
    const original = await service.createOrder({
      customerName: "Guest",
      lines: [{ menuItemId: "fries", quantity: 1 }],
    });
    const revised = await service.reviseOrder({
      orderId: original.id,
      customerName: "Guest",
      lines: [
        {
          menuItemId: "fries",
          quantity: 2,
          capturedName: "Fries",
          capturedCostPrice: 100,
          capturedSalePrice: 200,
        },
      ],
    });
    expect(revised.revisionNumber).toBe(2);
    expect(revised.dateTime).toBe(original.dateTime);
    expect(revised.total).toBe(400);
    expect(await database.outboxOperation.count()).toBe(2);
  });

  it("prevents items that are not ready for sale from being ordered", async () => {
    await database.menuItem.update({
      where: { id: "fries" },
      data: { availableForSale: false },
    });

    await expect(
      service.createOrder({
        customerName: "Guest",
        lines: [{ menuItemId: "fries", quantity: 1 }],
      }),
    ).rejects.toThrow("Fries is not ready for sale");
  });

  it("uses role templates with the intended cashier restrictions", () => {
    expect(ROLE_DEFAULTS.cashier).toEqual([
      "menu.view",
      "orders.create",
      "bills.view",
    ]);
    expect(ROLE_DEFAULTS.cashier).not.toContain("orders.edit");
    expect(ROLE_DEFAULTS.manager).toContain("menu.manage");
  });
});
