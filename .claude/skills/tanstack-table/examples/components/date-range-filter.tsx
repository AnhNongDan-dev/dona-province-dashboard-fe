// =============================================================================
// DateRangeFilter — "from / to" datetime range filter. Popover with two
// DatePickerTime inputs in draft mode; only commits on "Áp dụng".
//
// Drop into: src/components/common/date-range-filter.tsx
// Used by:   xxx-table-search.tsx (audit logs, reports, anywhere with a date
//            range filter).
//
// Why it exists:
//   - A range filter that commits every keystroke would refetch twice per
//     range edit (once for from, once for to). The draft + Áp dụng pattern
//     batches both into one commit.
//   - Internal validation prevents `from > to`. The parent gets a guaranteed-
//     valid range or nothing.
//   - The trigger shows both dates ("dd/MM/yy HH:mm → dd/MM/yy HH:mm") so the
//     active state is legible without opening the popover.
//
// Props worth knowing:
//   - `from` / `to` are ISO datetime strings or `null`. The component renders
//     two date+time inputs internally — you don't need to split the range.
//   - One `onChange({ from, to })` covers both fields.
//   - On open, the draft is seeded from current `from`/`to`; if either is
//     null, it seeds with `new Date()` (visual matches state — avoids
//     confusing the user with "today shown but value is null").
//
// Active state at call site: `cn(className, (search.from || search.to) && 'ring')`.
//
// Shadcn primitives required: button, popover.
// Internal dep: DatePickerTime (calendar + time input combo). If you don't
// have one, swap for any date picker that emits a Date.
// =============================================================================

import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { DatePickerTime } from "./date-picker-time";

export type DateRangeFilterProps = {
  /** ISO datetime string or null */
  from: string | null;
  to: string | null;
  onChange: (next: { from: string | null; to: string | null }) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

function formatBrief(iso: string): string {
  return format(new Date(iso), "dd/MM/yy HH:mm", { locale: vi });
}

export function DateRangeFilter({
  from,
  to,
  onChange,
  placeholder = "Khoảng thời gian",
  className,
  disabled,
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  // Local draft — only applied when the user clicks "Áp dụng".
  const [draftFrom, setDraftFrom] = useState<Date | null>(from ? new Date(from) : null);
  const [draftTo, setDraftTo] = useState<Date | null>(to ? new Date(to) : null);

  const hasValue = from !== null || to !== null;
  const invalidRange = draftFrom !== null && draftTo !== null && draftFrom > draftTo;

  const apply = () => {
    if (invalidRange) return;
    onChange({
      from: draftFrom ? draftFrom.toISOString() : null,
      to: draftTo ? draftTo.toISOString() : null,
    });
    setOpen(false);
  };

  const clear = () => {
    setDraftFrom(null);
    setDraftTo(null);
    onChange({ from: null, to: null });
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
      // Reset draft to current value on open. If null, seed with current
      // time (visual matches state — avoids "today shown but value is null").
      // Seconds zeroed for tidiness.
      const now = new Date();
      now.setSeconds(0, 0);
      setDraftFrom(from ? new Date(from) : now);
      setDraftTo(to ? new Date(to) : now);
    }
    setOpen(next);
  };

  const displayLabel = hasValue
    ? `${from ? formatBrief(from) : "—"} → ${to ? formatBrief(to) : "—"}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "min-w-64 justify-between font-normal",
            !hasValue && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <CalendarIcon className="size-4 shrink-0" />
            <span className="truncate">{displayLabel}</span>
          </span>
          {hasValue && (
            <XIcon
              className="size-4 shrink-0 opacity-50 hover:opacity-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clear();
              }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Từ</span>
            <DatePickerTime
              date={draftFrom ?? new Date()}
              onChange={(d) => setDraftFrom(d)}
              disabled={disabled}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Đến</span>
            <DatePickerTime
              date={draftTo ?? new Date()}
              onChange={(d) => setDraftTo(d)}
              disabled={disabled}
            />
          </div>
          {invalidRange && (
            <span className="text-xs text-destructive">
              Thời gian bắt đầu phải sớm hơn thời gian kết thúc
            </span>
          )}
          <div className="flex items-center justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={clear}>
              Xoá
            </Button>
            <Button type="button" size="sm" onClick={apply} disabled={invalidRange}>
              Áp dụng
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
