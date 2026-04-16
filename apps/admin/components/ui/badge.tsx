import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset transition-colors",
  {
    variants: {
      tone: {
        neutral: "bg-[var(--muted)] text-[var(--muted-foreground)] ring-[var(--border)]",
        success: "bg-[var(--success-soft)] text-[var(--success)] ring-green-200",
        warning: "bg-[var(--warning-soft)] text-[var(--warning)] ring-amber-200",
        danger: "bg-[var(--destructive-soft)] text-[var(--destructive)] ring-red-200",
        info: "bg-[var(--info-soft)] text-[var(--info)] ring-blue-200",
        brand: "bg-[var(--muted)] text-[var(--foreground)] ring-[var(--border)]"
      }
    },
    defaultVariants: { tone: "neutral" }
  }
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
