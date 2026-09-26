import { APP_CONFIG } from "@repo/shared/src/app-config";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="flex h-full items-center justify-center">
      <h1 className="text-2xl font-semibold">{APP_CONFIG.NAME}</h1>
    </main>
  );
}
