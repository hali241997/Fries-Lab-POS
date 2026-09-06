import React from 'react'
import { formatMoney } from '../format.js'

export default function Receipt({ order }) {
  if (!order) return <div id="print-area" />

  const { orderNo, dateTime, lines, total } = order
  const dt = new Date(dateTime)

  return (
    <div id="print-area">
      <div className="receipt">
        <h2 className="font-display text-center m-0 mb-1 text-lg">Fries Lab</h2>
        <p className="text-center text-[11px] m-0 mb-2">Receipt</p>
        <p className="text-[11px] m-0">Order #{orderNo}</p>
        <p className="text-[11px] m-0 mb-2">Date: {dt.toLocaleString()}</p>
        <hr />
        <table className="receipt-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.name}>
                <td>{l.name}</td>
                <td>{l.quantity}</td>
                <td>{formatMoney(l.quantity * l.salePrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr />
        <p className="flex justify-between font-bold text-sm">
          <span>Total</span>
          <span>{formatMoney(total)}</span>
        </p>
        <p className="text-center text-[11px] mt-3">Thank you for visiting!</p>
      </div>
    </div>
  )
}
