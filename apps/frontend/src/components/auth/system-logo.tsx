import { cn } from "@/lib/utils";

/** Logo hệ thống (đường dẫn cùng origin /client-logos/…); không có thì hiện chữ cái đầu. */
export function SystemLogo({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  return logoUrl ? (
    <img src={logoUrl} alt="" className={cn("size-5 rounded object-contain", className)} />
  ) : (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded bg-primary text-xs font-semibold text-primary-foreground",
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
