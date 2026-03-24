import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-2xl border border-[var(--petto-border)] bg-white px-4 text-sm text-[var(--petto-ink)] outline-none placeholder:text-[var(--petto-muted)] focus:border-[var(--petto-primary)]",
        className
      )}
      {...props}
    />
  );
}

