import { randomUUID } from "node:crypto";
import type {
  Bill,
  BillsQuery,
  CancelOrderRequest,
  CartDraft,
  CompletedOrder,
  CreateOrderRequest,
  DailyReportResult,
  MenuItem,
  MenuMutationRequest,
  MonthlyReportResult,
  OrderLineInput,
  ReportRange,
  ReviseOrderRequest,
} from "../../shared/contracts";
import { CloudClient } from "../cloud";
import type { LocalDatabase } from "../database/client";
import type {
  MenuItem as MenuItemRecord,
  Order,
  OrderItem,
  OrderRevision,
  Prisma,
} from "../generated/prisma/client";
import { PosError } from "../errors";
import type { SessionService } from "./sessionService";
import type { ConnectivityService } from "./syncService";

function toMoney(paisas: number): number {
  return paisas / 100;
}

function toPaisas(value: number): number {
  if (!Number.isFinite(value) || value < 0)
    throw new PosError("VALIDATION_ERROR", "Prices must be positive numbers.");
  return Math.round(value * 100);
}

function toMenuItem(entity: MenuItemRecord): MenuItem {
  return {
    id: entity.id,
    name: entity.name,
    costPrice: toMoney(entity.costPricePaisas),
    salePrice: toMoney(entity.salePricePaisas),
    active: entity.deletedAt === null,
    availableForSale: entity.availableForSale,
    version: entity.version,
    updatedAt: entity.updatedAt,
  };
}

function karachiParts(date: Date): {
  year: number;
  month: number;
  day: number;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const value = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function localMidnightUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, -5));
}

function rangeBounds(
  range: ReportRange,
): { start: number; end: number; label: string } | null {
  if (range.kind === "all") return null;
  const anchor = range.anchorDate
    ? new Date(`${range.anchorDate}T12:00:00+05:00`)
    : new Date();
  const parts = karachiParts(anchor);
  const year = range.year ?? parts.year;
  const month = range.month ?? parts.month;
  let start: Date;
  let end: Date;
  if (range.kind === "year") {
    start = localMidnightUtc(year, 1, 1);
    end = localMidnightUtc(year + 1, 1, 1);
  } else if (range.kind === "month") {
    start = localMidnightUtc(year, month, 1);
    end =
      month === 12
        ? localMidnightUtc(year + 1, 1, 1)
        : localMidnightUtc(year, month + 1, 1);
  } else if (range.kind === "week") {
    const day = localMidnightUtc(parts.year, parts.month, parts.day);
    const localDay = new Date(day.getTime() + 5 * 60 * 60 * 1000).getUTCDay();
    const sinceMonday = (localDay + 6) % 7;
    start = new Date(day.getTime() - sinceMonday * 86_400_000);
    end = new Date(start.getTime() + 7 * 86_400_000);
  } else {
    start = localMidnightUtc(parts.year, parts.month, parts.day);
    end = new Date(start.getTime() + 86_400_000);
  }
  return {
    start: start.getTime(),
    end: end.getTime(),
    label: `${range.kind}: ${start.toISOString()} – ${end.toISOString()}`,
  };
}

function inRange(iso: string, range: ReportRange): boolean {
  const bounds = rangeBounds(range);
  if (!bounds) return true;
  const time = Date.parse(iso);
  return time >= bounds.start && time < bounds.end;
}

export class PosService {
  constructor(
    private readonly database: LocalDatabase,
    private readonly cloud: CloudClient,
    private readonly session: SessionService,
    private readonly connectivity: ConnectivityService,
  ) {}

  async getMenu(): Promise<MenuItem[]> {
    this.session.assertUsable();
    if (
      !this.session.hasPermission("menu.view") &&
      !this.session.hasPermission("menu.manage")
    ) {
      throw new PosError(
        "FORBIDDEN",
        "You do not have permission to view the menu.",
      );
    }
    const rows = await this.database.menuItem.findMany({
      orderBy: { name: "asc" },
    });
    return rows.map(toMenuItem);
  }

