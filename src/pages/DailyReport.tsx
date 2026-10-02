import { useCallback, useEffect, useMemo, useState, FC } from "react";
import { Download } from "lucide-react";
import type { DailyReportResult, ReportRange } from "../../shared/contracts";
import RangePicker from "../components/RangePicker";
import { formatMoney } from "../format";
import { userErrorMessage } from "../userError";
import { karachiDateInputValue } from "../../shared/date";

const initialRange: ReportRange = {
  kind: "day",
  anchorDate: karachiDateInputValue(),
};

interface MetricProps {
  label: string;
  value: string;
  accent?: boolean;
}

const DailyReport: FC = () => {
  const [range, setRange] = useState<ReportRange>(initialRange);
  const [report, setReport] = useState<DailyReportResult | null>(null);
  const [error, setError] = useState("");

  const loadReport = useCallback(async (): Promise<void> => {
    setError("");
    try {
      setReport(await window.pos.getDailyReport(range));
    } catch (caught: unknown) {
      setError(userErrorMessage(caught, "We could not load the report."));
    }
  }, [range]);

  const exportReport = useCallback(async (): Promise<void> => {
    setError("");
    try {
      await window.pos.exportCsv({ kind: "daily-report", range });
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
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-brand-navy">
            Daily Profit Report
          </h1>
          <p className="text-sm text-brand-muted font-semibold">
            Historical item snapshots keep profit accurate after price changes
            and edits.
          </p>
        </div>
        <div className="flex gap-2">
          <RangePicker value={range} onChange={setRange} />
          <button
            onClick={exportReport}
            className="px-4 py-2 rounded-xl bg-white font-bold text-sm flex items-center justify-center gap-2"
          >
            <Download size={16} /> CSV
          </button>
        </div>
      </div>
      {error && <p className="text-brand-red font-bold mb-4">{error}</p>}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Metric label="Items sold" value={String(report?.totalQuantity ?? 0)} />
        <Metric
          label="Revenue"
          value={formatMoney(report?.totalRevenue ?? 0)}
        />
        <Metric
          label="Profit"
          value={formatMoney(report?.totalProfit ?? 0)}
          accent
        />
      </div>
      <div className="bg-white rounded-2xl shadow-pos overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-navy text-xs uppercase text-white/80">
              <th className="text-left px-6 py-3">Item</th>
              <th className="text-right px-6 py-3">Quantity</th>
              <th className="text-right px-6 py-3">Latest cost</th>
              <th className="text-right px-6 py-3">Latest sale</th>
              <th className="text-right px-6 py-3">Revenue</th>
              <th className="text-right px-6 py-3">Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={item.itemName}>
                <td className="px-6 py-4 font-bold">{item.itemName}</td>
                <td className="px-6 py-4 text-right">{item.quantity}</td>
                <td className="px-6 py-4 text-right">
                  {formatMoney(item.latestCostPrice)}
                </td>
                <td className="px-6 py-4 text-right">
                  {formatMoney(item.latestSalePrice)}
                </td>
                <td className="px-6 py-4 text-right">
                  {formatMoney(item.revenue)}
                </td>
                <td className="px-6 py-4 text-right font-bold text-brand-teal">
                  {formatMoney(item.profit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && (
          <p className="text-center py-16 font-semibold text-brand-muted">
            No active sales in this range.
          </p>
        )}
      </div>
    </div>
  );
};

const Metric: FC<MetricProps> = ({ label, value, accent = false }) => {
  return (
    <div
      className={`rounded-2xl p-5 shadow-pos ${accent ? "bg-brand-teal text-white" : "bg-white"}`}
    >
      <p className="text-xs font-bold uppercase opacity-70">{label}</p>
      <p className="font-display font-bold text-3xl mt-2">{value}</p>
    </div>
  );
};

export default DailyReport;
