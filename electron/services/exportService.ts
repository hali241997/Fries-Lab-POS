import fs from "node:fs";
import path from "node:path";
import { app, dialog } from "electron";
import Papa from "papaparse";
import type { ExportRequest, ExportResult } from "../../shared/contracts";
import { karachiDateInputValue } from "../../shared/date";
import type { PosService } from "./posService";

function rangeSuffix(request: ExportRequest): string {
  const range = request.range;
  if (!range || range.kind === "all") return "all-time";
  if (range.kind === "year")
    return String(range.year ?? new Date().getFullYear());
  if (range.kind === "month")
    return `${range.year}-${String(range.month).padStart(2, "0")}`;
  return range.anchorDate ?? karachiDateInputValue();
}

export class ExportService {
  constructor(private readonly pos: PosService) {}

  async exportCsv(request: ExportRequest): Promise<ExportResult> {
    let records: Array<Record<string, string | number | boolean | null>>;
    if (request.kind === "menu") {
      records = (await this.pos.getMenu()).map((item) => ({
        name: item.name,
        costPrice: item.costPrice,
        salePrice: item.salePrice,
        active: item.active,
        availableForSale: item.availableForSale,
      }));
    } else if (request.kind === "daily-report") {
      const report = await this.pos.getDailyReport(
        request.range ?? { kind: "all" },
      );
      records = report.items.map((item) => ({
        range: report.rangeLabel,
        item: item.itemName,
        quantity: item.quantity,
        latestCostPrice: item.latestCostPrice,
        latestSalePrice: item.latestSalePrice,
        revenue: item.revenue,
        profit: item.profit,
      }));
    } else if (request.kind === "monthly-report") {
      const report = await this.pos.getMonthlyReport(
        request.range ?? { kind: "all" },
      );
      records = report.items.map((item) => ({
        range: report.rangeLabel,
        item: item.itemName,
        quantity: item.quantity,
      }));
    } else {
      const bills = await this.pos.getBills({
        range: request.range ?? { kind: "all" },
        customerSearch: request.customerSearch,
      });
      records = bills.flatMap((bill) =>
        bill.lines.map((line) => ({
          orderId: bill.id,
          revisionId: bill.revisionId,
          revision: bill.revisionNumber,
          receiptNumber: bill.orderNo,
          occurredAt: bill.dateTime,
          revisedAt: bill.revisedAt,
          customer: bill.customerName,
          status: bill.status,
          item: line.name,
          quantity: line.quantity,
          costPrice: line.costPrice,
          salePrice: line.salePrice,
          lineTotal: line.quantity * line.salePrice,
          orderTotal: bill.total,
          terminal: bill.terminalCode,
          employee: bill.employeeName,
        })),
      );
    }

    const filename = `fries-lab-${request.kind}-${rangeSuffix(request)}.csv`;
    const result = await dialog.showSaveDialog({
      title: "Export CSV",
      defaultPath: path.join(app.getPath("documents"), filename),
      filters: [{ name: "CSV files", extensions: ["csv"] }],
    });
    if (result.canceled || !result.filePath)
      return { cancelled: true, filePath: null };
    const csv = records.length ? Papa.unparse(records, { newline: "\n" }) : "";
    fs.writeFileSync(result.filePath, `${csv}${csv ? "\n" : ""}`, "utf8");
    return { cancelled: false, filePath: result.filePath };
  }
}
