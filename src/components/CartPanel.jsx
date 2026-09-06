import React from 'react'
import { CheckCircle2, Minus, Plus, ShoppingCart } from 'lucide-react'
import { formatMoney } from '../format.js'

export default function CartPanel({ cart, orderNo, onChangeQty, onComplete }) {
  const total = cart.reduce((sum, line) => sum + line.quantity * line.salePrice, 0)
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <aside className="w-[340px] bg-white border-l border-gray-100 flex flex-col shrink-0 z-20 shadow-[-8px_0_30px_-15px_rgba(0,0,0,0.08)]">
      <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-xl text-brand-navy">Current Order</h2>
          {orderNo && <span className="text-xs font-bold text-brand-muted">{orderNo}</span>}
        </div>
        <p className="text-xs font-semibold text-brand-muted mt-1">{itemCount} items in cart</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-brand-cream flex items-center justify-center text-brand-red text-2xl">
              <ShoppingCart size={24} />
            </div>
            <p className="font-bold text-sm text-brand-muted">
              Cart is empty
              <br />
              Tap an item to start an order
            </p>
          </div>
        ) : (
          cart.map((line) => (
            <div key={line.name} className="cart-row flex items-center gap-3 bg-brand-cream rounded-2xl p-3">
              <span className="text-2xl">{line.icon || '🍽️'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{line.name}</p>
                <p className="text-xs font-bold text-brand-navy">
                  {line.quantity} x {formatMoney(line.salePrice)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="w-7 h-7 rounded-lg bg-white border border-gray-100 flex items-center justify-center text-brand-muted tactile-btn"
                  onClick={() => onChangeQty(line, -1)}
                >
                  <Minus size={12} />
                </button>
                <span className="w-6 text-center font-extrabold text-sm">{line.quantity}</span>
                <button
                  className="w-7 h-7 rounded-lg bg-brand-red text-white flex items-center justify-center tactile-btn"
                  onClick={() => onChangeQty(line, 1)}
                >
                  <Plus size={12} />
                </button>
              </div>
              <span className="font-extrabold text-sm w-16 text-right">
                {formatMoney(line.quantity * line.salePrice)}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="px-6 py-5 border-t border-gray-100 bg-white shrink-0">
        <div className="flex justify-between font-display font-bold text-2xl text-brand-navy pb-4">
          <span>Total</span>
          <span>{formatMoney(total)}</span>
        </div>
        <button
          disabled={cart.length === 0}
          onClick={onComplete}
          className="tactile-btn w-full py-4 rounded-2xl bg-brand-teal disabled:bg-gray-200 disabled:text-gray-400 text-white font-display font-bold text-lg tracking-wide shadow-pos flex items-center justify-center gap-3"
        >
          <CheckCircle2 size={20} /> Complete Order
        </button>
      </div>
    </aside>
  )
}
