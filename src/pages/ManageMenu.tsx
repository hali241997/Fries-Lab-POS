import { useCallback, useState, FC } from "react";
import { Download, Pencil, Plus, Trash2, X } from "lucide-react";
import type { MenuItem } from "../../shared/contracts";
import { formatMoney } from "../format";
import { userErrorMessage } from "../userError";

interface ManageMenuProps {
  menu: MenuItem[];
  onMenuChange: () => Promise<void>;
  isOnline: boolean;
}

interface FormState {
  item: MenuItem | null;
  name: string;
  costPrice: string;
  salePrice: string;
  availableForSale: boolean;
}

const ManageMenu: FC<ManageMenuProps> = ({ menu, onMenuChange, isOnline }) => {
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const formIsValid = Boolean(
    form?.name.trim() &&
      form.costPrice.trim() &&
      form.salePrice.trim() &&
      Number.isFinite(Number(form.costPrice)) &&
      Number(form.costPrice) >= 0 &&
      Number.isFinite(Number(form.salePrice)) &&
      Number(form.salePrice) >= 0,
  );

  const edit = useCallback((item: MenuItem | null): void => {
    setError("");
    setForm({
      item,
      name: item?.name ?? "",
      costPrice: item ? String(item.costPrice) : "",
      salePrice: item ? String(item.salePrice) : "",
      availableForSale: item?.availableForSale ?? true,
    });
  }, []);

  const save = useCallback(async (): Promise<void> => {
    if (!form || !isOnline || busy) return;
    setBusy(true);
    setError("");
    try {
      const request = {
        ...(form.item
          ? { id: form.item.id, expectedVersion: form.item.version }
          : {}),
        name: form.name.trim(),
        costPrice: Number(form.costPrice),
        salePrice: Number(form.salePrice),
        availableForSale: form.availableForSale,
      };
      if (form.item) await window.pos.updateMenuItem(request);
      else await window.pos.createMenuItem(request);
      await onMenuChange();
      setForm(null);
    } catch (caught: unknown) {
      setError(userErrorMessage(caught, "We could not save the item."));
    } finally {
      setBusy(false);
    }
  }, [busy, form, isOnline, onMenuChange]);

  const archive = useCallback(
    async (item: MenuItem): Promise<void> => {
      if (
        !isOnline ||
        !window.confirm(
          `Archive ${item.name}? Existing bills will keep their item snapshot.`,
        )
      )
        return;
      try {
        await window.pos.archiveMenuItem(item.id);
        await onMenuChange();
      } catch (caught: unknown) {
        setError(userErrorMessage(caught, "We could not archive the item."));
      }
    },
    [isOnline, onMenuChange],
  );

  const exportMenu = useCallback(async (): Promise<void> => {
    setError("");
    try {
      await window.pos.exportCsv({ kind: "menu" });
    } catch (caught: unknown) {
      setError(userErrorMessage(caught, "We could not export the menu."));
    }
  }, []);

  const closeForm = useCallback(() => {
    setForm(null);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-brand-navy">
            Manage Menu
          </h1>
          <p className="text-sm font-semibold text-brand-muted">
            Menu viewing and export work offline.
          </p>
          {!isOnline && (
            <p className="text-sm font-bold text-brand-red mt-1">
              Reconnect to change the menu.
            </p>
          )}
          {error && !form && (
            <p className="text-sm font-bold text-brand-red mt-1">{error}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportMenu}
            className="px-4 py-3 rounded-xl bg-white font-bold text-sm flex items-center justify-center gap-2"
          >
            <Download size={16} /> Export CSV
          </button>
          <button
            disabled={!isOnline}
            onClick={() => edit(null)}
            className="px-4 py-3 rounded-xl bg-brand-red text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <Plus size={16} /> Add item
          </button>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-pos overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-navy text-white/80 uppercase text-xs">
              <th className="text-left px-6 py-3">Item</th>
              <th className="text-left px-6 py-3">Status</th>
              <th className="text-left px-6 py-3">Ready to sell</th>
              <th className="text-right px-6 py-3">Cost</th>
              <th className="text-right px-6 py-3">Sale</th>
              <th className="text-right px-6 py-3">Margin</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {menu.map((item) => (
              <tr key={item.id}>
                <td className="px-6 py-4 font-bold">{item.name}</td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-bold ${item.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                  >
                    {item.active ? "Active" : "Archived"}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-bold ${item.availableForSale ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}
                  >
                    {item.availableForSale ? "Ready" : "Not ready"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  {formatMoney(item.costPrice)}
                </td>
                <td className="px-6 py-4 text-right font-bold">
                  {formatMoney(item.salePrice)}
                </td>
                <td className="px-6 py-4 text-right text-brand-teal font-bold">
                  {formatMoney(item.salePrice - item.costPrice)}
                </td>
                <td className="px-6 py-4 flex justify-end gap-2">
                  <button
                    disabled={!isOnline}
                    onClick={() => edit(item)}
                    aria-label={`Edit ${item.name}`}
                    title={`Edit ${item.name}`}
                    className="p-2 rounded-lg bg-brand-cream disabled:opacity-30"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    disabled={!isOnline || !item.active}
                    onClick={() => void archive(item)}
                    aria-label={`Archive ${item.name}`}
                    title={`Archive ${item.name}`}
                    className="p-2 rounded-lg bg-red-50 text-brand-red disabled:opacity-30"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <div className="fixed inset-0 bg-black/40 z-40 grid place-items-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-7">
            <div className="flex justify-between mb-5">
              <h2 className="font-display font-bold text-xl">
                {form.item ? "Edit item" : "Add item"}
              </h2>
              <button
                onClick={closeForm}
                aria-label="Close menu item form"
                title="Close"
              >
                <X />
              </button>
            </div>
            <div className="space-y-4">
              <input
                autoFocus
                placeholder="Item name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                className="w-full px-4 py-3 rounded-xl bg-brand-cream border"
                aria-invalid={Boolean(form && !form.name.trim())}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Cost price"
                value={form.costPrice}
                onChange={(event) =>
                  setForm({ ...form, costPrice: event.target.value })
                }
                className="w-full px-4 py-3 rounded-xl bg-brand-cream border"
                aria-invalid={Boolean(
                  form &&
                    (!form.costPrice.trim() || Number(form.costPrice) < 0),
                )}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Sale price"
                value={form.salePrice}
                onChange={(event) =>
                  setForm({ ...form, salePrice: event.target.value })
                }
                className="w-full px-4 py-3 rounded-xl bg-brand-cream border"
                aria-invalid={Boolean(
                  form &&
                    (!form.salePrice.trim() || Number(form.salePrice) < 0),
                )}
              />
              <label className="flex items-center justify-between gap-4 rounded-xl bg-brand-cream border px-4 py-3">
                <span>
                  <span className="block font-bold text-sm">Ready to sell</span>
                  <span className="block text-xs text-brand-muted font-semibold">
                    Show this item in the Order menu.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={form.availableForSale}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      availableForSale: event.target.checked,
                    })
                  }
                  className="h-5 w-5 accent-brand-teal"
                />
              </label>
              {error && (
                <p className="text-sm font-bold text-brand-red">{error}</p>
              )}
              <button
                disabled={busy || !isOnline || !formIsValid}
                onClick={save}
                className="w-full py-3 rounded-xl bg-brand-red text-white font-bold disabled:opacity-40"
              >
                {busy
                  ? "Saving…"
                  : !isOnline
                    ? "Reconnect to save"
                    : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageMenu;
