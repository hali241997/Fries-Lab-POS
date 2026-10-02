import { useCallback, useMemo, ChangeEvent, FC } from "react";
import { ChevronDown } from "lucide-react";
import type { ReportRange, ReportRangeKind } from "../../shared/contracts";
import {
  karachiDateInputValue,
  karachiYearMonth,
} from "../../shared/date";

interface RangePickerProps {
  value: ReportRange;
  onChange: (range: ReportRange) => void;
  monthlyOnly?: boolean;
}

const RangePicker: FC<RangePickerProps> = ({
  value,
  onChange,
  monthlyOnly = false,
}) => {
  const kinds = useMemo<ReportRangeKind[]>(
    () =>
      monthlyOnly
        ? ["month", "year", "all"]
        : ["day", "week", "month", "year", "all"],
    [monthlyOnly],
  );

  const current = useMemo(() => karachiYearMonth(), []);

  const changeKind = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onChange({
        kind: event.target.value as ReportRangeKind,
        anchorDate: karachiDateInputValue(),
        year: current.year,
        month: current.month,
      });
    },
    [current, onChange],
  );

  const changeAnchorDate = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, anchorDate: event.target.value });
    },
    [onChange, value],
  );

  const changeMonth = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const [year, month] = event.target.value.split("-").map(Number);
      onChange({ kind: "month", year, month });
    },
    [onChange],
  );

  const changeYear = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ kind: "year", year: Number(event.target.value) });
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative">
        <select
          value={value.kind}
          onChange={changeKind}
          className="h-10 appearance-none pl-3 pr-9 rounded-xl bg-white border font-semibold text-sm"
          aria-label="Report period"
        >
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {kind[0]?.toUpperCase()}
              {kind.slice(1)}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          size={15}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted"
        />
      </div>
      {(value.kind === "day" || value.kind === "week") && (
        <input
          type="date"
          value={value.anchorDate ?? karachiDateInputValue()}
          onChange={changeAnchorDate}
          className="pos-date-input h-10 px-3 rounded-xl bg-white border text-sm"
        />
      )}
      {value.kind === "month" && (
        <input
          type="month"
          value={`${value.year ?? current.year}-${String(value.month ?? current.month).padStart(2, "0")}`}
          onChange={changeMonth}
          className="pos-date-input h-10 px-3 rounded-xl bg-white border text-sm"
        />
      )}
      {value.kind === "year" && (
        <input
          type="number"
          min="2000"
          max="2100"
          value={value.year ?? current.year}
          onChange={changeYear}
          className="h-10 w-24 px-3 rounded-xl bg-white border text-sm"
        />
      )}
    </div>
  );
};

export default RangePicker;
