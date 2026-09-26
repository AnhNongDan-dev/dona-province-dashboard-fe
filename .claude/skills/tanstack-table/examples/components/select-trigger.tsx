// =============================================================================
// SelectTrigger — thin wrapper around shadcn SelectTrigger that lets you
// swap the default chevron for a custom icon (Spinner during pending,
// ClearInputButton when a value is set).
//
// Drop into: src/components/common/select-trigger.tsx
// Used by:   CommitSelect.
//
// When `icon` is provided, the vanilla chevron is hidden via CSS
// (`[&>svg:last-of-type]:hidden`) and the custom icon is rendered after
// children. Without this wrapper you'd have to fork shadcn's SelectTrigger.
//
// Shadcn primitives required: select (SelectTrigger).
// =============================================================================

import { SelectTrigger as ShadcnSelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ShadcnSelectTriggerProps = React.ComponentProps<typeof ShadcnSelectTrigger>;

export function SelectTrigger({
  icon,
  children,
  className,
  ...props
}: ShadcnSelectTriggerProps & { icon?: React.ReactNode }) {
  return (
    <ShadcnSelectTrigger
      className={cn(icon && "[&>svg:last-of-type]:hidden", className)}
      {...props}
    >
      {children}
      {icon}
    </ShadcnSelectTrigger>
  );
}
