import React, { useCallback, useEffect, useState } from "react";
import logo from "./assets/logo.png";
import OrderScreen from "./pages/OrderScreen.jsx";
import ManageMenu from "./pages/ManageMenu.jsx";
import DailyReport from "./pages/DailyReport.jsx";
import MonthlyReport from "./pages/MonthlyReport.jsx";
import Bills from "./pages/Bills.jsx";
import Receipt from "./components/Receipt.jsx";
import BillModal from "./components/BillModal.jsx";

const TABS = [
  { key: "order", label: "Order" },
  { key: "menu", label: "Manage Menu" },
  { key: "daily", label: "Daily Report" },
  { key: "monthly", label: "Monthly Report" },
  { key: "bills", label: "Bills" },
];

export default function App() {
  const [tab, setTab] = useState("order");
  const [menu, setMenu] = useState([]);
  const [activeBill, setActiveBill] = useState(null);

  const reloadMenu = useCallback(() => {
    window.pos.getMenu().then(setMenu);
  }, []);

  useEffect(() => {
    reloadMenu();
  }, [reloadMenu]);

  return (
    <div className="bg-brand-cream text-brand-ink h-screen w-full overflow-hidden flex flex-col font-sans">
      <header className="no-print h-16 px-6 md:px-10 flex items-center justify-between border-b border-gray-100 bg-white shrink-0 z-30">
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt="Fries Lab"
            className="w-10 h-10 rounded-xl shadow-pos object-cover"
          />
        </div>
        <nav className="flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-full font-semibold text-sm tactile-btn ${
                tab === t.key
                  ? "bg-brand-navy text-white font-bold shadow-pos"
                  : "text-brand-muted hover:bg-brand-cream"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="w-24" />
      </header>

      <main className="flex-1 min-h-0 flex flex-col">
        {tab === "order" && (
          <OrderScreen menu={menu} onOrderComplete={setActiveBill} />
        )}
        {tab === "menu" && <ManageMenu menu={menu} onMenuChange={setMenu} />}
        {tab === "daily" && <DailyReport />}
        {tab === "monthly" && <MonthlyReport />}
        {tab === "bills" && <Bills onSelectBill={setActiveBill} />}
      </main>

      <Receipt order={activeBill} />
      <BillModal bill={activeBill} onClose={() => setActiveBill(null)} />
    </div>
  );
}
