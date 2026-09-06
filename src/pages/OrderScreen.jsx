import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import ItemButton from "../components/ItemButton.jsx";
import CartPanel from "../components/CartPanel.jsx";
import Receipt from "../components/Receipt.jsx";

function makeOrderId() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// Local (not UTC) timestamp string, so the shop's calendar day/month is used
// for the sales log filename and Daily/Monthly report filtering.
function localDateTime() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function todayDisplayId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export default function OrderScreen({ menu }) {
  const [cart, setCart] = useState({});
  const [search, setSearch] = useState("");
  const [lastOrder, setLastOrder] = useState(null);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  function changeQty(item, delta) {
    setCart((prev) => {
      const existingQty = prev[item.name]?.quantity || 0;
      const nextQty = existingQty + delta;
      if (nextQty <= 0) {
        const { [item.name]: _removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [item.name]: {
          name: item.name,
          icon: item.icon,
          costPrice: item.costPrice,
          salePrice: item.salePrice,
          quantity: nextQty,
        },
      };
    });
  }

  const cartLines = Object.values(cart);
  const filteredMenu = menu.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  );

  async function completeOrder() {
    if (cartLines.length === 0) return;

    const orderId = makeOrderId();
    const dateTime = localDateTime();
    const total = cartLines.reduce(
      (sum, l) => sum + l.quantity * l.salePrice,
      0,
    );

    const rows = cartLines.map((l) => ({
      orderId,
      dateTime,
      itemName: l.name,
      quantity: l.quantity,
      costPrice: l.costPrice,
      salePrice: l.salePrice,
      lineProfit: l.quantity * (l.salePrice - l.costPrice),
    }));

    const now = new Date();
    const todaySales = await window.pos.getSalesForMonth(
      now.getFullYear(),
      now.getMonth() + 1,
    );
    const todaysOrderCount = new Set(
      todaySales
        .filter((s) => s.dateTime.slice(0, 10) === dateTime.slice(0, 10))
        .map((s) => s.orderId),
    ).size;
    const orderNo = `FL-${todayDisplayId()}-${String(todaysOrderCount + 1).padStart(3, "0")}`;

    await window.pos.appendSale(rows);

    setLastOrder({ orderNo, dateTime, lines: cartLines, total });
    setCart({});

    setTimeout(() => window.print(), 100);
  }

  return (
    <div className="flex-1 flex min-h-0">
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="px-6 md:px-8 pt-5 pb-3 flex items-center justify-between shrink-0">
          <div>
            <h1 className="font-display font-bold text-2xl text-brand-navy">
              Menu Items
            </h1>
            <p className="text-sm font-semibold text-brand-muted">
              <span className="mr-3">
                {clock.toLocaleString([], {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
              Tap + to add items to the order
            </p>
          </div>
          <div className="relative w-72">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-gray-100 text-sm font-semibold placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-red/30 shadow-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 md:px-8 py-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredMenu.length === 0 && (
              <div className="col-span-full text-center text-brand-muted font-semibold py-16">
                {menu.length === 0
                  ? "No menu items yet. Add some in Manage Menu."
                  : "No items match your search."}
              </div>
            )}
            {filteredMenu.map((item) => (
              <ItemButton
                key={item.name}
                item={item}
                qty={cart[item.name]?.quantity || 0}
                onChangeQty={changeQty}
              />
            ))}
          </div>
        </div>
      </main>

      <CartPanel
        cart={cartLines}
        orderNo={lastOrder?.orderNo}
        onChangeQty={changeQty}
        onComplete={completeOrder}
      />

      <Receipt order={lastOrder} />
    </div>
  );
}
