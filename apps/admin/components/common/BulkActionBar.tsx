"use client";

import { X } from "lucide-react";
import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  children: ReactNode;
}

export function BulkActionBar({ count, onClear, children }: BulkActionBarProps) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-1.5 text-xs">
      <span className="font-medium text-[var(--foreground)]">{count} selected</span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {children}
        <Button variant="ghost" size="icon" onClick={onClear} aria-label="Clear selection">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
