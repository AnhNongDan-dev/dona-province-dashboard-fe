// =============================================================================
// SearchInput — uncontrolled free-text search box with debounce-friendly API.
//
// Drop into: src/components/common/search-input.tsx
// Used by:   xxx-table-search.tsx (every list page with a free-text filter)
//
// Key behaviour:
//   - Uncontrolled: keeps the input state local via `useState` + internal ref.
//     The parent must pass `defaultValue=` (NOT `value=`). Controlled mode
//     would break ESC-clear and lose cursor position on every re-render.
//   - ESC clears the input; pressing ESC twice blurs.
//   - Trailing × clear button appears once the user types.
//   - Auto-focuses on desktop; not on mobile (`useIsMobile` prevents keyboard
//     pop-up on page load).
//   - Calls `onInputChange(searchValue)` on every change *after* mount — the
//     `isMounted` ref skips the synthetic first-render fire that would
//     otherwise echo `defaultValue` back to the parent.
//
// Shadcn primitives required: input-group (or any input wrapper of yours).
// Replace `@/components/ui/input-group` with `@/components/ui/input` if you
// don't have an InputGroup — the icon/clear-button slots are optional.
// =============================================================================

import { SearchIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ClearInputButton from "@/components/common/clear-input-button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const SearchInput = ({
  defaultValue,
  onInputChange,
  placeholder = "Tìm kiếm...",
  className,
}: {
  placeholder?: string;
  defaultValue?: string;
  className?: string;
  onInputChange: (query?: string) => void;
}) => {
  const ref = useRef<HTMLInputElement>(null);
  const onInputChangeRef = useRef(onInputChange);
  onInputChangeRef.current = onInputChange;
  const isMounted = useRef(false);

  const isMobile = useIsMobile();

  const [searchValue, setSearchValue] = useState(defaultValue);

  const clearInput = useCallback(() => {
    if (ref.current) ref.current.value = "";
    setSearchValue("");
  }, []);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    onInputChangeRef.current(searchValue);
  }, [searchValue]);

  return (
    <InputGroup className={cn("max-w-80", className)}>
      <InputGroupInput
        placeholder={placeholder}
        name="query"
        autoComplete="off"
        defaultValue={defaultValue}
        className="pl-9 pr-9"
        onKeyDown={(e) => {
          if (e.key.toLowerCase() === "escape") {
            clearInput();
            if (searchValue === "") return ref.current!.blur();
          }
        }}
        onChange={(e) => {
          setSearchValue(e.target.value);
        }}
        autoFocus={!isMobile}
        ref={ref}
      />
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      {searchValue?.trim() && (
        <InputGroupAddon align="inline-end">
          <ClearInputButton onClear={clearInput} />
        </InputGroupAddon>
      )}
    </InputGroup>
  );
};

export default SearchInput;
