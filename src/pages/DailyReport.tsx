import { useEffect, useState } from "react";
import { ChartLine } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney } from "../format";
import type { SaleRow, SalesReportItem } from "../../shared/contracts";

const CHART_COLORS = [
  "#E5383B",
  "#2A9D8F",
  "#1D3557",
  "#F4A261",
  "#8ECAE6",
  "#FFB703",
  "#E76F51",
  "#457B9D",
];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DailyReport() {
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<SaleRow[]>([]);

  useEffect(() => {
    const [year, month] = date.split("-").map(Number);
    if (!year || !month) return;
    window.pos.getSalesForMonth(year, month).then((sales) => {
      const dayRows = sales.filter(
        (s) => !s.voided && s.dateTime.slice(0, 10) === date,
      );
      setRows(dayRows);
    });
  }, [date]);

  const byItem = new Map<string, SalesReportItem>();
  for (const r of rows) {
    const entry = byItem.get(r.itemName) || {
      itemName: r.itemName,
      quantity: 0,
      profit: 0,
      revenue: 0,
      latestSalePrice: r.salePrice,
      latestCostPrice: r.costPrice,
      latestDateTime: r.dateTime,
    };
    entry.quantity += r.quantity;
    entry.revenue += r.quantity * r.salePrice;
    entry.profit += r.lineProfit;
    if (r.dateTime >= entry.latestDateTime) {
      entry.latestSalePrice = r.salePrice;
      entry.latestCostPrice = r.costPrice;
      entry.latestDateTime = r.dateTime;
    }
    byItem.set(r.itemName, entry);
  }
  const items = Array.from(byItem.values()).sort((a, b) => b.profit - a.profit);

  const totalItemsSold = items.reduce((s, i) => s + i.quantity, 0);
  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);
  const totalProfit = items.reduce((s, i) => s + i.profit, 0);

  const chartData = items.map((i) => ({ name: i.itemName, value: i.profit }));

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-brand-navy">
            Daily Profit Report
          </h1>
          <p className="text-sm font-semibold text-brand-muted">
            See how much you made today, item by item.
          </p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-4 py-2.5 rounded-2xl bg-white border border-gray-100 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-red/30"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 shadow-pos border border-gray-50">
          <p className="text-xs font-bold text-brand-muted uppercase tracking-wide mb-2">
            Items Sold
          </p>
          <p className="font-display font-bold text-3xl text-brand-navy">
            {totalItemsSold}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-pos border border-gray-50">
          <p className="text-xs font-bold text-brand-muted uppercase tracking-wide mb-2">
            Revenue
          </p>
          <p className="font-display font-bold text-3xl text-brand-navy">
            {formatMoney(totalRevenue)}
          </p>
        </div>
        <div className="bg-brand-teal rounded-2xl p-5 shadow-pos border border-gray-50">
          <p className="text-xs font-bold uppercase tracking-wide mb-2 text-white/80">
            Total Profit
          </p>
          <p className="font-display font-bold text-3xl text-white">
            {formatMoney(totalProfit)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-2xl shadow-pos border border-gray-50 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h2 className="font-display font-bold text-lg text-brand-navy">
              Profit by Item
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-cream/60 text-brand-muted text-xs uppercase tracking-wide font-bold">
                <th className="text-left px-6 py-3">Item</th>
                <th className="text-right px-6 py-3">Qty Sold</th>
                <th className="text-right px-6 py-3">Latest Sale Price</th>
                <th className="text-right px-6 py-3">Latest Cost Price</th>
                <th className="text-right px-6 py-3">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((i) => (
                <tr key={i.itemName}>
                  <td className="px-6 py-4 font-bold text-sm">{i.itemName}</td>
                  <td className="px-6 py-4 text-right font-semibold text-brand-muted">
                    {i.quantity}
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-brand-navy">
                    {formatMoney(i.latestSalePrice)}
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-brand-muted">
                    {formatMoney(i.latestCostPrice)}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-brand-teal">
                    {formatMoney(i.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="bg-brand-cream/40">
                  <td
                    className="px-6 py-4 font-display font-bold text-brand-navy"
                    colSpan={4}
                  >
                    Total Profit
                  </td>
                  <td className="px-6 py-4 text-right font-display font-bold text-lg text-brand-teal">
                    {formatMoney(totalProfit)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
              <div className="w-16 h-16 rounded-2xl bg-brand-cream flex items-center justify-center text-brand-red text-2xl mx-auto">
                <ChartLine size={22} />
              </div>
              <p className="font-bold text-sm text-brand-muted mt-3">
                No sales recorded for this date yet.
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-pos border border-gray-50 p-5">
          <h2 className="font-display font-bold text-lg text-brand-navy mb-2">
            Profit Distribution
          </h2>
          <div style={{ height: 360 }}>
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm font-semibold text-brand-muted">
                No data to chart yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {chartData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatMoney(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {chartData.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 justify-center">
              {chartData.map((d, i) => (
                <div
                  key={d.name}
                  className="flex items-center gap-1.5 text-xs font-semibold text-brand-muted"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{
                      background: CHART_COLORS[i % CHART_COLORS.length],
                    }}
                  />
                  {d.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
