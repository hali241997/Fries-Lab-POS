import { useCallback, useEffect, useMemo, useState, FC } from "react";
import { Search } from "lucide-react";
import type { Bill, CartLine, MenuItem } from "../../shared/contracts";
import CartPanel from "../components/CartPanel";
import ItemButton from "../components/ItemButton";
import { userErrorMessage } from "../userError";

interface OrderScreenProps {
  menu: MenuItem[];
  onOrderComplete: (bill: Bill) => void;
  canCreate: boolean;
}

const OrderScreen: FC<OrderScreenProps> = ({
  menu,
  onOrderComplete,
  canCreate,
}) => {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [query, setQuery] = useState("");
  const [lastOrderNo, setLastOrderNo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);

  useEffect(() => {
    if (!canCreate) return;
    void window.pos
      .getCartDraft()
      .then((draft) => {
        setError("");
        setCustomerName(draft.customerName);
        setQuantities(
          Object.fromEntries(
            draft.lines.map((line) => [line.menuItemId, line.quantity]),
          ),
        );
        setDraftLoaded(true);
      })
      .catch((caught: unknown) => {
        setError(userErrorMessage(caught, "We could not restore the cart."));
      });
  }, [canCreate]);

  useEffect(() => {
    if (!draftLoaded || !canCreate) return;
    const timeout = window.setTimeout(() => {
      const lines = Object.entries(quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
      void window.pos
        .saveCartDraft({
          customerName,
          lines,
          updatedAt: new Date().toISOString(),
        })
        .catch((caught: unknown) => {
          setError(userErrorMessage(caught, "We could not save the cart."));
        });
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [canCreate, customerName, draftLoaded, quantities]);

  const filtered = useMemo(
    () =>
      menu.filter(
        (item) =>
          item.active &&
          item.availableForSale &&
          item.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [menu, query],
  );

  const cartLines = useMemo<CartLine[]>(
    () =>
      menu
        .filter(
          (item) =>
            item.active &&
            item.availableForSale &&
            (quantities[item.id] ?? 0) > 0,
        )
        .map((item) => ({ ...item, quantity: quantities[item.id] ?? 0 })),
    [menu, quantities],
  );

  const changeQty = useCallback(
    (item: MenuItem, delta: number): void => {
      if (!canCreate) return;
      setQuantities((current) => ({
        ...current,
        [item.id]: Math.max(0, (current[item.id] ?? 0) + delta),
      }));
    },
    [canCreate],
  );

  const completeOrder = useCallback(async (): Promise<void> => {
    if (!canCreate || !customerName.trim() || !cartLines.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const bill = await window.pos.createOrder({
        customerName: customerName.trim(),
        lines: cartLines.map((line) => ({
          menuItemId: line.id,
          quantity: line.quantity,
        })),
      });
      setLastOrderNo(bill.orderNo);
      setQuantities({});
      setCustomerName("");
      onOrderComplete(bill);
    } catch (caught: unknown) {
      setError(userErrorMessage(caught, "We could not complete the order."));
    } finally {
      setBusy(false);
    }
  }, [busy, canCreate, cartLines, customerName, onOrderComplete]);

  return (
    <div className="flex flex-1 min-h-0">
      <main className="flex-1 overflow-y-auto px-6 md:px-10 py-6">
        <div className="flex items-center justify-between mb-5 gap-4">
          <div>
            <h1 className="font-display font-bold text-2xl text-brand-navy">
              New Order
            </h1>
            {!canCreate && (
              <p className="text-sm font-bold text-brand-red">
                You can view the menu, but cannot create orders.
              </p>
            )}
            {error && (
              <p className="text-sm font-bold text-brand-red">{error}</p>
            )}
          </div>
          <div className="relative w-64">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search menu…"
              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border shadow-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item) => (
            <ItemButton
              key={item.id}
              item={item}
              qty={quantities[item.id] ?? 0}
              onChangeQty={changeQty}
            />
          ))}
        </div>
        {!filtered.length && (
          <div className="py-16 text-center text-brand-muted">
            <Search className="mx-auto mb-2" />
            <p className="font-bold">
              {query.trim()
                ? "No menu items match your search."
                : "No active menu items are available."}
            </p>
          </div>
        )}
      </main>
      <CartPanel
        cart={cartLines}
        orderNo={lastOrderNo}
        onChangeQty={changeQty}
        onComplete={completeOrder}
        customerName={customerName}
        onCustomerNameChange={setCustomerName}
        canComplete={
          canCreate &&
          !busy &&
          cartLines.length > 0 &&
          customerName.trim().length > 0
        }
      />
    </div>
  );
};

export default OrderScreen;
