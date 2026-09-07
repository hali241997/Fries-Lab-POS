import React from 'react'
import ReceiptContent from './ReceiptContent.jsx'

export default function Receipt({ order }) {
  return <div id="print-area">{order && <ReceiptContent order={order} />}</div>
}
