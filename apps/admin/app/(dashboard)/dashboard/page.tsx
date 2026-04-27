"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  FileText,
  Flag,
  Heart,
  ImageIcon,
  MapPin,
  PawPrint,
  Radio,
  Tag,
  Users
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import * as React from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api/client";
import { getDashboard } from "@/lib/admin-api";
import { fmtInitials } from "@/lib/format";

const GrowthChart = dynamic(
  () => import("@/components/growth-chart").then((m) => m.GrowthChart),
  { ssr: false }
);

type DashboardMetrics = {
  dau?: number;
  mau?: number;
  newUsers24h?: number;
  matches24h?: number;
  swipes24h?: number;
  posts24h?: number;
  reportsOpen: number;
  reportsOverdue: number;
  byKey?: Record<string, string>;
  growth?: Array<{ label: string; users: number; pets: number; matches: number; activeUsers: number }>;
};

type ActiveUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  cityLabel?: string;
  lastAt: string;
};

export default function DashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: getDashboard,
    refetchInterval: 30_000
  });
  const metricsQuery = useQuery<DashboardMetrics>({
    queryKey: ["admin-dashboard-metrics"],
    queryFn: () => apiRequest<DashboardMetrics>("/dashboard/metrics"),
    refetchInterval: 20_000
  });
  // Real-time presence: backend returns everyone with a heartbeat within the
  // last 60s. Poll every 5s so the UI flips green/grey in near-real-time
  // when a user opens or closes the mobile app.
  const activeUsersQuery = useQuery<ActiveUser[]>({
    queryKey: ["admin-active-users"],
    queryFn: () => apiRequest<ActiveUser[]>("/active-users"),
    refetchInterval: 5_000
  });
  const venuesQuery = useQuery({
    queryKey: ["admin-venues"],
    queryFn: () => apiRequest<any[]>("/venues")
  });

  const snap = dashboardQuery.data;
  const metrics = metricsQuery.data;

  const dau = metrics?.dau ?? 0;
  const mau = metrics?.mau ?? 0;
  const newToday = metrics?.newUsers24h ?? 0;
  const matches24h = metrics?.matches24h ?? 0;
  const swipes24h = metrics?.swipes24h ?? 0;
  const posts24h = metrics?.posts24h ?? 0;
  const reportsOpen = metrics?.reportsOpen ?? 0;
  const byKey = metrics?.byKey ?? {};
  // Backend already applies the 60-second liveness window, so every row it
  // returns represents a user currently online.
  const activeUsers = activeUsersQuery.data ?? [];
  const liveUsers = activeUsers;
  const topVenues = (venuesQuery.data ?? []).slice(0, 5);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Dashboard"
        description="Live community health, growth funnel, and moderation queue."
        actions={
          <Badge tone={liveUsers.length > 0 ? "success" : "neutral"}>
            <Radio className="h-3 w-3" /> {liveUsers.length} live now
          </Badge>
        }
      />

      {/* KPI row 1 — audience */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Live now"
          value={liveUsers.length.toLocaleString()}
          hint="Active within last 5 minutes"
          icon={Radio}
          tone={liveUsers.length > 0 ? "success" : "neutral"}
        />
        <StatCard
          label="Daily active"
          value={dau.toLocaleString()}
          hint="Distinct messaging users · 24h"
          icon={Activity}
        />
        <StatCard
          label="Monthly active"
          value={mau.toLocaleString()}
          hint="Unique users · 30d"
          icon={Users}
        />
        <StatCard
          label="Signups 24h"
          value={newToday.toLocaleString()}
          hint={`${byKey.users ?? "—"} total users`}
          icon={Users}
        />
      </section>

      {/* KPI row 2 — engagement */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Swipes 24h"
          value={swipes24h.toLocaleString()}
          hint="Discovery activity"
          icon={Tag}
        />
        <StatCard
          label="Matches 24h"
          value={matches24h.toLocaleString()}
          icon={Heart}
          tone={matches24h > 0 ? "success" : "neutral"}
        />
        <StatCard
          label="Posts 24h"
          value={posts24h.toLocaleString()}
          hint={`${byKey.posts ?? "—"} total posts`}
          icon={ImageIcon}
        />
        <StatCard
          label="Open reports"
          value={reportsOpen.toLocaleString()}
          icon={Flag}
          tone={reportsOpen > 10 ? "danger" : reportsOpen > 0 ? "warning" : "success"}
          hint={reportsOpen > 0 ? "Needs attention" : "Queue is clear"}
        />
      </section>

      {/* KPI row 3 — footprint */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pets" value={byKey.pets ?? "—"} icon={PawPrint} />
        <StatCard label="Venues" value={byKey.venues ?? "—"} icon={MapPin} />
        <StatCard label="Events" value={byKey.events ?? "—"} icon={FileText} />
        <StatCard label="Reports all-time" value={byKey.reports ?? "—"} icon={Flag} />
      </section>

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Growth</CardTitle>
              <p className="text-xs text-[var(--muted-foreground)]">
                New signups vs. daily active users — last 7 days · live.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <GrowthChart data={snap?.growth ?? []} liveCount={liveUsers.length} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Active users</CardTitle>
              <p className="text-xs text-[var(--muted-foreground)]">
                Wrote or checked in within 24h · refreshes every 15s.
              </p>
            </div>
            <Badge tone="info" className="uppercase">
              {activeUsers.length}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {activeUsers.length === 0 ? (
              <p className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">
                No user activity in the last 24h.
              </p>
            ) : (
              activeUsers.slice(0, 10).map((u) => {
                const live = true;
                return (
                  <Link
                    key={u.id}
                    href={`/users/${u.id}`}
                    className="flex items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2 hover:bg-[var(--muted)]"
                  >
                    <div className="relative">
                      <Avatar className="h-7 w-7">
                        {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt={u.name} /> : null}
                        <AvatarFallback>{fmtInitials(u.name || u.email)}</AvatarFallback>
                      </Avatar>
                      {live ? (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--card)] bg-[var(--success)]" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{u.name || u.email}</div>
                      <div className="truncate text-[11px] text-[var(--muted-foreground)]">
                        {u.cityLabel || u.email}
                      </div>
                    </div>
                    <span className="text-[11px] text-[var(--muted-foreground)]">
                      <RelativeTime value={u.lastAt} />
                    </span>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent reports + top venues */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent reports</CardTitle>
            <p className="text-xs text-[var(--muted-foreground)]">Latest flagged items.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {(snap?.recentReports ?? []).length === 0 ? (
              <p className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">
                Nothing in the queue 🎉
              </p>
            ) : (
              snap?.recentReports.slice(0, 6).map((report) => (
                <Link
                  key={report.id}
                  href={`/reports/${report.id}`}
                  className="flex items-start justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 transition-colors hover:bg-[var(--muted)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--foreground)]">
                      {report.reason}
                    </div>
                    <div className="truncate text-[11px] text-[var(--muted-foreground)]">
                      {report.targetType} · {report.targetLabel} · by {report.reporterName}
                    </div>
                  </div>
                  <StatusBadge status={report.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top venues</CardTitle>
            <p className="text-xs text-[var(--muted-foreground)]">
              Recently curated pet-friendly places.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {topVenues.length === 0 ? (
              <p className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">
                No venues yet.
              </p>
            ) : (
              topVenues.map((v: any) => (
                <Link
                  key={v.id}
                  href={`/venues/${v.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2 hover:bg-[var(--muted)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{v.name}</div>
                    <div className="truncate text-[11px] text-[var(--muted-foreground)]">
                      {v.category} · {v.cityLabel}
                    </div>
                  </div>
                  <Badge tone="neutral">{v.checkInCount ?? 0} check-ins</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top posts */}
      <Card>
        <CardHeader>
          <CardTitle>Top posts</CardTitle>
          <p className="text-xs text-[var(--muted-foreground)]">
            Highest-liked community posts in the current window.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2 lg:grid-cols-2">
          {(snap?.topPosts ?? []).length === 0 ? (
            <div className="col-span-full rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">
              No posts yet.
            </div>
          ) : (
            snap?.topPosts.slice(0, 6).map((post) => (
              <div
                key={post.id}
                className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--foreground)]">
                      {post.author.firstName} {post.author.lastName}
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {post.author.cityLabel} · <RelativeTime value={post.createdAt} />
                    </div>
                  </div>
                  <Badge tone="success">{post.likeCount} likes</Badge>
                </div>
                <p className="line-clamp-3 text-xs text-[var(--muted-foreground)]">{post.body}</p>
                {post.taggedPets.length ? (
                  <div className="flex flex-wrap gap-1">
                    {post.taggedPets.map((pet) => (
                      <Badge key={pet.id} tone="neutral">
                        <PawPrint className="h-3 w-3" /> {pet.name}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
