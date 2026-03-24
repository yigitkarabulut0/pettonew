import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-[var(--petto-border)] bg-[rgba(255,252,248,0.9)] p-6 shadow-[0_24px_80px_rgba(22,21,20,0.08)] backdrop-blur-sm",
        className
      )}
      {...props}
    />
  );
}

