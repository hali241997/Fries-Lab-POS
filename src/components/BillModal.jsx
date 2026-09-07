import React from 'react'
import { Printer, X } from 'lucide-react'
import ReceiptContent from './ReceiptContent.jsx'

export default function BillModal({ bill, onClose }) {
  if (!bill) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-xl text-brand-navy">Bill #{bill.orderNo}</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-brand-cream flex items-center justify-center text-brand-muted tactile-btn"
          >
            <X size={16} />
          </button>
        </div>

        <div className="bg-brand-cream/60 rounded-2xl p-5 flex justify-center">
          <ReceiptContent order={bill} />
        </div>

        <div className="flex gap-3 pt-5">
          <button
            onClick={onClose}
            className="tactile-btn flex-1 py-3 rounded-xl bg-gray-100 text-brand-ink font-bold text-sm"
          >
            Close
          </button>
          <button
            onClick={() => window.print()}
            className="tactile-btn flex-1 py-3 rounded-xl bg-brand-teal text-white font-bold text-sm shadow-pos flex items-center justify-center gap-2"
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </div>
    </div>
  )
}
