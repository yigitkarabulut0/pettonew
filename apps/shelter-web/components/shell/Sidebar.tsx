"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BadgeCheck,
  BarChart3,
  Building2,
  Clock,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PawPrint,
  Settings,
  UserPlus
} from "lucide-react";

import { cn } from "@/lib/utils";
import { apiLogout } from "@/lib/api";

// Items flagged `requiresVerification: true` are greyed out for unverified
// shelters. Dashboard/profile/settings remain reachable so they can at
// least see their own account state + tweak their details while waiting.
type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresVerification?: boolean;
};

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pets", label: "Adoptable Pets", icon: PawPrint, requiresVerification: true },
  { href: "/applications", label: "Applications", icon: UserPlus, requiresVerification: true },
  { href: "/analytics", label: "Analytics", icon: BarChart3, requiresVerification: true },
  { href: "/chats", label: "Chats", icon: MessageSquare, requiresVerification: true },
  { href: "/profile", label: "Profile", icon: Building2 },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function Sidebar({
  shelterName,
  verified
}: {
  shelterName: string;
  /** True when the shelter record has a `verified_at` timestamp. */
  verified: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function onLogout() {
    await apiLogout();
    router.push("/login");
  }

  return (
    <div
      className="flex h-screen w-[var(--sidebar-w)] flex-col border-r border-[var(--border)] bg-white"
      style={{ width: "var(--sidebar-w)" }}
    >
      <div className="flex h-[var(--topbar-h)] items-center gap-2 border-b border-[var(--border)] px-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
          <Building2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <div className="truncate text-sm font-semibold">
              {shelterName || "Fetcht Shelter"}
            </div>
            {verified && (
              <BadgeCheck
                className="size-4 shrink-0 text-[var(--primary)]"
                aria-label="Verified"
              />
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            {verified ? (
              "Verified shelter"
            ) : (
              <>
                <Clock className="size-3" />
                <span>Pending verification</span>
              </>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          const locked = item.requiresVerification && !verified;
          if (locked) {
            return (
              <div
                key={item.href}
                aria-disabled
                title="Account verification required"
                className={cn(
                  "mx-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                  "cursor-not-allowed text-[var(--muted-foreground)] opacity-60"
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "mx-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-[var(--primary-soft)] text-[var(--primary)] font-medium"
                  : "text-[var(--foreground)] hover:bg-[var(--muted)]"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={onLogout}
        className="mx-2 mb-3 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
      >
        <LogOut className="size-4" />
        Sign out
      </button>
    </div>
  );
}
