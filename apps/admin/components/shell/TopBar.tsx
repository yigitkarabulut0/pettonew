"use client";

import { ChevronDown, LogOut, Menu, Search, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { useSidebar } from "@/components/shell/SidebarContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiLogout } from "@/lib/api/client";
import { fmtInitials } from "@/lib/format";
import { useAdminSession } from "@/lib/permissions";

interface TopBarProps {
  onOpenCommand: () => void;
  reportsOpen?: number;
}

export function TopBar({ onOpenCommand, reportsOpen }: TopBarProps) {
  const router = useRouter();
  const { session } = useAdminSession();
  const { setMobileOpen } = useSidebar();
  const env = process.env.NEXT_PUBLIC_APP_ENV ?? (process.env.NODE_ENV === "production" ? "prod" : "dev");

  const handleLogout = async () => {
    try {
      await apiLogout();
      toast.success("Signed out");
      router.replace("/login");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sign out");
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-4">
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onOpenCommand}
        className="group flex h-8 flex-1 max-w-sm items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 text-sm text-[var(--muted-foreground)] transition-colors hover:border-[var(--primary)]"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left text-xs">Search users, pets, venues…</span>
        <kbd className="hidden rounded border border-[var(--border)] bg-[var(--muted)] px-1 font-mono text-[10px] font-medium text-[var(--muted-foreground)] sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-2">
        {env !== "prod" ? (
          <Badge tone={env === "staging" ? "warning" : "info"} className="uppercase">
            {env}
          </Badge>
        ) : null}
        {reportsOpen != null && reportsOpen > 0 ? (
          <Button variant="outline" size="sm" onClick={() => router.push("/reports")}>
            <span className="text-xs">Reports</span>
            <Badge tone="warning">{reportsOpen}</Badge>
          </Button>
        ) : null}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-1 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            <Avatar className="h-6 w-6">
              <AvatarFallback>{fmtInitials(session?.name ?? session?.email ?? "?")}</AvatarFallback>
            </Avatar>
            <span className="hidden max-w-[140px] truncate text-xs sm:inline-block">
              {session?.name?.trim() || session?.email || "Admin"}
            </span>
            <ChevronDown className="h-3 w-3 text-[var(--muted-foreground)]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-[var(--foreground)]">
                {session?.name?.trim() || session?.email || "Admin"}
              </span>
              {session?.email ? (
                <span className="text-[11px] text-[var(--muted-foreground)]">{session.email}</span>
              ) : null}
              {session?.role ? (
                <span className="mt-1">
                  <Badge tone="neutral">{session.role}</Badge>
                </span>
              ) : null}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push("/account")}>
            <Settings className="h-3.5 w-3.5" /> Account
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleLogout} destructive>
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
