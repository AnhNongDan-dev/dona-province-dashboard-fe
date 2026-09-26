// =============================================================================
// useDebouncedValue — debounce a value by `delayMs`. Returns the latest value
// after no changes for the delay window.
//
// Drop into: src/hooks/use-debounced-value.ts
// Used by:   AsyncSearchCombobox (300 ms search debounce).
// =============================================================================

import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
