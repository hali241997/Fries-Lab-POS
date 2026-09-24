import { useState } from "react";
import { Pencil, Plus, Trash2, Utensils, X } from "lucide-react";
import { formatMoney } from "../format";
import type { MenuItem } from "../../shared/contracts";

interface MenuForm {
  originalName: string | null;
  name: string;
  costPrice: string;
  salePrice: string;
}

interface ManageMenuProps {
  menu: MenuItem[];
  onMenuChange: (items: MenuItem[]) => void;
}

const emptyForm: MenuForm = {
  originalName: null,
  name: "",
  costPrice: "",
  salePrice: "",
};

export default function ManageMenu({ menu, onMenuChange }: ManageMenuProps) {
  const [form, setForm] = useState<MenuForm | null>(null);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);

  function openAdd() {
    setForm({ ...emptyForm });
    setError("");
  }

  function openEdit(item: MenuItem) {
    setForm({
      originalName: item.name,
      name: item.name,
      costPrice: String(item.costPrice),
      salePrice: String(item.salePrice),
    });
    setError("");
  }

  function closeForm() {
    setForm(null);
    setError("");
  }

  async function save() {
    if (!form) return;

    const name = form.name.trim();
    const costPrice = Number(form.costPrice);
    const salePrice = Number(form.salePrice);

    if (!name) {
      setError("Name is required.");
      return;
    }
    if (
      !Number.isFinite(costPrice) ||
      costPrice < 0 ||
      !Number.isFinite(salePrice) ||
      salePrice < 0
    ) {
      setError("Cost price and sale price must be non-negative numbers.");
      return;
    }

    const duplicate = menu.some(
      (i) =>
        i.name.toLowerCase() === name.toLowerCase() &&
        i.name !== form.originalName,
    );
    if (duplicate) {
      setError(`An item named "${name}" already exists.`);
      return;
    }

    let updated: MenuItem[];
    if (form.originalName === null) {
      updated = [...menu, { name, costPrice, salePrice }];
    } else {
      updated = menu.map((i) =>
        i.name === form.originalName ? { ...i, name, costPrice, salePrice } : i,
      );
    }

    const saved = await window.pos.saveMenu(updated);
    onMenuChange(saved);
    closeForm();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    const updated = menu.filter((i) => i.name !== deleteTarget.name);
    const saved = await window.pos.saveMenu(updated);
    onMenuChange(saved);
    setDeleteTarget(null);
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-brand-navy">
            Manage Menu
          </h1>
          <p className="text-sm font-semibold text-brand-muted">
            Add, edit or remove items. Cost price stays private to reports only.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="tactile-btn px-5 py-3 rounded-2xl bg-brand-red text-white font-bold text-sm shadow-pos flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus size={16} /> Add New Item
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-pos border border-gray-50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-cream/60 text-brand-muted text-xs uppercase tracking-wide font-bold">
              <th className="text-left px-6 py-3">Item</th>
              <th className="text-right px-6 py-3">Cost Price</th>
              <th className="text-right px-6 py-3">Sale Price</th>
              <th className="text-right px-6 py-3">Margin</th>
              <th className="text-right px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {menu.map((item) => (
              <tr key={item.name} className="hover:bg-brand-cream/40">
                <td className="px-6 py-4">
                  <span className="font-bold text-sm">{item.name}</span>
                </td>
                <td className="px-6 py-4 text-right font-semibold text-brand-muted">
                  {formatMoney(item.costPrice)}
                </td>
                <td className="px-6 py-4 text-right font-bold text-brand-navy">
                  {formatMoney(item.salePrice)}
                </td>
                <td className="px-6 py-4 text-right font-bold text-brand-teal">
                  {formatMoney(item.salePrice - item.costPrice)}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEdit(item)}
                      className="w-9 h-9 rounded-xl bg-brand-navy/10 text-brand-navy flex items-center justify-center tactile-btn"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(item)}
                      className="w-9 h-9 rounded-xl bg-brand-red/10 text-brand-red flex items-center justify-center tactile-btn"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {menu.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-brand-cream flex items-center justify-center text-brand-red text-2xl mx-auto">
              <Utensils size={22} />
            </div>
            <p className="font-bold text-sm text-brand-muted mt-3">
              No menu items yet. Add your first item to get started.
            </p>
          </div>
        )}
      </div>

      {form && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
          onClick={closeForm}
        >
          <div
            className="bg-white rounded-3xl shadow-xl w-full max-w-md p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-bold text-xl text-brand-navy">
                {form.originalName === null ? "Add New Item" : "Edit Item"}
              </h2>
              <button
                onClick={closeForm}
                className="w-9 h-9 rounded-xl bg-brand-cream flex items-center justify-center text-brand-muted tactile-btn"
              >
                <X size={16} />
              </button>
            </div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <div>
                <label className="block text-xs font-bold text-brand-muted mb-1.5 uppercase tracking-wide">
                  Item Name
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Lab Signature Burger"
                  className="w-full px-4 py-3 rounded-xl bg-brand-cream/60 border border-gray-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-red/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-brand-muted mb-1.5 uppercase tracking-wide">
                    Cost Price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={form.costPrice}
                    onChange={(e) =>
                      setForm({ ...form, costPrice: e.target.value })
                    }
                    placeholder="0"
                    className="w-full px-4 py-3 rounded-xl bg-brand-cream/60 border border-gray-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-red/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-muted mb-1.5 uppercase tracking-wide">
                    Sale Price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={form.salePrice}
                    onChange={(e) =>
                      setForm({ ...form, salePrice: e.target.value })
                    }
                    placeholder="0"
                    className="w-full px-4 py-3 rounded-xl bg-brand-cream/60 border border-gray-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-red/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              {error && (
                <div className="text-brand-red text-xs font-semibold">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="tactile-btn flex-1 py-3 rounded-xl bg-gray-100 text-brand-ink font-bold text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="tactile-btn flex-1 py-3 rounded-xl bg-brand-teal text-white font-bold text-sm shadow-pos"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-7 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center mx-auto mb-4 text-xl">
              <Trash2 size={20} />
            </div>
            <h2 className="font-display font-bold text-lg text-brand-navy mb-1">
              Delete this item?
            </h2>
            <p className="text-sm font-semibold text-brand-muted mb-6">
              "{deleteTarget.name}" will be removed from the order screen.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="tactile-btn flex-1 py-3 rounded-xl bg-gray-100 text-brand-ink font-bold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="tactile-btn flex-1 py-3 rounded-xl bg-brand-red text-white font-bold text-sm shadow-pos"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
