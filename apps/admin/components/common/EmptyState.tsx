import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)] px-6 py-10 text-center",
        className
      )}
    >
      {Icon ? (
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--background)] text-[var(--muted-foreground)]">
          <Icon className="h-4 w-4" />
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
      {description ? (
        <p className="max-w-md text-xs text-[var(--muted-foreground)]">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
