import { useEffect, useState } from "react";
import { Receipt, Search } from "lucide-react";
import { formatMoney } from "../format";
import type { Bill, BillRow } from "../../shared/contracts";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function groupBills(rows: BillRow[]): Bill[] {
  const byBill = new Map<string, Bill>();
  for (const r of rows) {
    const entry = byBill.get(r.billId) || {
      billId: r.billId,
      orderNo: r.orderNo,
      dateTime: r.dateTime,
      customerName: r.customerName,
      voided: r.voided,
      voidReason: r.voidReason,
      lines: [],
      total: 0,
    };
    entry.lines.push({
      name: r.itemName,
      quantity: r.quantity,
      salePrice: r.salePrice,
    });
    entry.total += r.lineTotal;
    byBill.set(r.billId, entry);
  }
  return Array.from(byBill.values()).sort((a, b) =>
    a.dateTime < b.dateTime ? 1 : -1,
  );
}

interface BillsProps {
  onSelectBill: (bill: Bill) => void;
  refreshKey: number;
}

export default function Bills({ onSelectBill, refreshKey }: BillsProps) {
  const [date, setDate] = useState(todayStr());
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<BillRow[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed) {
      window.pos.searchBillsByName(trimmed).then(setRows);
    } else {
      const [year, month] = date.split("-").map(Number);
      if (!year || !month) return;
      window.pos.getBillsForMonth(year, month).then((bills) => {
        setRows(bills.filter((b) => b.dateTime.slice(0, 10) === date));
      });
    }
  }, [date, query, refreshKey]);

  const bills = groupBills(rows);
  const isSearching = query.trim().length > 0;

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-brand-navy">
            Bills
          </h1>
          <p className="text-sm font-semibold text-brand-muted">
            Look up and reprint any past bill.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name…"
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-gray-100 text-sm font-semibold placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-red/30 shadow-sm"
            />
          </div>
          <input
            type="date"
            value={date}
            disabled={isSearching}
            onChange={(e) => setDate(e.target.value)}
            className="px-4 py-2.5 rounded-2xl bg-white border border-gray-100 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-red/30 disabled:opacity-50"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-pos border border-gray-50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-cream/60 text-brand-muted text-xs uppercase tracking-wide font-bold">
              <th className="text-left px-6 py-3">Order #</th>
              <th className="text-left px-6 py-3">Customer</th>
              <th className="text-left px-6 py-3">
                {isSearching ? "Date" : "Time"}
              </th>
              <th className="text-right px-6 py-3">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {bills.map((bill) => (
              <tr
                key={bill.billId}
                onClick={() => onSelectBill(bill)}
                className={`cursor-pointer ${bill.voided ? "opacity-50" : "hover:bg-brand-cream/40"}`}
              >
                <td className="px-6 py-4 font-bold text-sm">
                  <div className="flex items-center gap-2">
                    {bill.orderNo}
                    {bill.voided && (
                      <span className="px-2 py-0.5 rounded-full bg-brand-red/10 text-brand-red text-[10px] font-bold uppercase tracking-wide">
                        {bill.voidReason === "edited" ? "Edited" : "Cancelled"}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-brand-muted font-semibold">
                  {bill.customerName}
                </td>
                <td className="px-6 py-4 text-brand-muted font-semibold">
                  {isSearching
                    ? new Date(bill.dateTime).toLocaleString([], {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })
                    : new Date(bill.dateTime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                </td>
                <td
                  className={`px-6 py-4 text-right font-bold text-brand-navy ${bill.voided ? "line-through" : ""}`}
                >
                  {formatMoney(bill.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {bills.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-brand-cream flex items-center justify-center text-brand-red text-2xl mx-auto">
              <Receipt size={22} />
            </div>
            <p className="font-bold text-sm text-brand-muted mt-3">
              {isSearching
                ? "No bills match that name."
                : "No bills for this date."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
