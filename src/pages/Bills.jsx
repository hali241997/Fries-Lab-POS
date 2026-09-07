import React, { useEffect, useState } from 'react'
import { Receipt } from 'lucide-react'
import { formatMoney } from '../format.js'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Bills({ onSelectBill }) {
  const [date, setDate] = useState(todayStr())
  const [rows, setRows] = useState([])

  useEffect(() => {
    const [year, month] = date.split('-').map(Number)
    window.pos.getBillsForMonth(year, month).then((bills) => {
      const dayRows = bills.filter((b) => b.dateTime.slice(0, 10) === date)
      setRows(dayRows)
    })
  }, [date])

  const byBill = new Map()
  for (const r of rows) {
    const entry = byBill.get(r.billId) || {
      billId: r.billId,
      orderNo: r.orderNo,
      dateTime: r.dateTime,
      lines: [],
      total: 0
    }
    entry.lines.push({ name: r.itemName, quantity: r.quantity, salePrice: r.salePrice })
    entry.total += r.lineTotal
    byBill.set(r.billId, entry)
  }
  const bills = Array.from(byBill.values()).sort((a, b) => (a.dateTime < b.dateTime ? 1 : -1))

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-brand-navy">Bills</h1>
          <p className="text-sm font-semibold text-brand-muted">Look up and reprint any past bill.</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-4 py-2.5 rounded-2xl bg-white border border-gray-100 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-red/30"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-pos border border-gray-50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-cream/60 text-brand-muted text-xs uppercase tracking-wide font-bold">
              <th className="text-left px-6 py-3">Order #</th>
              <th className="text-left px-6 py-3">Time</th>
              <th className="text-right px-6 py-3">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {bills.map((bill) => (
              <tr
                key={bill.billId}
                onClick={() => onSelectBill(bill)}
                className="hover:bg-brand-cream/40 cursor-pointer"
              >
                <td className="px-6 py-4 font-bold text-sm">{bill.orderNo}</td>
                <td className="px-6 py-4 text-brand-muted font-semibold">
                  {new Date(bill.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                </td>
                <td className="px-6 py-4 text-right font-bold text-brand-navy">{formatMoney(bill.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {bills.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-brand-cream flex items-center justify-center text-brand-red text-2xl mx-auto">
              <Receipt size={22} />
            </div>
            <p className="font-bold text-sm text-brand-muted mt-3">No bills for this date.</p>
          </div>
        )}
      </div>
    </div>
  )
}
