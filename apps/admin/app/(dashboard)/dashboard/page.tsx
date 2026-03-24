"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDashboard } from "@/lib/admin-api";

const GrowthChart = dynamic(
  () => import("@/components/growth-chart").then((module) => module.GrowthChart),
  { ssr: false }
);

export default function DashboardPage() {
  const { data } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: getDashboard
  });

  return (
    <div className="space-y-5">
      <Card className="bg-[linear-gradient(135deg,rgba(255,252,248,0.95),rgba(247,201,188,0.75))]">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--petto-primary)]">Weekly view</p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-5xl text-[var(--petto-ink)]">A curated dashboard for a fast-growing pet network.</h1>
            <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--petto-muted)]">
              Balance growth, moderation, taxonomy hygiene, and engagement from one carefully tuned control surface.
            </p>
          </div>
          <Badge tone="success">System stable</Badge>
        </div>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data?.metrics.map((metric) => (
          <Card key={metric.id}>
            <p className="text-sm uppercase tracking-[0.25em] text-[var(--petto-muted)]">{metric.label}</p>
            <p className="mt-3 text-4xl font-semibold text-[var(--petto-ink)]">{metric.value}</p>
            <p className="mt-2 text-sm font-semibold text-[var(--petto-secondary)]">{metric.delta} vs last week</p>
          </Card>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <Card>
          <div className="mb-6 space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">Growth</p>
            <h2 className="text-3xl text-[var(--petto-ink)]">Users and matches across the week</h2>
          </div>
          <GrowthChart data={data?.growth ?? []} />
        </Card>
        <Card>
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">Recent reports</p>
            <h2 className="text-3xl text-[var(--petto-ink)]">What needs human attention</h2>
          </div>
          <div className="mt-6 space-y-4">
            {data?.recentReports.map((report) => (
              <div key={report.id} className="rounded-3xl border border-[var(--petto-border)] bg-white/70 p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-semibold text-[var(--petto-ink)]">{report.reason}</p>
                  <Badge tone={report.status === "open" ? "warning" : "neutral"}>{report.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-[var(--petto-muted)]">
                  {report.targetType} • {report.targetLabel} • by {report.reporterName}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">Top posts</p>
          <h2 className="text-3xl text-[var(--petto-ink)]">Most liked community posts right now</h2>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {data?.topPosts.map((post) => (
            <div key={post.id} className="rounded-[24px] border border-[var(--petto-border)] bg-white/75 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-[var(--petto-ink)]">
                    {post.author.firstName} {post.author.lastName}
                  </p>
                  <p className="text-sm text-[var(--petto-muted)]">{post.author.cityLabel}</p>
                </div>
                <Badge tone="success">{post.likeCount} likes</Badge>
              </div>
              <p className="mt-4 text-sm leading-7 text-[var(--petto-muted)]">{post.body}</p>
              {post.taggedPets.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {post.taggedPets.map((pet) => (
                    <span
                      key={pet.id}
                      className="rounded-full bg-[var(--petto-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--petto-secondary)]"
                    >
                      {pet.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
