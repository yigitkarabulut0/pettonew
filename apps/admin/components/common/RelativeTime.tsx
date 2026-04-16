"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtDateTime, fmtRelative } from "@/lib/format";

export function RelativeTime({ value }: { value?: string | Date | null }) {
  if (!value) return <span className="text-[var(--muted-foreground)]">—</span>;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-[var(--muted-foreground)]">{fmtRelative(value)}</span>
        </TooltipTrigger>
        <TooltipContent>{fmtDateTime(value)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
