import { useCallback, useEffect, useRef, useState, FC } from "react";
import type { ConnectivityStatus } from "../../shared/contracts";

interface ConnectivityPillProps {
  status: ConnectivityStatus;
}

const COLORS: Record<ConnectivityStatus["state"], string> = {
  online: "bg-green-100 text-green-700",
  syncing: "bg-blue-100 text-blue-700 animate-pulse",
  reconnecting: "bg-amber-100 text-amber-700",
  offline: "bg-red-100 text-red-700",
  degraded: "bg-amber-100 text-amber-700",
};

const remaining = (value: number | null): string => {
  if (value === null) return "Unavailable";
  const hours = Math.floor(value / 3_600_000);
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

const ConnectivityPill: FC<ConnectivityPillProps> = ({ status }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const leaseWarning =
    status.offlineLeaseRemainingMs !== null &&
    status.offlineLeaseRemainingMs < 86_400_000;

  const toggleOpen = useCallback(() => {
    setOpen((value) => !value);
  }, []);

  const syncNow = useCallback(() => {
    setBusy(true);
    void window.pos.syncNow().finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideInteraction = (event: MouseEvent): void => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={toggleOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`px-3 py-2 rounded-full text-xs font-bold capitalize ${COLORS[status.state]}`}
      >
        {status.state}
        {status.pendingOutboxCount ? ` · ${status.pendingOutboxCount}` : ""}
      </button>
      {leaseWarning && (
        <span className="absolute -top-2 -right-2 bg-brand-red text-white text-[9px] font-bold rounded-full px-1">
          {remaining(status.offlineLeaseRemainingMs)}
        </span>
      )}
      {open && (
        <div
          role="dialog"
          aria-label="Connection and sync details"
          className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border p-5 z-50 text-sm"
        >
          <p className="font-bold mb-2">Connection & sync</p>
          <p className="text-brand-muted mb-3">{status.message}</p>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <dt>Last sync</dt>
            <dd className="text-right font-semibold">
              {status.lastSyncAt
                ? new Date(status.lastSyncAt).toLocaleString()
                : "Never"}
            </dd>
            <dt>Offline access left</dt>
            <dd className="text-right font-semibold">
              {remaining(status.offlineLeaseRemainingMs)}
            </dd>
            <dt>Pending changes</dt>
            <dd className="text-right font-semibold">
              {status.pendingOutboxCount}
            </dd>
            <dt>Sync errors</dt>
            <dd className="text-right font-semibold">
              {status.permanentErrorCount}
            </dd>
            <dt>Conflicts</dt>
            <dd className="text-right font-semibold">{status.conflictCount}</dd>
          </dl>
          <button
            disabled={busy}
            onClick={syncNow}
            className="mt-4 w-full py-2 rounded-xl bg-brand-navy text-white font-bold disabled:opacity-50"
          >
            {busy ? "Syncing…" : "Sync now"}
          </button>
        </div>
      )}
    </div>
  );
};

export default ConnectivityPill;
