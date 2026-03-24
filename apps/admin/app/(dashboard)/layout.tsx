"use client";

import { BarChart3, CalendarDays, Dog, Flag, LayoutGrid, LogOut, MapPinned, PawPrint, ScrollText, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { adminLogout } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/users", label: "Users", icon: Users },
  { href: "/pets", label: "Pets", icon: PawPrint },
  { href: "/posts", label: "Posts", icon: ScrollText },
  { href: "/venues", label: "Venues", icon: MapPinned },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/taxonomies", label: "Taxonomies", icon: Dog },
  { href: "/reports", label: "Reports", icon: Flag }
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen px-5 py-5 lg:px-8">
      <div className="grid min-h-[calc(100vh-2.5rem)] gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[32px] border border-[var(--petto-border)] bg-[rgba(255,252,248,0.88)] p-6 shadow-[0_24px_80px_rgba(22,21,20,0.08)] backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--petto-primary)] text-white">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--petto-primary)]">Petto</p>
              <p className="text-lg font-semibold text-[var(--petto-ink)]">Operations</p>
            </div>
          </div>
          <nav className="mt-10 space-y-2">
            {navigation.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors",
                    active
                      ? "bg-[var(--petto-secondary)] text-white"
                      : "text-[var(--petto-muted)] hover:bg-white hover:text-[var(--petto-ink)]"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-10 rounded-[28px] bg-[var(--petto-primary-soft)] p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--petto-secondary)]">Moderation pulse</p>
            <h3 className="mt-2 text-2xl text-[var(--petto-ink)]">Keep the ecosystem safe and sharp.</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--petto-muted)]">
              Track growth without losing sight of trust, taxonomy quality, and conversation safety.
            </p>
          </div>
          <Button
            className="mt-8 w-full"
            variant="ghost"
            onClick={() => {
              adminLogout();
              router.replace("/login");
              router.refresh();
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </aside>
        <div className="space-y-5">{children}</div>
      </div>
    </div>
  );
}
