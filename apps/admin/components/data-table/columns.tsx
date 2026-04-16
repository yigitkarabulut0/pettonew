"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

export function RowActions({ items }: { items: { label: string; onSelect?: () => void; href?: string; destructive?: boolean; disabled?: boolean }[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Row actions"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        {items.map((it, idx) => (
          <DropdownMenuItem
            key={`${it.label}-${idx}`}
            onSelect={() => {
              if (it.href) {
                if (typeof window !== "undefined") window.location.href = it.href;
                return;
              }
              it.onSelect?.();
            }}
            destructive={it.destructive}
            disabled={it.disabled}
          >
            {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DetailLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-[var(--petto-ink)] hover:text-[var(--petto-primary)]">
      {children}
    </Link>
  );
}
