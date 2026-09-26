// =============================================================================
// MultiSelectPopover — multi-value filter. Popover + checkbox list with
// "Chọn tất cả" / "Bỏ chọn tất cả" toggles.
//
// Drop into: src/components/common/multi-select-popover.tsx
// Used by:   xxx-table-search.tsx for any enum/array filter where the user
//            can pick several values (audit action groups, multi-tag, ...).
//
// Why it exists:
//   - shadcn doesn't ship a multi-select. Naive workarounds (CommandList +
//     checkboxes) leak the popover when the user clicks a checkbox.
//   - Controlled-by-default: parent owns the `value: TValue[]` array, the
//     popover is a pure projection. No internal seed drift, no remount-keying.
//   - Trigger shows "X/N đã chọn" — concise on a crowded filter bar. The
//     formatter is overridable via `formatSelected`.
//
// Props worth knowing:
//   - `value: TValue[]`. Always pass an array — `[]` when empty. Convert
//     empty arrays to `undefined` *outside* the component (in `onChange`)
//     so the URL stays clean: `next.length > 0 ? next : undefined`.
//   - `options: { value, label, count? }[]`. `label` is plain text (the rows
//     are checkboxes, not badge pills).
//   - `formatSelected?` — override the trigger text. Default: "n/total đã chọn".
//
// No `key=` needed at the call site — the component is controlled, no
// internal seed to drift from.
//
// Shadcn primitives required: button, checkbox, popover.
// =============================================================================

import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiSelectPopoverOption<TValue extends string> = {
  value: TValue;
  label: React.ReactNode;
  /** Right-aligned trailing count, e.g. "(6 actions)" */
  count?: number;
};

export type MultiSelectPopoverProps<TValue extends string> = {
  value: TValue[];
  onChange: (next: TValue[]) => void;
  options: readonly MultiSelectPopoverOption<TValue>[];
  placeholder?: string;
  /** Trigger text when at least one option is selected. Default: "n/total đã chọn" */
  formatSelected?: (count: number, total: number) => string;
  className?: string;
  disabled?: boolean;
};

export function MultiSelectPopover<TValue extends string>({
  value,
  onChange,
  options,
  placeholder = "Chọn",
  formatSelected = (n, total) => `${n}/${total} đã chọn`,
  className,
  disabled,
}: MultiSelectPopoverProps<TValue>) {
  const selectedSet = new Set(value);
  const allSelected = options.length > 0 && value.length === options.length;
  const noneSelected = value.length === 0;

  const toggle = (v: TValue) => {
    if (selectedSet.has(v)) {
      onChange(value.filter((x) => x !== v));
    } else {
      onChange([...value, v]);
    }
  };

  const selectAll = () => onChange(options.map((o) => o.value));
  const clearAll = () => onChange([]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "min-w-44 justify-between font-normal",
            noneSelected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {noneSelected ? placeholder : formatSelected(value.length, options.length)}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
          {!allSelected ? (
            <button
              type="button"
              onClick={selectAll}
              className="font-medium text-primary hover:underline"
            >
              Chọn tất cả
            </button>
          ) : (
            <span className="text-muted-foreground">Đã chọn tất cả</span>
          )}
          {!noneSelected && (
            <button
              type="button"
              onClick={clearAll}
              className="font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Bỏ chọn tất cả
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {options.map((opt) => {
            const id = `multi-select-${opt.value}`;
            const checked = selectedSet.has(opt.value);
            return (
              <label
                key={opt.value}
                htmlFor={id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox id={id} checked={checked} onCheckedChange={() => toggle(opt.value)} />
                <span className="flex-1 truncate">{opt.label}</span>
                {opt.count !== undefined && (
                  <span className="text-xs text-muted-foreground">({opt.count})</span>
                )}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
