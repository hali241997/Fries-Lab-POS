import { useCallback, useEffect, useMemo, useState, FC } from "react";
import logo from "./assets/logo.png";
import BillModal from "./components/BillModal";
import ConnectivityPill from "./components/ConnectivityPill";
import LockScreen from "./components/LockScreen";
import LoginScreen from "./components/LoginScreen";
import PasswordChange from "./components/PasswordChange";
import Receipt from "./components/Receipt";
import Bills from "./pages/Bills";
import DailyReport from "./pages/DailyReport";
import ManageMembers from "./pages/ManageMembers";
import ManageMenu from "./pages/ManageMenu";
import MonthlyReport from "./pages/MonthlyReport";
import OrderScreen from "./pages/OrderScreen";
import { requiresPasswordChange } from "./sessionAccess";
import type {
  Bill,
  ConnectivityStatus,
  MenuItem,
  Permission,
  SessionInfo,
} from "../shared/contracts";
import { userErrorMessage } from "./userError";

const TABS = [
  { key: "order", label: "Order", permission: "menu.view" },
  { key: "menu", label: "Manage Menu", permission: "menu.manage" },
  { key: "daily", label: "Daily Report", permission: "reports.daily.view" },
  {
    key: "monthly",
    label: "Monthly Report",
    permission: "reports.monthly.view",
  },
  { key: "bills", label: "Bills", permission: "bills.view" },
  { key: "members", label: "Manage Members", ownerOnly: true },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const allowed = (session: SessionInfo, permission: Permission): boolean => {
  return (
    session.member?.role === "owner" ||
    Boolean(session.member?.permissions.includes(permission))
  );
};

const App: FC = () => {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [connectivity, setConnectivity] = useState<ConnectivityStatus | null>(
    null,
  );
  const [tab, setTab] = useState<TabKey>("order");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [activeBill, setActiveBill] = useState<Bill | null>(null);
  const [billsRefreshKey, setBillsRefreshKey] = useState(0);
  const [appError, setAppError] = useState("");

  useEffect(() => {
    void window.pos
      .getSession()
      .then((next) => {
        setSession(next);
        setConnectivity(next.connectivity);
      })
      .catch(() => {
        setAppError(
          "Fries Lab POS could not finish starting. Close the app and try again.",
        );
      });

    const stopSession = window.pos.onSessionChanged((next) => {
      setSession(next);
      setConnectivity(next.connectivity);
    });

    const stopConnectivity = window.pos.onConnectivityChanged((status) => {
      setConnectivity(status);
      setSession((current) =>
        current ? { ...current, connectivity: status } : current,
      );
    });

    const refreshOnNetworkChange = (): void => {
      void window.pos.syncNow();
    };

    window.addEventListener("online", refreshOnNetworkChange);
    window.addEventListener("offline", refreshOnNetworkChange);

    return () => {
      stopSession();
      stopConnectivity();
      window.removeEventListener("online", refreshOnNetworkChange);
      window.removeEventListener("offline", refreshOnNetworkChange);
    };
  }, []);

  const reloadMenu = useCallback(async () => {
    try {
      setMenu(await window.pos.getMenu());
      setAppError("");
    } catch (caught: unknown) {
      setMenu([]);
      setAppError(userErrorMessage(caught, "We could not load the menu."));
    }
  }, []);

  useEffect(() => {
    if (
      session?.state === "active" &&
      !requiresPasswordChange(session) &&
      (allowed(session, "menu.view") || allowed(session, "menu.manage"))
    )
      void reloadMenu();
    if (session?.state !== "active") setActiveBill(null);
  }, [reloadMenu, session]);

  const visibleTabs = useMemo(
    () =>
      session
        ? TABS.filter((item) => {
            if ("ownerOnly" in item) return session.member?.role === "owner";
            return allowed(session, item.permission);
          })
        : [],
    [session],
  );

  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some((item) => item.key === tab))
      setTab(visibleTabs[0]?.key ?? "order");
  }, [tab, visibleTabs]);

  const isOnline = useMemo(
    () =>
      connectivity?.state === "online" ||
      connectivity?.state === "syncing" ||
      connectivity?.state === "degraded",
    [connectivity?.state],
  );

  const leaseHours = useMemo(
    () =>
      connectivity?.offlineLeaseRemainingMs === null ||
      connectivity?.offlineLeaseRemainingMs === undefined
        ? null
        : Math.max(
            0,
            Math.ceil(connectivity.offlineLeaseRemainingMs / 3_600_000),
          ),
    [connectivity?.offlineLeaseRemainingMs],
  );

  const handleBillChanged = useCallback((nextBill: Bill | null): void => {
    setActiveBill(nextBill);
    setBillsRefreshKey((key) => key + 1);
  }, []);

  const closeBill = useCallback(() => {
    setActiveBill(null);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setAppError("");
    try {
      setSession(await window.pos.logout());
    } catch (caught: unknown) {
      setAppError(userErrorMessage(caught, "We could not log you out."));
    }
  }, []);

  if (!session)
    return (
      <div className="h-screen grid place-items-center bg-brand-cream font-bold">
        {appError || "Starting Fries Lab POS…"}
      </div>
    );
  if (session.state === "signed-out")
    return <LoginScreen onAuthenticated={setSession} />;
  if (session.state === "locked")
    return (
      <LockScreen
        session={session}
        onUnlocked={setSession}
        onSwitch={setSession}
      />
    );

  const member = session.member;
  if (!member) return null;
  if (requiresPasswordChange(session))
    return <PasswordChange onChanged={setSession} />;

  return (
    <div className="bg-brand-cream text-brand-ink h-screen w-full overflow-hidden flex flex-col font-sans">
      <header className="no-print min-h-16 px-6 flex items-center justify-between gap-4 border-b border-gray-100 bg-white shrink-0 z-30">
        <div className="flex items-center gap-3 shrink-0">
          <img
            src={logo}
            alt="Fries Lab"
            className="w-10 h-10 rounded-xl shadow-pos object-cover"
          />
          <div className="hidden xl:block">
            <p className="font-bold text-sm leading-tight">{member.name}</p>
            <p className="text-xs text-brand-muted uppercase">
              {member.role} · {member.employeeId}
            </p>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto py-2">
          {visibleTabs.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`px-4 py-2 rounded-full font-semibold text-sm tactile-btn whitespace-nowrap ${
                tab === item.key
                  ? "bg-brand-navy text-white font-bold shadow-pos"
                  : "text-brand-muted hover:bg-brand-cream"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          {connectivity && <ConnectivityPill status={connectivity} />}
          <button
            onClick={logout}
            className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-bold"
          >
            Log out
          </button>
        </div>
      </header>

      {!isOnline && leaseHours !== null && leaseHours < 24 && (
        <div className="no-print bg-amber-400 text-amber-950 text-center text-sm font-bold py-2 px-4">
          Offline access expires in {leaseHours} hour
          {leaseHours === 1 ? "" : "s"}. Reconnect before then to renew it.
        </div>
      )}
      {appError && (
        <div className="no-print bg-amber-100 text-amber-900 text-center text-sm font-bold py-2 px-4">
          {appError}
        </div>
      )}

      <main className="flex-1 min-h-0 flex flex-col">
        {tab === "order" && (
          <OrderScreen
            menu={menu}
            onOrderComplete={setActiveBill}
            canCreate={allowed(session, "orders.create")}
          />
        )}
        {tab === "menu" && (
          <ManageMenu
            menu={menu}
            onMenuChange={reloadMenu}
            isOnline={isOnline}
          />
        )}
        {tab === "daily" && <DailyReport />}
        {tab === "monthly" && <MonthlyReport />}
        {tab === "bills" && (
          <Bills onSelectBill={setActiveBill} refreshKey={billsRefreshKey} />
        )}
        {tab === "members" && <ManageMembers isOnline={isOnline} />}
      </main>

      <Receipt order={activeBill} />
      <BillModal
        bill={activeBill}
        menu={menu}
        onClose={closeBill}
        onChanged={handleBillChanged}
        canEdit={allowed(session, "orders.edit")}
        canCancel={allowed(session, "orders.cancel")}
        canPrint={allowed(session, "bills.view")}
      />
    </div>
  );
};

export default App;