  private async persistCanonicalMenu(item: MenuItem): Promise<MenuItem> {
    const record = {
      storeId: this.session.getStoreId(),
      name: item.name,
      nameNormalized: item.name.trim().toLowerCase(),
      costPricePaisas: toPaisas(item.costPrice),
      salePricePaisas: toPaisas(item.salePrice),
      availableForSale: item.availableForSale,
      version: item.version,
      updatedAt: item.updatedAt,
      deletedAt: item.active ? null : item.updatedAt,
    };
    await this.database.menuItem.upsert({
      where: { id: item.id },
      create: { id: item.id, ...record },
      update: record,
    });
    return item;
  }

  private validateMenu(request: MenuMutationRequest): void {
    if (!request.name.trim())
      throw new PosError("VALIDATION_ERROR", "Item name is required.");
    toPaisas(request.costPrice);
    toPaisas(request.salePrice);
  }

  async createMenuItem(request: MenuMutationRequest): Promise<MenuItem> {
    this.session.requirePermission("menu.manage");
    this.connectivity.requireOnline();
    this.validateMenu(request);
    const item = await this.persistCanonicalMenu(
      await this.cloud.saveMenu({ ...request, action: "create" }),
    );
    void this.connectivity.syncNow();
    return item;
  }

  async updateMenuItem(request: MenuMutationRequest): Promise<MenuItem> {
    this.session.requirePermission("menu.manage");
    this.connectivity.requireOnline();
    if (!request.id)
      throw new PosError("VALIDATION_ERROR", "Menu item ID is required.");
    this.validateMenu(request);
    const item = await this.persistCanonicalMenu(
      await this.cloud.saveMenu({ ...request, action: "update" }),
    );
    void this.connectivity.syncNow();
    return item;
  }

  async archiveMenuItem(id: string): Promise<MenuItem> {
    this.session.requirePermission("menu.manage");
    this.connectivity.requireOnline();
    const current = await this.database.menuItem.findUnique({ where: { id } });
    if (!current)
      throw new PosError("VALIDATION_ERROR", "Menu item was not found.");
    const item = await this.persistCanonicalMenu(
      await this.cloud.saveMenu({
        action: "archive",
        id,
        name: current.name,
        costPrice: toMoney(current.costPricePaisas),
        salePrice: toMoney(current.salePricePaisas),
        availableForSale: current.availableForSale,
        expectedVersion: current.version,
      }),
    );
    void this.connectivity.syncNow();
    return item;
  }

  async getCartDraft(): Promise<CartDraft> {
    this.session.requirePermission("orders.create");
    const key = `cart-draft:${this.session.getMember().id}`;
    const saved = await this.database.setting.findUnique({ where: { key } });
    if (!saved)
      return {
        customerName: "",
        lines: [],
        updatedAt: new Date(0).toISOString(),
      };
    try {
      return JSON.parse(saved.value) as CartDraft;
    } catch {
      return {
        customerName: "",
        lines: [],
        updatedAt: new Date(0).toISOString(),
      };
    }
  }

