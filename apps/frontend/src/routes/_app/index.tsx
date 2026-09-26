import { createFileRoute } from "@tanstack/react-router";

// S8 dashboard (launcher các hệ thống) thuộc GĐ A — GĐ 0 chỉ là khung.
export const Route = createFileRoute("/_app/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-2xl font-semibold">Trang tổng hợp các hệ thống</h1>
      <p className="text-muted-foreground">Danh sách hệ thống sẽ hiển thị ở đây.</p>
    </div>
  );
}
