import { formatMoney } from "../format";
import type { Bill } from "../../shared/contracts";

interface ReceiptContentProps {
  order: Bill;
}

export default function ReceiptContent({ order }: ReceiptContentProps) {
  const { orderNo, dateTime, customerName, lines, total } = order;
  const dt = new Date(dateTime);

  return (
    <div className="receipt">
      <h2 className="font-display text-center m-0 mb-1 text-lg">Fries Lab</h2>
      <p className="text-center text-[11px] m-0 mb-2">Receipt</p>
      <p className="text-[11px] m-0">Order #{orderNo}</p>
      {customerName && <p className="text-[11px] m-0">For: {customerName}</p>}
      <p className="text-[11px] m-0 mb-2">
        Date:{" "}
        {dt.toLocaleString([], {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })}
      </p>
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
  );
}
