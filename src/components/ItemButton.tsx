import { useCallback, FC } from "react";
import { Minus, Plus } from "lucide-react";
import { formatMoney } from "../format";
import type { MenuItem } from "../../shared/contracts";

interface ItemButtonProps {
  item: MenuItem;
  qty: number;
  onChangeQty: (item: MenuItem, delta: number) => void;
}

const ItemButton: FC<ItemButtonProps> = ({ item, qty, onChangeQty }) => {
  const decrement = useCallback(() => {
    onChangeQty(item, -1);
  }, [item, onChangeQty]);

  const increment = useCallback(() => {
    onChangeQty(item, 1);
  }, [item, onChangeQty]);

  return (
    <div className="item-card bg-brand-card rounded-2xl p-4 flex flex-col shadow-pos border border-gray-50">
      <h3
        className="font-display font-bold text-sm leading-tight mb-1 truncate"
        title={item.name}
      >
        {item.name}
      </h3>
      <span className="font-extrabold text-lg text-brand-navy mb-3">
        {formatMoney(item.salePrice)}
      </span>
      <div className="mt-auto flex items-center justify-between bg-brand-cream rounded-xl p-1.5">
        <button
          className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-brand-red font-bold tactile-btn"
          onClick={decrement}
          aria-label={`Remove one ${item.name}`}
          title={`Remove one ${item.name}`}
        >
          <Minus size={14} />
        </button>
        <span className="font-extrabold text-sm w-6 text-center">{qty}</span>
        <button
          className="w-8 h-8 rounded-lg bg-brand-red text-white flex items-center justify-center tactile-btn"
          onClick={increment}
          aria-label={`Add one ${item.name}`}
          title={`Add one ${item.name}`}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
};

export default ItemButton;
