"use client";

import { useCommandPalette } from "@/components/shell/CommandPalette";
import { Sidebar } from "@/components/shell/Sidebar";
import { SidebarProvider, useSidebar } from "@/components/shell/SidebarContext";
import { TopBar } from "@/components/shell/TopBar";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <Inner>{children}</Inner>
    </SidebarProvider>
  );
}

function Inner({ children }: { children: React.ReactNode }) {
  const { setOpen } = useCommandPalette();
  const { collapsed } = useSidebar();
  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <Sidebar />
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-[margin] duration-200"
        )}
        style={{ marginLeft: 0 }}
      >
        <TopBar onOpenCommand={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6" data-sidebar-collapsed={collapsed}>
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
