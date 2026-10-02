import { useCallback, useEffect, useMemo, useState, FC } from "react";
import { Download } from "lucide-react";
import type { MonthlyReportResult, ReportRange } from "../../shared/contracts";
import { karachiYearMonth } from "../../shared/date";
import RangePicker from "../components/RangePicker";
import { userErrorMessage } from "../userError";

const current = karachiYearMonth();
const initialRange: ReportRange = {
  kind: "month",
  year: current.year,
  month: current.month,
};

const MonthlyReport: FC = () => {
  const [range, setRange] = useState<ReportRange>(initialRange);
  const [report, setReport] = useState<MonthlyReportResult | null>(null);
  const [error, setError] = useState("");

  const loadReport = useCallback(async (): Promise<void> => {
    setError("");
    try {
      setReport(await window.pos.getMonthlyReport(range));
    } catch (caught: unknown) {
      setError(userErrorMessage(caught, "We could not load the report."));
    }
  }, [range]);

  const exportReport = useCallback(async (): Promise<void> => {
    setError("");
    try {
      await window.pos.exportCsv({ kind: "monthly-report", range });
    } catch (caught: unknown) {
      setError(userErrorMessage(caught, "We could not export the report."));
    }
  }, [range]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const items = useMemo(() => report?.items ?? [], [report]);

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-brand-navy">
            Monthly Report
          </h1>
          <p className="text-sm font-semibold text-brand-muted">
            Quantity sold by item.
          </p>
        </div>
        <div className="flex gap-2">
          <RangePicker value={range} onChange={setRange} monthlyOnly />
          <button
            onClick={exportReport}
            className="px-4 py-2 rounded-xl bg-white font-bold text-sm flex items-center justify-center gap-2"
          >
            <Download size={16} /> CSV
          </button>
        </div>
      </div>
      {error && <p className="text-brand-red font-bold mb-4">{error}</p>}
      <div className="bg-white rounded-2xl shadow-pos overflow-hidden">
        <table className="w-full text-sm">
          <colgroup>
            <col />
            <col className="w-48" />
          </colgroup>
          <thead>
            <tr className="bg-brand-navy text-xs uppercase text-white/80">
              <th className="text-left px-6 py-3">Item</th>
              <th className="text-right px-6 py-3">Quantity sold</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={item.itemName}>
                <td className="px-6 py-4 font-bold">{item.itemName}</td>
                <td className="px-6 py-4 text-right font-bold">
                  {item.quantity}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-brand-cream">
              <td className="px-6 py-4 font-bold">Total</td>
              <td className="px-6 py-4 text-right font-bold">
                {report?.totalQuantity ?? 0}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default MonthlyReport;
