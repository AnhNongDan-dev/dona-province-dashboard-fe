// SEED ONLY — not compiled or linted. A portable template, not production code.
// Lint-checked sources (ELP-fe — not ported to this repo yet):
//   ELP-fe/apps/frontend/src/components/common/async-search-combobox.tsx
//   ELP-fe/apps/frontend/src/components/common/async-search-select.tsx
//
// Pattern for purely-local debounced search inside one component (popover
// combobox, autocomplete). No URL involvement — this is NOT for table filters
// (those debounce through useUrlSearch's updateSearchDebounced instead).

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

type Option = { id: number; label: string };

interface Props {
  onSearch: (query: string) => Promise<Option[]>;
  isOpen: boolean;
}

export function LocalDebouncedSearch({ onSearch, isOpen }: Props) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query);

  const [options, setOptions] = useState<Option[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // Guard against a stale response landing after a newer query started.
    let cancelled = false;
    const run = async () => {
      try {
        setIsSearching(true);
        const results = await onSearch(debouncedQuery.trim());
        if (!cancelled) setOptions(results);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, onSearch, isOpen]);

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="Nhập để tìm kiếm"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {isSearching ? (
        <Spinner />
      ) : options.length === 0 && debouncedQuery.trim() ? (
        <div className="text-sm text-muted-foreground">Không tìm thấy kết quả</div>
      ) : (
        <ul>
          {options.map((opt) => (
            <li key={opt.id}>{opt.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
