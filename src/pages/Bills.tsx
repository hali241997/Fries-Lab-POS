import { useCallback, useEffect, useState, FC } from "react";
import { Download, Receipt, Search } from "lucide-react";
import type { Bill, ReportRange } from "../../shared/contracts";
import RangePicker from "../components/RangePicker";
import { formatMoney } from "../format";
import { userErrorMessage } from "../userError";
import { karachiDateInputValue } from "../../shared/date";

interface BillsProps {
  onSelectBill: (bill: Bill) => void;
  refreshKey: number;
}
const initialRange: ReportRange = {
  kind: "day",
  anchorDate: karachiDateInputValue(),
};

const Bills: FC<BillsProps> = ({ onSelectBill, refreshKey }) => {
  const [range, setRange] = useState<ReportRange>(initialRange);
  const [query, setQuery] = useState("");
  const [bills, setBills] = useState<Bill[]>([]);
  const [error, setError] = useState("");

  const loadBills = useCallback(async (): Promise<void> => {
    setError("");
    try {
      setBills(await window.pos.getBills({ range, customerSearch: query }));
    } catch (caught: unknown) {
      setError(userErrorMessage(caught, "We could not load the bills."));
    }
  }, [query, range]);

  const exportBills = useCallback(async (): Promise<void> => {
    setError("");
    try {
      await window.pos.exportCsv({
        kind: "bills",
        range,
        customerSearch: query,
      });
    } catch (caught: unknown) {
      setError(userErrorMessage(caught, "We could not export the bills."));
    }
  }, [query, range]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadBills();
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [loadBills, refreshKey]);

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-brand-navy">
            Bills
          </h1>
          <p className="text-sm font-semibold text-brand-muted">
            Search, print, edit, cancel, or export bills.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RangePicker value={range} onChange={setRange} />
          <div className="relative">
            <Search size={15} className="absolute left-3 top-3 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Customer…"
              className="pl-9 pr-3 py-2 rounded-xl border"
            />
          </div>
          <button
            onClick={exportBills}
            className="px-4 py-2 rounded-xl bg-white font-bold text-sm flex items-center justify-center gap-2"
          >
            <Download size={16} /> CSV
          </button>
        </div>
      </div>
      {error && <p className="mb-4 font-bold text-brand-red">{error}</p>}
      <div className="bg-white rounded-2xl shadow-pos overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-navy text-xs uppercase text-white/80">
              <th className="text-left px-6 py-3">Receipt</th>
              <th className="text-left px-6 py-3">Customer</th>
              <th className="text-left px-6 py-3">Date</th>
              <th className="text-left px-6 py-3">Status</th>
              <th className="text-right px-6 py-3">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {bills.map((bill) => (
              <tr
                key={bill.id}
                onClick={() => onSelectBill(bill)}
                className="cursor-pointer hover:bg-brand-cream/40"
              >
                <td className="px-6 py-4 font-bold">
                  {bill.orderNo}
                  <span className="ml-2 text-xs text-brand-muted">
                    v{bill.revisionNumber}
                  </span>
                </td>
                <td className="px-6 py-4">{bill.customerName}</td>
                <td className="px-6 py-4">
                  {new Date(bill.dateTime).toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-bold ${bill.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
                  >
                    {bill.status}
                  </span>
                </td>
                <td
                  className={`px-6 py-4 text-right font-bold ${bill.status === "cancelled" ? "line-through opacity-50" : ""}`}
                >
                  {formatMoney(bill.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!bills.length && (
          <div className="py-16 text-center text-brand-muted">
            <Receipt className="mx-auto mb-2" />
            <p className="font-bold">
              {query.trim()
                ? "No bills match this customer search."
                : "No bills in this range."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Bills;
