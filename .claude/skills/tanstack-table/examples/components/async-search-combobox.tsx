// =============================================================================
// AsyncSearchCombobox — entity picker. Debounced async search + localStorage
// label cache + single/multi mode.
//
// Drop into: src/components/common/async-search-combobox.tsx
// Used by:   xxx-table-search.tsx for every entity filter (province, district,
//            user picker, etc.). Also used in forms; this file is the same
//            component.
//
// Why it exists (the parts that aren't obvious from the props):
//
//   1. localStorage label cache (`async-search-combobox-cache`).
//      When the URL says `?provinceId=42` on first render, we don't have the
//      province name — only the ID. Fetching the name on mount would mean every
//      filtered table page does an extra round-trip before showing the badge.
//      Instead: every time the user commits an option we store `{key, label,
//      secondary}` in localStorage keyed by `option.key`. On the next render
//      we read it back via `defaultKeyOption` → instant label.
//
//   2. `defaultKeyOption` vs `defaultOption`.
//      - `defaultKeyOption: "province-42"` → looks up the cache. Use this for
//        URL hydration where you only have an ID.
//      - `defaultOption: { key, label, data }` → trust this object as-is. Use
//        this when the parent already has the full object (e.g. inside a
//        form). Pass at most one of the two.
//
//   3. `primeAsyncSearchOption` (exported helper).
//      For cross-page links: dashboard card → `/app/reports?indicatorGroupId=5`.
//      The destination's combobox has `defaultKeyOption="indicator-group-5"` but the
//      cache may not have it yet (different user, cleared storage). Calling
//      `primeAsyncSearchOption({ key, label })` on mousedown seeds the cache
//      so the destination renders the label immediately, including for
//      middle-click / Cmd-click which bypass React `onClick` on <a>.
//      Wrap with <LinkWithPrime> at call sites instead of calling directly.
//
//   4. `renderOption` for rich dropdown rows.
//      User pickers show name + phone + ID number per row. Provide
//      `renderOption(option) => ReactNode` to override the default
//      "label / secondary" two-line row.
//
//   5. `multiple` mode.
//      Renders selected options as pills inside the trigger with per-pill ×
//      and a global × clear. `onCommit` receives the full array.
//
//   6. Debounced internal search via `useDebouncedValue` — 300 ms default.
//      The `onSearch(query)` callback runs only after the user pauses.
//
// Shadcn primitives required: badge, command (CommandInput / CommandItem /
// CommandList / CommandEmpty), input-group, popover, spinner.
// Internal helpers: ClearInputButton, useDebouncedValue hook.
// =============================================================================

