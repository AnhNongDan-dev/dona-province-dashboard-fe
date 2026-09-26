// =============================================================================
// CommitSelect — enum/status filter dropdown with async commit + clear + spinner.
//
// Drop into: src/components/common/commit-select.tsx
// Used by:   xxx-table-search.tsx for every status / role / enum filter.
//
// Why it exists (vs raw shadcn <Select>):
//   - Built-in trailing × clear affordance (no "__all__" sentinel hack).
//   - Built-in pending state: while `onCommit` resolves the trigger shows
//     `animate-pulse cursor-wait` and disables the select. No external
//     `isPending` plumbing required.
//   - Async-by-contract: `onCommit` returns a Promise, so the filter bar can
//     await a URL navigation or query refetch before unlocking the UI.
//   - Uncontrolled internally: parent passes `defaultValue=`, the component
//     owns the visible state. Pair with `key={value ?? '__empty__'}` at the
//     call site to force a remount when the URL changes externally (preset
//     link, sidebar action, manual URL edit).
//
// Props worth knowing:
//   - `options: { value, label }[]` — `value` is `string | number`; `label`
//     can be any ReactNode. In this codebase the label is `<AppBadge value=>`.
//   - `onClear?` is REQUIRED for the × button to render.
//   - `readonly` shows the value but blocks interaction (used in detail pages,
//     not filter bars).
//
// Shadcn primitives required: select, button (for `buttonVariants`), spinner.
// Internal helpers: ClearInputButton, SelectTrigger (custom wrapper that
// swaps the chevron for a custom icon — spinner or × — when provided).
// =============================================================================

import { useCallback, useState } from "react";
import ClearInputButton from "@/components/common/clear-input-button";
import { SelectTrigger } from "@/components/common/select-trigger";
import { buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type CommitSelectOption<TData extends string | number> = {
  value: TData;
  label: React.ReactNode;
};

export type CommitSelectProps<TData extends string | number> = {
  defaultValue?: string | number;
  options: readonly CommitSelectOption<TData>[];
  placeholder: string;
  disabled?: boolean;
  readonly?: boolean;
  className?: string;
  contentSide?: "top" | "right" | "bottom" | "left";
  align?: "center" | "end" | "start";
  /** ID for the select trigger (for label htmlFor) */
  id?: string;

  /**
   * Called when user commits a value.
   * Should be used for async side-effects (API, mutation, toast, ...)
   */
  onCommit: (option: CommitSelectOption<TData>) => Promise<void>;
  onClear?: () => Promise<void>;
};

function CommitSelect<TData extends string | number>({
  defaultValue,
  options,
  placeholder,
  disabled,
  readonly,
  className,
  contentSide = "bottom",
  align = "start",
  id,
  onCommit,
  onClear,
}: CommitSelectProps<TData>) {
  const [isPending, setIsPending] = useState(false);
  const [value, setValue] = useState<string | number | undefined>(defaultValue);

  const isSelectDisabled = disabled || isPending || readonly;
  const showClear = !!value && !disabled && !isPending && !!onClear;

  const handleCommit = useCallback(
    async (newValue: string | number) => {
      if (!onCommit || isPending) return;
      const option = options.find((o) => String(o.value) === String(newValue))!;

      try {
        setIsPending(true);
        setValue(newValue);
        await onCommit(option);
      } finally {
        setIsPending(false);
      }
    },
    [onCommit, isPending, options],
  );

  const icon = isPending ? (
    <Spinner />
  ) : showClear ? (
    <ClearInputButton
      className="translate-x-1"
      onClear={() => {
        setIsPending(true);
        onClear?.().finally(() => {
          setValue(undefined);
          setIsPending(false);
        });
      }}
    />
  ) : undefined;

  return (
    <Select
      value={value ? String(value) : ""}
      disabled={isSelectDisabled}
      onValueChange={handleCommit}
    >
      <SelectTrigger
        id={id}
        icon={icon}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "min-w-32 justify-between",
          isPending && "animate-pulse cursor-wait!",
          readonly && "hover:cursor-not-allowed! opacity-100!",
          className,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>

      <SelectContent side={contentSide} position="popper" align={align}>
        {options.map((opt) => (
          <SelectItem key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default CommitSelect;
