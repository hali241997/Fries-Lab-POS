import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

export interface LegacyMenuRow {
  name: string;
  costPrice: number;
  salePrice: number;
}

export interface LegacySaleRow {
  orderId: string;
  dateTime: string;
  itemName: string;
  quantity: number;
  costPrice: number;
  salePrice: number;
  lineProfit: number;
}

export interface LegacyBillRow {
  billId: string;
  orderNo: string;
  dateTime: string;
  customerName: string;
  itemName: string;
  quantity: number;
  salePrice: number;
  lineTotal: number;
  sourceFile: string;
  sourceIndex: number;
}

export interface LegacyVoidRow {
  billId: string;
  voidedAt: string;
  reason: string;
}

export interface LegacyData {
  sourceFiles: string[];
  menu: LegacyMenuRow[];
  sales: LegacySaleRow[];
  bills: LegacyBillRow[];
  voids: LegacyVoidRow[];
  warnings: string[];
}

function rows(filePath: string): Array<Record<string, string | undefined>> {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  return parsed.data;
}

function finite(
  value: string | undefined,
  label: string,
  warnings: string[],
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    warnings.push(`${label} has an invalid number: ${value ?? "missing"}`);
    return 0;
  }
  return parsed;
}

export function readLegacyData(dataDir: string): LegacyData {
  if (!fs.existsSync(dataDir))
    return {
      sourceFiles: [],
      menu: [],
      sales: [],
      bills: [],
      voids: [],
      warnings: [],
    };
  const names = fs
    .readdirSync(dataDir)
    .filter(
      (name) =>
        name === "menu.csv" ||
        name === "voids.csv" ||
        /^sales_log_\d+_\d+\.csv$/.test(name) ||
        /^bills_\d+_\d+\.csv$/.test(name),
    )
    .sort();
  const result: LegacyData = {
    sourceFiles: names.map((name) => path.join(dataDir, name)),
    menu: [],
    sales: [],
    bills: [],
    voids: [],
    warnings: [],
  };
  for (const name of names) {
    const filePath = path.join(dataDir, name);
    const data = rows(filePath);
    if (name === "menu.csv") {
      result.menu.push(
        ...data.map((row, index) => ({
          name: row.name?.trim() ?? `Unknown item ${index + 1}`,
          costPrice: finite(
            row.costPrice,
            `${name} row ${index + 2} costPrice`,
            result.warnings,
          ),
          salePrice: finite(
            row.salePrice,
            `${name} row ${index + 2} salePrice`,
            result.warnings,
          ),
        })),
      );
    } else if (name === "voids.csv") {
      result.voids.push(
        ...data.map((row) => ({
          billId: row.billId ?? "",
          voidedAt: row.voidedAt ?? "",
          reason: row.reason ?? "",
        })),
      );
    } else if (name.startsWith("sales_log_")) {
      result.sales.push(
        ...data.map((row, index) => ({
          orderId: row.orderId ?? "",
          dateTime: row.dateTime ?? "",
          itemName: row.itemName ?? "",
          quantity: finite(
            row.quantity,
            `${name} row ${index + 2} quantity`,
            result.warnings,
          ),
          costPrice: finite(
            row.costPrice,
            `${name} row ${index + 2} costPrice`,
            result.warnings,
          ),
          salePrice: finite(
            row.salePrice,
            `${name} row ${index + 2} salePrice`,
            result.warnings,
          ),
          lineProfit: finite(
            row.lineProfit,
            `${name} row ${index + 2} lineProfit`,
            result.warnings,
          ),
        })),
      );
    } else {
      result.bills.push(
        ...data.map((row, index) => ({
          billId: row.billId ?? "",
          orderNo: row.orderNo ?? "",
          dateTime: row.dateTime ?? "",
          customerName: row.customerName ?? "",
          itemName: row.itemName ?? "",
          quantity: finite(
            row.quantity,
            `${name} row ${index + 2} quantity`,
            result.warnings,
          ),
          salePrice: finite(
            row.salePrice,
            `${name} row ${index + 2} salePrice`,
            result.warnings,
          ),
          lineTotal: finite(
            row.lineTotal,
            `${name} row ${index + 2} lineTotal`,
            result.warnings,
          ),
          sourceFile: name,
          sourceIndex: index,
        })),
      );
    }
  }
  return result;
}
