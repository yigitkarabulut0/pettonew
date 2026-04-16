import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  icon?: LucideIcon;
  tone?: "neutral" | "success" | "warning" | "danger";
  hint?: string;
  className?: string;
}

const toneStyles: Record<NonNullable<StatCardProps["tone"]>, string> = {
  neutral: "text-[var(--muted-foreground)]",
  success: "text-[var(--success)]",
  warning: "text-[var(--warning)]",
  danger: "text-[var(--destructive)]"
};

export function StatCard({ label, value, delta, icon: Icon, tone = "neutral", hint, className }: StatCardProps) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{label}</p>
        {Icon ? <Icon className={cn("h-4 w-4", toneStyles[tone])} /> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-[var(--foreground)]">{value}</p>
        {delta ? <span className="text-xs text-[var(--muted-foreground)]">{delta}</span> : null}
      </div>
      {hint ? <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">{hint}</p> : null}
    </Card>
  );
}
