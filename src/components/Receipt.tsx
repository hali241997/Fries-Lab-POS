import ReceiptContent from "./ReceiptContent";
import type { Bill } from "../../shared/contracts";

interface ReceiptProps {
  order: Bill | null;
}

export default function Receipt({ order }: ReceiptProps) {
  return <div id="print-area">{order && <ReceiptContent order={order} />}</div>;
}
