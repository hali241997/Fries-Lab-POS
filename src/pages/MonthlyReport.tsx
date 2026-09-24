import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyReportItem, SaleRow } from "../../shared/contracts";

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function MonthlyReport() {
  const [month, setMonth] = useState(currentMonthStr());
  const [rows, setRows] = useState<SaleRow[]>([]);

  useEffect(() => {
    const [year, m] = month.split("-").map(Number);
    if (!year || !m) return;
    window.pos
      .getSalesForMonth(year, m)
      .then((sales) => setRows(sales.filter((s) => !s.voided)));
  }, [month]);

  const byItem = new Map<string, MonthlyReportItem>();
  for (const r of rows) {
    const entry = byItem.get(r.itemName) || {
      itemName: r.itemName,
      quantity: 0,
    };
    entry.quantity += r.quantity;
    byItem.set(r.itemName, entry);
  }
  const items = Array.from(byItem.values()).sort(
    (a, b) => b.quantity - a.quantity,
  );
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);

  const chartData = [...items]
    .reverse()
    .map((i) => ({ name: i.itemName, units: i.quantity }));
  const chartHeight = Math.max(240, chartData.length * 40);

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-brand-navy">
            Monthly Sales Report
          </h1>
          <p className="text-sm font-semibold text-brand-muted">
            Quantity sold per item this month.
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-4 py-2.5 rounded-2xl bg-white border border-gray-100 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-red/30"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 shadow-pos border border-gray-50">
          <p className="text-xs font-bold text-brand-muted uppercase tracking-wide mb-2">
            Distinct Items Sold
          </p>
          <p className="font-display font-bold text-3xl text-brand-navy">
            {items.length}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-pos border border-gray-50">
          <p className="text-xs font-bold text-brand-muted uppercase tracking-wide mb-2">
            Total Units Sold
          </p>
          <p className="font-display font-bold text-3xl text-brand-navy">
            {totalUnits}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-2xl shadow-pos border border-gray-50 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h2 className="font-display font-bold text-lg text-brand-navy">
              Sales by Item
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-cream/60 text-brand-muted text-xs uppercase tracking-wide font-bold">
                <th className="text-left px-6 py-3">Item</th>
                <th className="text-right px-6 py-3">Quantity Sold</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((i) => (
                <tr key={i.itemName}>
                  <td className="px-6 py-4 font-bold text-sm">{i.itemName}</td>
                  <td className="px-6 py-4 text-right font-bold text-brand-navy">
                    {i.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="bg-brand-cream/40">
                  <td className="px-6 py-4 font-display font-bold text-brand-navy">
                    Total Units
                  </td>
                  <td className="px-6 py-4 text-right font-display font-bold text-lg text-brand-teal">
                    {totalUnits}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
              <div className="w-16 h-16 rounded-2xl bg-brand-cream flex items-center justify-center text-brand-red text-2xl mx-auto">
                <CalendarDays size={22} />
              </div>
              <p className="font-bold text-sm text-brand-muted mt-3">
                No sales recorded for this month yet.
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-pos border border-gray-50 p-5">
          <h2 className="font-display font-bold text-lg text-brand-navy mb-2">
            Top Sellers
          </h2>
          <div style={{ height: 360 }} className="overflow-y-auto">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm font-semibold text-brand-muted">
                No data to chart yet
              </div>
            ) : (
              <div style={{ height: chartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 10, right: 20, bottom: 10, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      tick={{ fontSize: 11, fill: "#264653" }}
                    />
                    <Bar
                      dataKey="units"
                      fill="#E5383B"
                      radius={[0, 6, 6, 0]}
                      barSize={16}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
