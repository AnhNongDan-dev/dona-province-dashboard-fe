// =============================================================================
// ClearInputButton — the trailing × button used by SearchInput, CommitSelect,
// and AsyncSearchCombobox. Tiny but several controls depend on it.
//
// Drop into: src/components/common/clear-input-button.tsx
//
// Notable detail: uses `onPointerDown` (not `onClick`) so the click registers
// before the parent input/popover handles its own pointer events. Without
// this, clicking × inside a Select would commit a value instead of clearing.
//
// Shadcn primitives required: button.
// =============================================================================

import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ClearInputButton = ({ onClear, className }: { onClear: () => void; className?: string }) => {
  return (
    <Button
      variant="ghost"
      className={cn(
        "rounded-full p-1! h-fit w-fit leading-0 cursor-pointer pointer-events-auto hover:*:stroke-destructive",
        "opacity-50 hover:opacity-100",
        className,
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClear();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <XIcon />
    </Button>
  );
};

export default ClearInputButton;
