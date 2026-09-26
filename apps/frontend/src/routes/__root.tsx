import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <TooltipProvider>
      <div className="block w-dvw h-dvh relative">
        <Outlet />
      </div>
    </TooltipProvider>
  );
}