import { ChevronDown, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { type ZodType, z } from "zod";
import ClearInputButton from "@/components/common/clear-input-button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";

const ASYNC_SEARCH_CACHE_KEY = "async-search-combobox-cache";

const optionSchema = z.object({
  key: z.string(),
  data: z.unknown(),
  label: z.string(),
  secondary: z.string().optional(),
});

const getOptionFromCache = <T,>(key: string): AsyncSearchComboboxOption<T> | null => {
  try {
    const cached = localStorage.getItem(ASYNC_SEARCH_CACHE_KEY);
    if (!cached) return null;
    const allCached = JSON.parse(cached) as Record<string, unknown>;
    const data = allCached[key];
    const result = optionSchema.safeParse(data);
    if (!result.success) {
      return null;
    }
    return result.data as AsyncSearchComboboxOption<T>;
  } catch {
    return null;
  }
};

const cacheOption = <T,>(option: AsyncSearchComboboxOption<T>): void => {
  try {
    const result = optionSchema.safeParse(option);
    if (!result.success) {
      return;
    }
    const cached = localStorage.getItem(ASYNC_SEARCH_CACHE_KEY);
    const allCached = cached
      ? (JSON.parse(cached) as Record<string, AsyncSearchComboboxOption<T>>)
      : {};
    allCached[option.key] = result.data as AsyncSearchComboboxOption<T>;
    localStorage.setItem(ASYNC_SEARCH_CACHE_KEY, JSON.stringify(allCached));
  } catch {
    // Silently fail
  }
};

export type AsyncSearchComboboxOption<T = unknown> = {
  data: T;
  label: string;
  key: string;
  /**
   * Optional secondary text rendered right-aligned and dimmed inside the dropdown item
   * and at the end of the selected (single-select) input.
   * Use it for metadata like a code/slug that supports the label without competing with it.
   */
  secondary?: string;
};

export type PrimeAsyncSearchOption = {
  key: string;
  label: string;
  secondary?: string;
};

/**
 * Seed the combobox's localStorage cache so a downstream page with
 * `defaultKeyOption={key}` renders the label immediately. Prefer
 * `<LinkWithPrime>` over calling this directly — the wrapper handles
 * the `onMouseDown` timing required for middle-click / Cmd-click.
 *
 * Only `key`/`label`/`secondary` are stored. `data` is intentionally omitted:
 * it is only meaningful when the user actively commits a selection, at which
 * point the real search response provides the correctly-typed entity.
 */
export const primeAsyncSearchOption = (option: PrimeAsyncSearchOption): void => {
  cacheOption({ ...option, data: null });
};

export const AsyncSearchComboboxOptionSchema = <T extends ZodType>(
  schema: T,
  errorMessage: string,
) =>
  z.object(
    {
      data: schema,
      label: z.string(),
      key: z.string(),
      secondary: z.string().optional(),
    },
    errorMessage,
  );

type SingleProps<T = unknown> = {
  multiple?: false;
  defaultOption?: AsyncSearchComboboxOption<T>;
  defaultKeyOption?: string;
  onCommit: (option: AsyncSearchComboboxOption<T>) => Promise<void>;
  onClear?: () => Promise<void>;
};

type MultipleProps<T = unknown> = {
  multiple: true;
  defaultOption?: AsyncSearchComboboxOption<T>[];
  defaultKeyOption?: never;
  onCommit: (options: AsyncSearchComboboxOption<T>[]) => Promise<void>;
  onClear?: () => Promise<void>;
};

type BaseProps<T = unknown> = {
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  className?: string;
  contentSide?: "top" | "right" | "bottom" | "left";
  id?: string;
  onSearch: (query: string) => Promise<AsyncSearchComboboxOption<T>[]>;
  renderOption?: (option: AsyncSearchComboboxOption<T>) => ReactNode;
};

export type AsyncSearchComboboxProps<T = unknown> = BaseProps<T> &
  (SingleProps<T> | MultipleProps<T>);

function AsyncSearchCombobox<T = unknown>(props: AsyncSearchComboboxProps<T>) {
  const {
    placeholder = "Tìm kiếm...",
    searchPlaceholder = "Nhập để tìm kiếm",
    disabled,
    readonly,
    className,
    contentSide = "bottom",
    id,
    onSearch,
    onClear,
    multiple,
    renderOption,
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [options, setOptions] = useState<AsyncSearchComboboxOption<T>[]>([]);

  const [selectedOption, setSelectedOption] = useState<AsyncSearchComboboxOption<T> | null>(() => {
    if (multiple) return null;
    if (props.defaultOption) return props.defaultOption as AsyncSearchComboboxOption<T>;
    if (props.defaultKeyOption) return getOptionFromCache<T>(props.defaultKeyOption);
    return null;
  });

  const [selectedOptions, setSelectedOptions] = useState<AsyncSearchComboboxOption<T>[]>(() => {
    if (!multiple) return [];
    return (props.defaultOption as AsyncSearchComboboxOption<T>[] | undefined) ?? [];
  });

  const triggerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query);

  useEffect(() => {
    if (!isOpen) return;

    const performSearch = async () => {
      try {
        setIsSearching(true);
        const results = await onSearch(debouncedQuery.trim());
        setOptions(results);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedQuery, onSearch, isOpen]);

  const handleSelectOption = useCallback(
    async (option: AsyncSearchComboboxOption<T>) => {
      if (isPending) return;

      if (multiple) {
        const isSelected = selectedOptions.some((o) => o.key === option.key);
        const next = isSelected
          ? selectedOptions.filter((o) => o.key !== option.key)
          : [...selectedOptions, option];

        if (!isSelected) cacheOption(option);

        try {
          setIsPending(true);
          await (props.onCommit as (options: AsyncSearchComboboxOption<T>[]) => Promise<void>)(
            next,
          );
          setSelectedOptions(next);
        } finally {
          setIsPending(false);
        }
      } else {
        try {
          setIsPending(true);
          cacheOption(option);
          await (props.onCommit as (option: AsyncSearchComboboxOption<T>) => Promise<void>)(option);
          setSelectedOption(option);
          setIsOpen(false);
        } finally {
          setIsPending(false);
        }
      }
    },
    [isPending, multiple, props.onCommit, selectedOptions],
  );

  const handleRemoveOption = useCallback(
    async (key: string) => {
      if (isPending || !multiple) return;
      const next = selectedOptions.filter((o) => o.key !== key);
      try {
        setIsPending(true);
        await (props.onCommit as (options: AsyncSearchComboboxOption<T>[]) => Promise<void>)(next);
        setSelectedOptions(next);
      } finally {
        setIsPending(false);
      }
    },
    [isPending, multiple, props.onCommit, selectedOptions],
  );

  const handleClear = useCallback(async () => {
    if (isPending) return;

    try {
      setIsPending(true);
      if (onClear) await onClear();
      if (multiple) {
        await (props.onCommit as (options: AsyncSearchComboboxOption<T>[]) => Promise<void>)([]);
        setSelectedOptions([]);
      } else {
        setSelectedOption(null);
      }
      setQuery("");
    } finally {
      setIsPending(false);
    }
  }, [isPending, multiple, onClear, props.onCommit]);

  const hasValue = multiple ? selectedOptions.length > 0 : !!selectedOption;
  const hasQuery = debouncedQuery.trim().length > 0;

  return (
    <Popover
      open={isOpen && !disabled && !readonly}
      onOpenChange={(open) => !disabled && !readonly && setIsOpen(open)}
    >
      <PopoverTrigger asChild>
        {multiple ? (
          <button
            type="button"
            id={id}
            ref={triggerRef as React.Ref<HTMLButtonElement>}
            tabIndex={disabled || readonly ? -1 : 0}
            onClick={() => !readonly && !disabled && setIsOpen(true)}
            className={cn(
              "relative flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs transition-colors",
              !readonly && !disabled && "cursor-pointer hover:border-ring",
              (readonly || disabled) && "cursor-not-allowed opacity-50",
              className,
            )}
          >
            {selectedOptions.length === 0 && (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            {selectedOptions.map((opt) => (
              <Badge key={opt.key} variant="secondary" className="gap-1 pr-1">
                {opt.label}
                {!readonly && !disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveOption(opt.key);
                    }}
                    className="rounded-full hover:bg-muted-foreground/20"
                    disabled={isPending}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
            <div className="ml-auto flex items-center gap-1">
              {hasValue && !readonly && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClear();
                  }}
                  disabled={isPending}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <ChevronDown className="pointer-events-none opacity-50" />
            </div>
          </button>
        ) : (
          <div ref={triggerRef}>
            <InputGroup className={className}>
              <InputGroupInput
                key={selectedOption?.key}
                id={id}
                placeholder={placeholder}
                disabled={disabled || isPending}
                readOnly
                onClick={() => !readonly && !disabled && setIsOpen(true)}
                className={readonly ? "cursor-not-allowed" : "cursor-pointer"}
                value={selectedOption?.label}
              />
              <InputGroupAddon align="inline-end">
                {selectedOption?.secondary && (
                  <span className="truncate text-xs text-muted-foreground/70">
                    {selectedOption.secondary}
                  </span>
                )}
                {selectedOption && onClear ? (
                  <ClearInputButton onClear={handleClear} />
                ) : (
                  <ChevronDown className="pointer-events-none opacity-50" />
                )}
              </InputGroupAddon>
            </InputGroup>
          </div>
        )}
      </PopoverTrigger>
      <PopoverContent
        side={contentSide}
        align="start"
        onWheel={(e) => e.stopPropagation()}
        className="w-(--radix-popover-trigger-width) min-w-72 gap-0 p-0"
      >
        <Command shouldFilter={false} className="bg-transparent">
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
            disabled={isPending || disabled || readonly}
          />
          <CommandList>
            {isSearching ? (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            ) : options.length === 0 ? (
              <CommandEmpty>{hasQuery ? "Không tìm thấy kết quả" : searchPlaceholder}</CommandEmpty>
            ) : (
              options.map((option) => {
                const isSelected = multiple
                  ? selectedOptions.some((o) => o.key === option.key)
                  : selectedOption?.key === option.key;
                return (
                  <CommandItem
                    key={option.key}
                    value={option.key}
                    data-checked={isSelected}
                    disabled={isPending}
                    onSelect={() => handleSelectOption(option)}
                  >
                    {renderOption ? (
                      renderOption(option)
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        {option.secondary && (
                          <span className="ml-2 min-w-0 max-w-[40%] shrink truncate text-xs text-muted-foreground/70">
                            {option.secondary}
                          </span>
                        )}
                      </>
                    )}
                  </CommandItem>
                );
              })
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default AsyncSearchCombobox;
