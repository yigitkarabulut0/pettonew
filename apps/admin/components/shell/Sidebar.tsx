"use client";

import { PanelLeftClose, PanelLeftOpen, PawPrint } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_GROUPS } from "@/components/shell/nav-config";
import { useSidebar } from "@/components/shell/SidebarContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { hasRole, useAdminSession } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const { session } = useAdminSession();
  const { collapsed, toggle, mobileOpen, setMobileOpen } = useSidebar();

  return (
    <>
      {/* Mobile drawer overlay */}
      {mobileOpen ? (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--border)] bg-[var(--card)] transition-[width,transform] duration-200 md:static md:translate-x-0",
          collapsed ? "w-[var(--sidebar-w-collapsed)]" : "w-[var(--sidebar-w)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className={cn("flex items-center gap-2 border-b border-[var(--border)] px-3", collapsed ? "h-[52px] justify-center" : "h-[52px]")}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-foreground)]">
            <PawPrint className="h-3.5 w-3.5" />
          </div>
          {!collapsed ? (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold tracking-tight text-[var(--foreground)]">Petto</div>
              <div className="truncate font-mono text-[10px] text-[var(--muted-foreground)]">admin console</div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={toggle}
            className="hidden rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] md:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
          </button>
        </div>

        <TooltipProvider delayDuration={200}>
          <nav className={cn("flex-1 space-y-3 overflow-y-auto py-3", collapsed ? "px-1.5" : "px-2")}>
            {NAV_GROUPS.map((group) => {
              const visible = group.items.filter((item) =>
                !item.requires ? true : hasRole(session, item.requires)
              );
              if (visible.length === 0) return null;
              return (
                <div key={group.label}>
                  {!collapsed ? (
                    <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                      {group.label}
                    </p>
                  ) : null}
                  <div className="space-y-0.5">
                    {visible.map((item) => {
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      const Icon = item.icon;
                      const label = item.label;
                      const inner = (
                        <Link
                          href={item.href}
                          className={cn(
                            "relative flex items-center rounded-md text-sm font-medium transition-colors",
                            collapsed ? "h-8 w-8 justify-center" : "gap-2 px-2 py-1.5",
                            active
                              ? "bg-[var(--muted)] text-[var(--foreground)]"
                              : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                          )}
                          onClick={() => setMobileOpen(false)}
                        >
                          {active && !collapsed ? (
                            <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-[var(--primary)]" />
                          ) : null}
                          <Icon className="h-4 w-4 shrink-0" />
                          {!collapsed ? <span className="truncate">{label}</span> : null}
                        </Link>
                      );
                      if (collapsed) {
                        return (
                          <Tooltip key={item.href}>
                            <TooltipTrigger asChild>{inner}</TooltipTrigger>
                            <TooltipContent side="right">{label}</TooltipContent>
                          </Tooltip>
                        );
                      }
                      return <div key={item.href}>{inner}</div>;
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
        </TooltipProvider>
      </aside>
    </>
  );
}
