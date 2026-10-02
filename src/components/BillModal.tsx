import { useCallback, useEffect, useMemo, useState, FC } from "react";
import { Minus, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import type { Bill, MenuItem } from "../../shared/contracts";
import { formatMoney } from "../format";
import { userErrorMessage } from "../userError";
import ReceiptContent from "./ReceiptContent";

interface EditLine {
  key: string;
  menuItemId: string;
  name: string;
  quantity: number;
  salePrice: number;
  costPrice: number;
  captured: boolean;
}

interface BillModalProps {
  bill: Bill | null;
  menu: MenuItem[];
  onClose: () => void;
  onChanged: (bill: Bill | null) => void;
  canEdit: boolean;
  canCancel: boolean;
  canPrint: boolean;
}

const BillModal: FC<BillModalProps> = ({
  bill,
  menu,
  onClose,
  onChanged,
  canEdit,
  canCancel,
  canPrint,
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [lines, setLines] = useState<EditLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [selected, setSelected] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMode("view");
    setCancelReason("");
    setError("");
  }, [bill?.id, bill?.revisionId]);

  const openEdit = useCallback(() => {
    if (!bill) return;
    setLines(
      bill.lines.map((line) => ({
        key: line.id,
        menuItemId: line.menuItemId ?? "",
        name: line.name,
        quantity: line.quantity,
        costPrice: line.costPrice,
        salePrice: line.salePrice,
        captured: true,
      })),
    );
    setCustomerName(bill.customerName);
    setMode("edit");
  }, [bill]);

  const change = useCallback((key: string, delta: number) => {
    setLines((current) =>
      current
        .map((line) =>
          line.key === key
            ? { ...line, quantity: line.quantity + delta }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }, []);

  const add = useCallback(() => {
    const item = menu.find((candidate) => candidate.id === selected);
    if (!item) return;
    setLines((current) => [
      ...current,
      {
        key: `new:${item.id}`,
        menuItemId: item.id,
        name: item.name,
        quantity: 1,
        costPrice: item.costPrice,
        salePrice: item.salePrice,
        captured: false,
      },
    ]);
    setSelected("");
  }, [menu, selected]);

  const save = useCallback(async (): Promise<void> => {
    if (!bill || !lines.length || !customerName.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await window.pos.reviseOrder({
        orderId: bill.id,
        customerName,
        lines: lines.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          ...(line.captured
            ? {
                capturedName: line.name,
                capturedCostPrice: line.costPrice,
                capturedSalePrice: line.salePrice,
              }
            : {}),
        })),
      });
      onChanged(next);
      setMode("view");
    } catch (caught: unknown) {
      setError(userErrorMessage(caught, "We could not update the order."));
    } finally {
      setBusy(false);
    }
  }, [bill, busy, customerName, lines, onChanged]);

  const cancel = useCallback(async (): Promise<void> => {
    if (!bill || !cancelReason.trim() || busy) return;
    setBusy(true);
    try {
      onChanged(
        await window.pos.cancelOrder({
          orderId: bill.id,
          reason: cancelReason,
        }),
      );
      setCancelReason("");
    } catch (caught: unknown) {
      setError(userErrorMessage(caught, "We could not cancel the order."));
    } finally {
      setBusy(false);
    }
  }, [bill, busy, cancelReason, onChanged]);

  const available = useMemo(
    () =>
      menu.filter(
        (item) =>
          item.active &&
          item.availableForSale &&
          !lines.some((line) => line.menuItemId === item.id),
      ),
    [lines, menu],
  );

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.salePrice, 0),
    [lines],
  );

  const print = useCallback(() => {
    window.print();
  }, []);

  if (!bill) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-xl w-full max-w-xl p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-between mb-5">
          <h2 className="font-display font-bold text-xl">
            {mode === "edit" ? "Edit order" : `Bill ${bill.orderNo}`}
          </h2>
          <button onClick={onClose} aria-label="Close bill" title="Close">
            <X />
          </button>
        </div>
        {error && (
          <p className="mb-3 text-sm font-bold text-brand-red">{error}</p>
        )}
        {mode === "view" ? (
          <>
            <div className="bg-brand-cream rounded-2xl p-5 flex justify-center">
              <ReceiptContent order={bill} />
            </div>
            {bill.status === "cancelled" && (
              <p className="mt-4 p-3 rounded-xl bg-red-50 text-red-700 font-bold text-sm">
                Cancelled
                {bill.cancellationReason ? `: ${bill.cancellationReason}` : ""}
              </p>
            )}
            {bill.status === "active" && canCancel && (
              <div className="mt-4 flex gap-2">
                <input
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  placeholder="Cancellation reason"
                  className="flex-1 px-3 py-2 rounded-xl border"
                />
                <button
                  disabled={!cancelReason.trim() || busy}
                  onClick={cancel}
                  aria-label="Cancel order"
                  title="Cancel order"
                  className="px-4 rounded-xl bg-red-100 text-red-700 font-bold disabled:opacity-40"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              {bill.status === "active" && canEdit && (
                <button
                  onClick={openEdit}
                  className="flex-1 py-3 rounded-xl bg-brand-navy/10 text-brand-navy font-bold flex items-center justify-center gap-2"
                >
                  <Pencil size={15} /> Edit order
                </button>
              )}
              {canPrint && (
                <button
                  onClick={print}
                  className="flex-1 py-3 rounded-xl bg-brand-teal text-white font-bold flex items-center justify-center gap-2"
                >
                  <Printer size={15} /> Print
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Customer name"
              className="w-full px-4 py-3 rounded-xl bg-brand-cream border mb-3"
            />
            <div className="max-h-64 overflow-y-auto space-y-2">
              {lines.map((line) => (
                <div
                  key={line.key}
                  className="flex items-center gap-3 bg-brand-cream rounded-xl p-3"
                >
                  <div className="flex-1">
                    <p className="font-bold">{line.name}</p>
                    <p className="text-xs">
                      {formatMoney(line.salePrice)} each
                    </p>
                  </div>
                  <button
                    onClick={() => change(line.key, -1)}
                    aria-label={`Remove one ${line.name}`}
                    title={`Remove one ${line.name}`}
                  >
                    <Minus size={14} />
                  </button>
                  <b>{line.quantity}</b>
                  <button
                    onClick={() => change(line.key, 1)}
                    aria-label={`Add one ${line.name}`}
                    title={`Add one ${line.name}`}
                  >
                    <Plus size={14} />
                  </button>
                  <b className="w-20 text-right">
                    {formatMoney(line.quantity * line.salePrice)}
                  </b>
                </div>
              ))}
            </div>
            {available.length > 0 && (
              <div className="flex gap-2 mt-3">
                <select
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border"
                >
                  <option value="">Add an item…</option>
                  {available.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {formatMoney(item.salePrice)}
                    </option>
                  ))}
                </select>
                <button
                  disabled={!selected}
                  onClick={add}
                  className="px-4 rounded-xl bg-brand-navy text-white font-bold disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            )}
            <div className="flex justify-between font-bold text-xl mt-5 pt-4 border-t">
              <span>Total</span>
              <span>{formatMoney(total)}</span>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setMode("view")}
                className="flex-1 py-3 rounded-xl bg-gray-100 font-bold"
              >
                Back
              </button>
              <button
                disabled={busy || !lines.length || !customerName.trim()}
                onClick={save}
                className="flex-1 py-3 rounded-xl bg-brand-red text-white font-bold disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save revision"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BillModal;
