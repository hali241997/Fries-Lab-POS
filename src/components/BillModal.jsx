import React, { useEffect, useState } from 'react'
import { Minus, Pencil, Plus, Printer, Trash2, X } from 'lucide-react'
import ReceiptContent from './ReceiptContent.jsx'
import { formatMoney } from '../format.js'
import { makeOrderId } from '../idUtils.js'

export default function BillModal({ bill, menu, onClose, onChanged }) {
  const [mode, setMode] = useState('view')
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [editLines, setEditLines] = useState([])
  const [editCustomerName, setEditCustomerName] = useState('')
  const [selectedAddItem, setSelectedAddItem] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setMode('view')
    setConfirmingCancel(false)
    setSelectedAddItem('')
  }, [bill?.billId])

  if (!bill) return null

  async function openEditMode() {
    const dt = new Date(bill.dateTime)
    const sales = await window.pos.getSalesForMonth(dt.getFullYear(), dt.getMonth() + 1)
    const costMap = new Map()
    for (const s of sales) {
      if (s.orderId === bill.billId) costMap.set(s.itemName, s.costPrice)
    }
    setEditLines(
      bill.lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        salePrice: l.salePrice,
        costPrice: costMap.has(l.name) ? costMap.get(l.name) : menu.find((m) => m.name === l.name)?.costPrice ?? 0
      }))
    )
    setEditCustomerName(bill.customerName || '')
    setMode('edit')
  }

  function adjustEditQty(name, delta) {
    setEditLines((prev) =>
      prev.map((l) => (l.name === name ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0)
    )
  }

  function removeEditLine(name) {
    setEditLines((prev) => prev.filter((l) => l.name !== name))
  }

  function addSelectedItem() {
    const menuItem = menu.find((m) => m.name === selectedAddItem)
    if (!menuItem) return
    setEditLines((prev) => {
      const existing = prev.find((l) => l.name === menuItem.name)
      if (existing) {
        return prev.map((l) => (l.name === menuItem.name ? { ...l, quantity: l.quantity + 1 } : l))
      }
      return [...prev, { name: menuItem.name, quantity: 1, salePrice: menuItem.salePrice, costPrice: menuItem.costPrice }]
    })
    setSelectedAddItem('')
  }

  async function confirmCancel() {
    await window.pos.voidBill(bill.billId, 'cancelled')
    setConfirmingCancel(false)
    onChanged(null)
  }

  async function saveEdit() {
    const name = editCustomerName.trim()
    if (!name || editLines.length === 0 || saving) return
    setSaving(true)
    try {
      await window.pos.voidBill(bill.billId, 'edited')

      const newBillId = makeOrderId()
      const dateTime = bill.dateTime
      const total = editLines.reduce((sum, l) => sum + l.quantity * l.salePrice, 0)

      const salesRows = editLines.map((l) => ({
        orderId: newBillId,
        dateTime,
        itemName: l.name,
        quantity: l.quantity,
        costPrice: l.costPrice,
        salePrice: l.salePrice,
        lineProfit: l.quantity * (l.salePrice - l.costPrice)
      }))
      const billRows = editLines.map((l) => ({
        billId: newBillId,
        orderNo: bill.orderNo,
        dateTime,
        customerName: name,
        itemName: l.name,
        quantity: l.quantity,
        salePrice: l.salePrice,
        lineTotal: l.quantity * l.salePrice
      }))

      await window.pos.appendSale(salesRows)
      await window.pos.appendBill(billRows)

      onChanged({
        billId: newBillId,
        orderNo: bill.orderNo,
        dateTime,
        customerName: name,
        lines: editLines.map((l) => ({ name: l.name, quantity: l.quantity, salePrice: l.salePrice })),
        total
      })
    } finally {
      setSaving(false)
    }
  }

  const editTotal = editLines.reduce((sum, l) => sum + l.quantity * l.salePrice, 0)
  const availableToAdd = menu.filter((m) => !editLines.some((l) => l.name === m.name))
  const canSaveEdit = editLines.length > 0 && editCustomerName.trim().length > 0 && !saving

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-3xl shadow-xl w-full p-7 ${mode === 'edit' ? 'max-w-xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-xl text-brand-navy">
            {mode === 'edit' ? 'Edit Bill' : 'Bill'} #{bill.orderNo}
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-brand-cream flex items-center justify-center text-brand-muted tactile-btn"
          >
            <X size={16} />
          </button>
        </div>

        {mode === 'view' ? (
          <>
            <div className="bg-brand-cream/60 rounded-2xl p-5 flex justify-center">
              <ReceiptContent order={bill} />
            </div>

            {!bill.voided && (
              <div className="flex gap-3 pt-5">
                <button
                  onClick={openEditMode}
                  className="tactile-btn flex-1 py-3 rounded-xl bg-brand-navy/10 text-brand-navy font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Pencil size={14} /> Edit Order
                </button>
                <button
                  onClick={() => setConfirmingCancel(true)}
                  className="tactile-btn flex-1 py-3 rounded-xl bg-brand-red/10 text-brand-red font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Trash2 size={14} /> Cancel Order
                </button>
              </div>
            )}

            <div className="flex gap-3 pt-3">
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
          </>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-xs font-bold text-brand-muted mb-1.5 uppercase tracking-wide">
                Customer Name
              </label>
              <input
                type="text"
                value={editCustomerName}
                onChange={(e) => setEditCustomerName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-brand-cream/60 border border-gray-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-red/30"
              />
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2">
              {editLines.length === 0 && (
                <p className="text-center text-sm font-semibold text-brand-muted py-6">
                  No items left. Add one below, or use Cancel Order instead.
                </p>
              )}
              {editLines.map((line) => (
                <div key={line.name} className="flex items-center gap-3 bg-brand-cream rounded-xl p-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{line.name}</p>
                    <p className="text-xs font-bold text-brand-navy">{formatMoney(line.salePrice)} each</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className="w-7 h-7 rounded-lg bg-white border border-gray-100 flex items-center justify-center text-brand-muted tactile-btn"
                      onClick={() => adjustEditQty(line.name, -1)}
                    >
                      <Minus size={12} />
                    </button>
                    <span className="w-6 text-center font-extrabold text-sm">{line.quantity}</span>
                    <button
                      className="w-7 h-7 rounded-lg bg-brand-red text-white flex items-center justify-center tactile-btn"
                      onClick={() => adjustEditQty(line.name, 1)}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <span className="font-extrabold text-sm w-16 text-right">
                    {formatMoney(line.quantity * line.salePrice)}
                  </span>
                  <button
                    onClick={() => removeEditLine(line.name)}
                    className="text-brand-red"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            {availableToAdd.length > 0 && (
              <div className="mt-4 flex gap-2">
                <select
                  value={selectedAddItem}
                  onChange={(e) => setSelectedAddItem(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-brand-cream/60 border border-gray-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-red/30"
                >
                  <option value="">Add an item…</option>
                  {availableToAdd.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name} — {formatMoney(item.salePrice)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={addSelectedItem}
                  disabled={!selectedAddItem}
                  className="tactile-btn px-4 rounded-xl bg-brand-navy text-white font-bold text-sm disabled:bg-gray-200 disabled:text-gray-400"
                >
                  Add
                </button>
              </div>
            )}

            <div className="flex justify-between font-display font-bold text-xl text-brand-navy mt-5 pt-4 border-t border-gray-100">
              <span>Total</span>
              <span>{formatMoney(editTotal)}</span>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setMode('view')}
                className="tactile-btn flex-1 py-3 rounded-xl bg-gray-100 text-brand-ink font-bold text-sm"
              >
                Discard
              </button>
              <button
                onClick={saveEdit}
                disabled={!canSaveEdit}
                className="tactile-btn flex-1 py-3 rounded-xl bg-brand-teal text-white font-bold text-sm shadow-pos disabled:bg-gray-200 disabled:text-gray-400"
              >
                Save Changes
              </button>
            </div>
          </>
        )}
      </div>

      {confirmingCancel && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setConfirmingCancel(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-7 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center mx-auto mb-4 text-xl">
              <Trash2 size={20} />
            </div>
            <h2 className="font-display font-bold text-lg text-brand-navy mb-1">Cancel this order?</h2>
            <p className="text-sm font-semibold text-brand-muted mb-6">
              Bill #{bill.orderNo} will be marked as cancelled and excluded from profit reports.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmingCancel(false)}
                className="tactile-btn flex-1 py-3 rounded-xl bg-gray-100 text-brand-ink font-bold text-sm"
              >
                Keep Order
              </button>
              <button
                onClick={confirmCancel}
                className="tactile-btn flex-1 py-3 rounded-xl bg-brand-red text-white font-bold text-sm shadow-pos"
              >
                Cancel Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
