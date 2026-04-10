"use client";

import { AlertTriangle, Award, Bell, Calendar, CalendarDays, Dog, Flag, GraduationCap, LayoutGrid, LogOut, MapPinned, PawPrint, ScrollText, Stethoscope, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { adminLogout } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutGrid }]
  },
  {
    label: "Users & Content",
    items: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/pets", label: "Pets", icon: PawPrint },
      { href: "/posts", label: "Posts", icon: ScrollText }
    ]
  },
  {
    label: "Places & Events",
    items: [
      { href: "/venues", label: "Venues", icon: MapPinned },
      { href: "/events", label: "Events", icon: CalendarDays }
    ]
  },
  {
    label: "Configuration",
    items: [{ href: "/taxonomies", label: "Taxonomies", icon: Dog }]
  },
  {
    label: "Moderation",
    items: [{ href: "/reports", label: "Reports", icon: Flag }]
  },
  {
    label: "Notifications",
    items: [{ href: "/notifications", label: "Push Notifications", icon: Bell }]
  },
  {
    label: "Care & Training",
    items: [
      { href: "/training-tips", label: "Training Tips", icon: GraduationCap },
      { href: "/vet-clinics", label: "Vet Clinics", icon: Stethoscope },
      { href: "/pet-sitters", label: "Pet Sitters", icon: UserCheck }
    ]
  },
  {
    label: "Community",
    items: [
      { href: "/playdates", label: "Playdates", icon: Calendar },
      { href: "/groups", label: "Groups", icon: Users },
      { href: "/lost-pets", label: "Lost Pets", icon: AlertTriangle }
    ]
  },
  {
    label: "Gamification",
    items: [{ href: "/badges", label: "Badges", icon: Award }]
  }
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen px-5 py-5 lg:px-8">
      <div className="grid min-h-[calc(100vh-2.5rem)] gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex flex-col rounded-[32px] border border-[var(--petto-border)] bg-[rgba(255,252,248,0.88)] p-6 shadow-[0_24px_80px_rgba(22,21,20,0.08)] backdrop-blur-sm">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--petto-primary)] text-white">
              <PawPrint className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--petto-primary)]">Petto</p>
              <p className="text-lg font-semibold text-[var(--petto-ink)]">Operations</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="mt-8 flex-1 space-y-6">
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--petto-muted)]">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                          active
                            ? "bg-[var(--petto-primary-soft)] text-[var(--petto-ink)]"
                            : "text-[var(--petto-muted)] hover:bg-white hover:text-[var(--petto-ink)]"
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--petto-primary)]" />
                        )}
                        <item.icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="mt-auto border-t border-[var(--petto-border)] pt-4">
            <p className="mb-2 px-3 text-xs font-semibold text-[var(--petto-ink)]">Petto Admin</p>
            <Button
              className="w-full justify-start text-[var(--petto-muted)]"
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
          </div>
        </aside>
        <div className="space-y-5">{children}</div>
      </div>
    </div>
  );
}