  async saveCartDraft(draft: CartDraft): Promise<void> {
    this.session.requirePermission("orders.create");
    const key = `cart-draft:${this.session.getMember().id}`;
    const value = JSON.stringify(draft);
    await this.database.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  private async resolveLines(
    database: Prisma.TransactionClient,
    lines: OrderLineInput[],
  ): Promise<OrderItem[]> {
    if (!lines.length)
      throw new PosError(
        "VALIDATION_ERROR",
        "Add at least one item to the order.",
      );
    const output: OrderItem[] = [];
    for (const line of lines) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new PosError(
          "VALIDATION_ERROR",
          "Item quantities must be positive whole numbers.",
        );
      }
      const menu = await database.menuItem.findUnique({
        where: { id: line.menuItemId },
      });
      if (
        !menu &&
        (!line.capturedName ||
          line.capturedCostPrice === undefined ||
          line.capturedSalePrice === undefined)
      ) {
        throw new PosError(
          "VALIDATION_ERROR",
          "An order item is no longer available.",
        );
      }
      if (menu?.deletedAt && line.capturedName === undefined) {
        throw new PosError(
          "VALIDATION_ERROR",
          `${menu.name} is archived and cannot be added to a new order.`,
        );
      }
      if (menu && !menu.availableForSale && line.capturedName === undefined) {
        throw new PosError(
          "VALIDATION_ERROR",
          `${menu.name} is not ready for sale.`,
        );
      }
      output.push({
        id: randomUUID(),
        revisionId: "",
        menuItemId: menu?.id ?? (line.menuItemId || null),
        itemName: line.capturedName ?? menu?.name ?? "Unknown item",
        quantity: line.quantity,
        costPricePaisas:
          line.capturedCostPrice === undefined
            ? (menu?.costPricePaisas ?? 0)
            : toPaisas(line.capturedCostPrice),
        salePricePaisas:
          line.capturedSalePrice === undefined
            ? (menu?.salePricePaisas ?? 0)
            : toPaisas(line.capturedSalePrice),
      });
    }
    return output;
  }

  private async nextOrderNumber(
    database: Prisma.TransactionClient,
    occurredAt: Date,
  ): Promise<string> {
    const terminal = this.session.getDevice().terminalCode ?? "T00";
    const parts = karachiParts(occurredAt);
    const date = `${parts.year}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}`;
    const key = `receipt-sequence:${terminal}:${date}`;
    const setting = await database.setting.findUnique({ where: { key } });
    const sequence = Number(setting?.value ?? "0") + 1;
    const value = String(sequence);
    await database.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    return `FL-${date}-${terminal}-${String(sequence).padStart(3, "0")}`;
  }

  private async enqueue(
    database: Prisma.TransactionClient,
    type: string,
    order: Bill,
    occurredAt: string,
  ): Promise<void> {
    await database.outboxOperation.create({
      data: {
        id: randomUUID(),
        operationType: type,
        aggregateType: "order",
        aggregateId: order.id,
        payloadJson: JSON.stringify(order),
        actorMemberId: this.session.getMember().id,
        terminalId: this.session.getDevice().id,
        permissionSnapshotToken: this.session.getSnapshotToken(),
        occurredAt,
        attempts: 0,
        lastError: null,
        status: "pending",
      },
    });
  }

  async createOrder(request: CreateOrderRequest): Promise<CompletedOrder> {
    this.session.requirePermission("orders.create");
    const member = this.session.getMember();
    const device = this.session.getDevice();
    const now = new Date();
    const bill = await this.database.$transaction(async (database) => {
      const lines = await this.resolveLines(database, request.lines);
      const orderId = randomUUID();
      const revisionId = randomUUID();
      for (const line of lines) line.revisionId = revisionId;
      const occurredAt = now.toISOString();
      const order = await database.order.create({
        data: {
          id: orderId,
          storeId: this.session.getStoreId(),
          orderNo: await this.nextOrderNumber(database, now),
          occurredAt,
          status: "active",
          currentRevisionId: revisionId,
          createdByMemberId: member.id,
          terminalId: device.id,
          source: "app",
          updatedAt: occurredAt,
        },
      });
      const totalPaisas = lines.reduce(
        (sum, line) => sum + line.salePricePaisas * line.quantity,
        0,
      );
      const revision = await database.orderRevision.create({
        data: {
          id: revisionId,
          orderId,
          revisionNumber: 1,
          customerName: request.customerName.trim(),
          totalPaisas,
          createdAt: occurredAt,
          createdByMemberId: member.id,
          terminalId: device.id,
          employeeName: member.name,
          terminalCode: device.terminalCode,
          status: "current",
        },
      });
      await database.orderItem.createMany({ data: lines });
      await database.orderEvent.create({
        data: {
          id: randomUUID(),
          orderId,
          revisionId,
          type: "created",
          occurredAt,
          actorMemberId: member.id,
          terminalId: device.id,
          detailsJson: "{}",
        },
      });
      const result = this.makeBill(order, revision, lines);
      await this.enqueue(database, "order.created", result, occurredAt);
      return result;
    });
    if (this.connectivity.isOnline()) void this.connectivity.syncNow();
    return bill;
  }

  async reviseOrder(request: ReviseOrderRequest): Promise<CompletedOrder> {
    this.session.requirePermission("orders.edit");
    const now = new Date().toISOString();
    const bill = await this.database.$transaction(async (database) => {
      const order = await database.order.findUnique({
        where: { id: request.orderId },
      });
      if (!order || order.status === "cancelled")
        throw new PosError(
          "VALIDATION_ERROR",
          "Only active orders can be edited.",
        );
      const current = await database.orderRevision.findUniqueOrThrow({
        where: { id: order.currentRevisionId },
      });
      const lines = await this.resolveLines(database, request.lines);
      const revisionId = randomUUID();
      for (const line of lines) line.revisionId = revisionId;
      await database.orderRevision.update({
        where: { id: current.id },
        data: { status: "superseded" },
      });
      const revision = await database.orderRevision.create({
        data: {
          id: revisionId,
          orderId: order.id,
          revisionNumber: current.revisionNumber + 1,
          customerName: request.customerName.trim(),
          totalPaisas: lines.reduce(
            (sum, line) => sum + line.salePricePaisas * line.quantity,
            0,
          ),
          createdAt: now,
          createdByMemberId: this.session.getMember().id,
          terminalId: this.session.getDevice().id,
          employeeName: this.session.getMember().name,
          terminalCode: this.session.getDevice().terminalCode,
          status: "current",
        },
      });
      await database.orderItem.createMany({ data: lines });
      const updatedOrder = await database.order.update({
        where: { id: order.id },
        data: { currentRevisionId: revisionId, updatedAt: now },
      });
      await database.orderEvent.create({
        data: {
          id: randomUUID(),
          orderId: order.id,
          revisionId,
          type: "revised",
          occurredAt: now,
          actorMemberId: this.session.getMember().id,
          terminalId: this.session.getDevice().id,
          detailsJson: JSON.stringify({ supersededRevisionId: current.id }),
        },
      });
      const result = this.makeBill(updatedOrder, revision, lines);
      await this.enqueue(database, "order.revised", result, now);
      return result;
    });
    if (this.connectivity.isOnline()) void this.connectivity.syncNow();
    return bill;
  }

  async cancelOrder(request: CancelOrderRequest): Promise<CompletedOrder> {
    this.session.requirePermission("orders.cancel");
    if (!request.reason.trim())
      throw new PosError(
        "VALIDATION_ERROR",
        "A cancellation reason is required.",
      );
    const now = new Date().toISOString();
    const bill = await this.database.$transaction(async (database) => {
      const order = await database.order.findUnique({
        where: { id: request.orderId },
      });
      if (!order || order.status === "cancelled")
        throw new PosError(
          "VALIDATION_ERROR",
          "The order is already cancelled or missing.",
        );
      const updatedOrder = await database.order.update({
        where: { id: order.id },
        data: { status: "cancelled", updatedAt: now },
      });
      const revision = await database.orderRevision.update({
        where: { id: order.currentRevisionId },
        data: { status: "cancelled" },
      });
      const lines = await database.orderItem.findMany({
        where: { revisionId: revision.id },
      });
      await database.orderEvent.create({
        data: {
          id: randomUUID(),
          orderId: order.id,
          revisionId: revision.id,
          type: "cancelled",
          occurredAt: now,
          actorMemberId: this.session.getMember().id,
          terminalId: this.session.getDevice().id,
          detailsJson: JSON.stringify({ reason: request.reason.trim() }),
        },
      });
      const result = this.makeBill(
        updatedOrder,
        revision,
        lines,
        request.reason.trim(),
      );
      await this.enqueue(database, "order.cancelled", result, now);
      return result;
    });
    if (this.connectivity.isOnline()) void this.connectivity.syncNow();
    return bill;
  }

  private makeBill(
    order: Order,
    revision: OrderRevision,
    lines: OrderItem[],
    cancellationReason: string | null = null,
  ): Bill {
    return {
      id: order.id,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      orderNo: order.orderNo,
      dateTime: order.occurredAt,
      revisedAt: revision.createdAt,
      customerName: revision.customerName,
      lines: lines.map((line) => ({
        id: line.id,
        menuItemId: line.menuItemId,
        name: line.itemName,
        quantity: line.quantity,
        costPrice: toMoney(line.costPricePaisas),
        salePrice: toMoney(line.salePricePaisas),
      })),
      total: toMoney(revision.totalPaisas),
      status: order.status === "cancelled" ? "cancelled" : "active",
      cancellationReason,
      source: order.source === "legacy" ? "legacy" : "app",
      employeeName: revision.employeeName,
      terminalCode: revision.terminalCode,
    };
  }

  private async allCurrentBills(): Promise<Bill[]> {
    const orders = await this.database.order.findMany({
      orderBy: { occurredAt: "desc" },
    });
    const bills: Bill[] = [];
    for (const order of orders) {
      const revision = await this.database.orderRevision.findUnique({
        where: { id: order.currentRevisionId },
      });
      if (!revision) continue;
      const lines = await this.database.orderItem.findMany({
        where: { revisionId: revision.id },
      });
      const cancellation =
        order.status === "cancelled"
          ? await this.database.orderEvent.findFirst({
              where: { orderId: order.id, type: "cancelled" },
              orderBy: { occurredAt: "desc" },
            })
          : null;
      let reason: string | null = null;
      if (cancellation) {
        const details = JSON.parse(cancellation.detailsJson) as {
          reason?: string;
        };
        reason = details.reason ?? null;
      }
      bills.push(this.makeBill(order, revision, lines, reason));
    }
    return bills;
  }

  async getBills(query: BillsQuery): Promise<Bill[]> {
    this.session.requirePermission("bills.view");
    const search = query.customerSearch?.trim().toLowerCase();
    return (await this.allCurrentBills()).filter(
      (bill) =>
        inRange(bill.dateTime, query.range) &&
        (!search || bill.customerName.toLowerCase().includes(search)),
    );
  }

  async getDailyReport(range: ReportRange): Promise<DailyReportResult> {
    this.session.requirePermission("reports.daily.view");
    const bills = (await this.allCurrentBills()).filter(
      (bill) => bill.status === "active" && inRange(bill.dateTime, range),
    );
    const aggregated = new Map<string, DailyReportResult["items"][number]>();
    for (const bill of [...bills].sort(
      (a, b) => Date.parse(a.dateTime) - Date.parse(b.dateTime),
    )) {
      for (const line of bill.lines) {
        const current = aggregated.get(line.name) ?? {
          itemName: line.name,
          quantity: 0,
          profit: 0,
          revenue: 0,
          latestSalePrice: line.salePrice,
          latestCostPrice: line.costPrice,
          latestDateTime: bill.dateTime,
        };
        current.quantity += line.quantity;
        current.revenue += line.quantity * line.salePrice;
        current.profit += line.quantity * (line.salePrice - line.costPrice);
        current.latestSalePrice = line.salePrice;
        current.latestCostPrice = line.costPrice;
        current.latestDateTime = bill.dateTime;
        aggregated.set(line.name, current);
      }
    }
    const items = [...aggregated.values()].sort((a, b) =>
      a.itemName.localeCompare(b.itemName),
    );
    return {
      rangeLabel: rangeBounds(range)?.label ?? "All time",
      items,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      totalRevenue: items.reduce((sum, item) => sum + item.revenue, 0),
      totalProfit: items.reduce((sum, item) => sum + item.profit, 0),
    };
  }

  async getMonthlyReport(range: ReportRange): Promise<MonthlyReportResult> {
    this.session.requirePermission("reports.monthly.view");
    const bills = (await this.allCurrentBills()).filter(
      (bill) => bill.status === "active" && inRange(bill.dateTime, range),
    );
    const quantities = new Map<string, number>();
    for (const bill of bills) {
      for (const line of bill.lines)
        quantities.set(
          line.name,
          (quantities.get(line.name) ?? 0) + line.quantity,
        );
    }
    const items = [...quantities]
      .map(([itemName, quantity]) => ({ itemName, quantity }))
      .sort((a, b) => a.itemName.localeCompare(b.itemName));
    return {
      rangeLabel: rangeBounds(range)?.label ?? "All time",
      items,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }
}

export { inRange, rangeBounds, toMenuItem, toMoney, toPaisas };
