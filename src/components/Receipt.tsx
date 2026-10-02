import { FC } from "react";
import ReceiptContent from "./ReceiptContent";
import type { Bill } from "../../shared/contracts";

interface ReceiptProps {
  order: Bill | null;
}

const Receipt: FC<ReceiptProps> = ({ order }) => {
  return <div id="print-area">{order && <ReceiptContent order={order} />}</div>;
};

export default Receipt;
