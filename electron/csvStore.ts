import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type { BillRow, MenuItem, SaleRow } from "../shared/contracts";

const MENU_COLUMNS = ["name", "costPrice", "salePrice"] as const;
const SALES_COLUMNS = ["orderId", "dateTime", "itemName", "quantity", "costPrice", "salePrice", "lineProfit"] as const;
const BILLS_COLUMNS = ["billId", "orderNo", "dateTime", "customerName", "itemName", "quantity", "salePrice", "lineTotal"] as const;
const VOIDS_COLUMNS = ["billId", "voidedAt", "reason"] as const;
const BILLS_FILE_PATTERN = /^bills_(\d+)_(\d+)\.csv$/;

type CsvCell = string | number | boolean | null | undefined
type RawCsvRow = Record<string, string | undefined>

interface VoidRow {
  billId: string
  voidedAt: string
  reason: string
}

interface VoidInfo {
  voided: boolean
  voidReason: string | null
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readCsv(filePath: string, columns: readonly string[]): RawCsvRow[] {
  if (!fs.existsSync(filePath)) return [];

  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return [];

  const parsed = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
  return parsed.data.map((row) => {
    const clean: RawCsvRow = {};
    for (const column of columns) clean[column] = row[column];
    return clean;
  });
}

function serializeRows<T extends object>(rows: readonly T[], columns: readonly (keyof T)[]): string {
  if (!rows.length) return "";
  const values: CsvCell[][] = rows.map((row) => columns.map((column) => row[column] as CsvCell));
  return `${Papa.unparse(values, { newline: "\n" })}\n`;
}

function writeCsv<T extends object>(filePath: string, rows: readonly T[], columns: readonly (keyof T)[]): void {
  const csv = `${columns.map(String).join(",")}\n${serializeRows(rows, columns)}`;
  fs.writeFileSync(filePath, csv, "utf8");
}

// Migrate stale headers before append so columns cannot silently shift.
function migrateHeaderIfNeeded(filePath: string, columns: readonly string[]): void {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, "utf8");
  const firstLine = raw.split("\n")[0] ?? "";
  const existingColumns = firstLine.split(",").map((value) => value.trim());
  const upToDate =
    existingColumns.length === columns.length && existingColumns.every((column, index) => column === columns[index]);
  if (upToDate) return;

  const migrated = readCsv(filePath, columns).map((row) => {
    const clean: Record<string, string> = {};
    for (const column of columns) clean[column] = row[column] ?? "";
    return clean;
  });
  writeCsv(filePath, migrated, columns);
}

function appendCsv<T extends object>(filePath: string, rows: readonly T[], columns: readonly (keyof T)[]): void {
  if (!rows.length) return;

  migrateHeaderIfNeeded(filePath, columns.map(String));
  const body = serializeRows(rows, columns);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${columns.map(String).join(",")}\n${body}`, "utf8");
  } else {
    fs.appendFileSync(filePath, body, "utf8");
  }
}

function appendGroupedByMonth<T extends { dateTime: string }>(
  rows: readonly T[],
  pathForMonth: (year: number, month: number) => string,
  columns: readonly (keyof T)[]
): void {
  if (!rows.length) return;

  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const date = new Date(row.dateTime);
    const key = `${date.getFullYear()}_${date.getMonth() + 1}`;
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }

  for (const [key, groupRows] of grouped) {
    const [yearText, monthText] = key.split("_");
    appendCsv(pathForMonth(Number(yearText), Number(monthText)), groupRows, columns);
  }
}

function localNow(): string {
  const date = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function attachVoidInfo<T>(rows: readonly T[], getId: (row: T) => string, voidedMap: Map<string, string>): Array<T & VoidInfo> {
  return rows.map((row) => {
    const voidReason = voidedMap.get(getId(row));
    return { ...row, voided: Boolean(voidReason), voidReason: voidReason || null };
  });
}

export class CsvStore {
  private readonly dataDir: string;
  private readonly menuPath: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    ensureDir(this.dataDir);
    this.menuPath = path.join(this.dataDir, "menu.csv");
  }

  private salesLogPath(year: number, month: number): string {
    return path.join(this.dataDir, `sales_log_${year}_${String(month).padStart(2, "0")}.csv`);
  }

  private billsLogPath(year: number, month: number): string {
    return path.join(this.dataDir, `bills_${year}_${String(month).padStart(2, "0")}.csv`);
  }

  private voidsPath(): string {
    return path.join(this.dataDir, "voids.csv");
  }

  private getVoidedMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const row of readCsv(this.voidsPath(), VOIDS_COLUMNS)) {
      map.set(row.billId ?? "", row.reason ?? "");
    }
    return map;
  }

  voidBill(billId: string, reason: string): void {
    const rows: VoidRow[] = [{ billId, voidedAt: localNow(), reason }];
    appendCsv(this.voidsPath(), rows, VOIDS_COLUMNS);
  }

  getMenu(): MenuItem[] {
    return readCsv(this.menuPath, MENU_COLUMNS).map((row) => ({
      name: row.name ?? "",
      costPrice: Number(row.costPrice),
      salePrice: Number(row.salePrice)
    }));
  }

  saveMenu(items: MenuItem[]): MenuItem[] {
    const rows: MenuItem[] = items.map((item) => ({
      name: item.name,
      costPrice: item.costPrice,
      salePrice: item.salePrice
    }));
    writeCsv(this.menuPath, rows, MENU_COLUMNS);
    return this.getMenu();
  }

  appendSale(rows: SaleRow[]): void {
    appendGroupedByMonth(rows, (year, month) => this.salesLogPath(year, month), SALES_COLUMNS);
  }

  getSalesForMonth(year: number, month: number): SaleRow[] {
    const rows: SaleRow[] = readCsv(this.salesLogPath(year, month), SALES_COLUMNS).map((row) => ({
      orderId: row.orderId ?? "",
      dateTime: row.dateTime ?? "",
      itemName: row.itemName ?? "",
      quantity: Number(row.quantity),
      costPrice: Number(row.costPrice),
      salePrice: Number(row.salePrice),
      lineProfit: Number(row.lineProfit)
    }));
    return attachVoidInfo(rows, (row) => row.orderId, this.getVoidedMap());
  }

  appendBill(rows: BillRow[]): void {
    appendGroupedByMonth(rows, (year, month) => this.billsLogPath(year, month), BILLS_COLUMNS);
  }

  getBillsForMonth(year: number, month: number): BillRow[] {
    return attachVoidInfo(this.readBillsFile(this.billsLogPath(year, month)), (row) => row.billId, this.getVoidedMap());
  }

  private readBillsFile(filePath: string): BillRow[] {
    return readCsv(filePath, BILLS_COLUMNS).map((row) => ({
      billId: row.billId ?? "",
      orderNo: row.orderNo ?? "",
      dateTime: row.dateTime ?? "",
      customerName: row.customerName ?? "",
      itemName: row.itemName ?? "",
      quantity: Number(row.quantity),
      salePrice: Number(row.salePrice),
      lineTotal: Number(row.lineTotal)
    }));
  }

  searchBillsByName(query: string): BillRow[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    const files = fs.readdirSync(this.dataDir).filter((file) => BILLS_FILE_PATTERN.test(file));
    const matches: BillRow[] = [];
    for (const file of files) {
      for (const row of this.readBillsFile(path.join(this.dataDir, file))) {
        if (row.customerName.toLowerCase().includes(normalizedQuery)) matches.push(row);
      }
    }
    return attachVoidInfo(matches, (row) => row.billId, this.getVoidedMap());
  }
}
