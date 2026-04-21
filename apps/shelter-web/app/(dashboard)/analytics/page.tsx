"use client";

// Per-shelter analytics dashboard — active listings, adoptions this
// month/year, avg time-to-adoption, an application funnel, and a
// sortable per-listing performance table with CSV export. The
// backend gates to editor+; any 403 here shows a friendly blocked
// state so the viewer role still lands somewhere informative.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Clock,
  Download,
  Heart,
  Loader2,
  PawPrint,
  ShieldAlert,
  Sparkles,
  TrendingUp
} from "lucide-react";

import type {
  AnalyticsRange,
  ApplicationFunnel,
  ListingPerformanceRow,
  ListingState
} from "@petto/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  buildAnalyticsExportUrl,
  getAnalyticsFunnel,
  getAnalyticsListings,
  getAnalyticsOverview
} from "@/lib/api";

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
  { value: "all", label: "All time" }
];

type SortKey = keyof Pick<
  ListingPerformanceRow,
  "name" | "listingState" | "views" | "saves" | "applications" | "adoptions" | "daysListed"
>;
type SortDir = "asc" | "desc";

export default function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "applications",
    dir: "desc"
  });

  const overview = useQuery({
    queryKey: ["analytics-overview", range],
    queryFn: () => getAnalyticsOverview(range)
  });
  const listings = useQuery({
    queryKey: ["analytics-listings", range],
    queryFn: () => getAnalyticsListings(range)
  });
  const funnel = useQuery({
    queryKey: ["analytics-funnel", range],
    queryFn: () => getAnalyticsFunnel(range)
  });

  const blocked =
    overview.isError &&
    /403|forbidden|insufficient/i.test(
      (overview.error as Error | null)?.message ?? ""
    );

  if (blocked) {
    return <BlockedState />;
  }

  const sortedRows = useMemo(() => {
    const rows = listings.data ?? [];
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === "number" && typeof bv === "number") {
        return sort.dir === "asc" ? av - bv : bv - av;
      }
      const as = String(av ?? "");
      const bs = String(bv ?? "");
      return sort.dir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return copy;
  }, [listings.data, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
            <BarChart3 className="h-3.5 w-3.5" />
            Shelter analytics
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">How are your listings doing?</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted-foreground)]">
            Views, saves, applications, adoptions — and how long it takes to match an animal to a home.
          </p>
        </div>
        <a href={buildAnalyticsExportUrl(range)} download>
          <Button variant="outline" className="gap-1">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </a>
      </header>

      {/* ── Range tabs ─────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap gap-2">
        {RANGES.map((r) => {
          const active = range === r.value;
          return (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={[
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
                active
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--border)] hover:border-[var(--primary)]"
              ].join(" ")}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {/* ── Stat cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active listings"
          value={overview.data?.activeListings ?? 0}
          loading={overview.isLoading}
          icon={<PawPrint className="h-4 w-4" />}
        />
        <StatCard
          label="Adoptions this month"
          value={overview.data?.adoptionsThisMonth ?? 0}
          loading={overview.isLoading}
          icon={<Heart className="h-4 w-4" />}
        />
        <StatCard
          label="Adoptions this year"
          value={overview.data?.adoptionsThisYear ?? 0}
          loading={overview.isLoading}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Avg days to adoption"
          value={
            overview.data
              ? overview.data.avgDaysToAdoption > 0
                ? overview.data.avgDaysToAdoption.toFixed(1)
                : "—"
              : "—"
          }
          loading={overview.isLoading}
          icon={<Clock className="h-4 w-4" />}
          hint={
            overview.data && overview.data.avgSampleSize > 0
              ? `${overview.data.avgSampleSize} adoption${overview.data.avgSampleSize === 1 ? "" : "s"}`
              : undefined
          }
        />
      </div>

      {/* ── Top listing ────────────────────────────────────── */}
      {overview.data?.topListing && (
        <Card className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[var(--border)] bg-white p-5 shadow-card">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                Top listing ({RANGES.find((r) => r.value === range)?.label.toLowerCase()})
              </div>
              <div className="mt-0.5 text-base font-semibold">
                {overview.data.topListing.name}
              </div>
            </div>
          </div>
          <div className="text-sm text-[var(--muted-foreground)]">
            <strong className="text-[var(--foreground)]">
              {overview.data.topListing.applicationCount}
            </strong>{" "}
            application{overview.data.topListing.applicationCount === 1 ? "" : "s"}
          </div>
        </Card>
      )}

      {/* ── Application funnel ─────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          Application funnel
        </h2>
        <Card className="rounded-2xl border-[var(--border)] bg-white p-6 shadow-card">
          {funnel.isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : (
            <Funnel data={funnel.data ?? { submitted: 0, underReview: 0, approved: 0, adopted: 0 }} />
          )}
        </Card>
      </section>

      {/* ── Per-listing table ──────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          Per-listing performance
        </h2>
        <Card className="overflow-hidden rounded-2xl border-[var(--border)] bg-white shadow-card">
          {listings.isLoading ? (
            <div className="flex items-center justify-center p-10">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : sortedRows.length === 0 ? (
            <div className="p-10 text-center text-sm text-[var(--muted-foreground)]">
              No listings yet. Add a pet to start tracking performance.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-[var(--muted)] text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                  <tr>
                    <SortHeader label="Listing" col="name" sort={sort} onClick={toggleSort} />
                    <SortHeader label="State" col="listingState" sort={sort} onClick={toggleSort} />
                    <SortHeader label="Views" col="views" sort={sort} onClick={toggleSort} align="right" />
                    <SortHeader label="Saves" col="saves" sort={sort} onClick={toggleSort} align="right" />
                    <SortHeader label="Apps" col="applications" sort={sort} onClick={toggleSort} align="right" />
                    <SortHeader label="Adopted" col="adoptions" sort={sort} onClick={toggleSort} align="right" />
                    <SortHeader label="Days listed" col="daysListed" sort={sort} onClick={toggleSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr
                      key={row.listingId}
                      className="border-t border-[var(--border)] hover:bg-[var(--muted)]/50"
                    >
                      <td className="p-3">
                        <div className="font-medium">{row.name || "(unnamed)"}</div>
                        <div className="text-[11px] text-[var(--muted-foreground)]">
                          {row.species || "—"}
                        </div>
                      </td>
                      <td className="p-3">
                        <StatePill state={row.listingState} />
                      </td>
                      <td className="p-3 text-right tabular-nums">{row.views}</td>
                      <td className="p-3 text-right tabular-nums">{row.saves}</td>
                      <td className="p-3 text-right tabular-nums">{row.applications}</td>
                      <td className="p-3 text-right tabular-nums">{row.adoptions}</td>
                      <td className="p-3 text-right tabular-nums">{row.daysListed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  loading,
  icon,
  hint
}: {
  label: string;
  value: number | string;
  loading: boolean;
  icon: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card className="flex flex-col gap-1 rounded-2xl border-[var(--border)] bg-white p-5 shadow-card">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
        <span className="text-[var(--primary)]">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" /> : value}
      </div>
      {hint && <div className="text-[11px] text-[var(--muted-foreground)]">{hint}</div>}
    </Card>
  );
}

// ── Funnel ────────────────────────────────────────────────────────

function Funnel({ data }: { data: ApplicationFunnel }) {
  const stages: { label: string; value: number }[] = [
    { label: "Submitted", value: data.submitted },
    { label: "Under review", value: data.underReview },
    { label: "Approved", value: data.approved },
    { label: "Adopted", value: data.adopted }
  ];
  const max = Math.max(1, data.submitted);

  if (data.submitted === 0) {
    return (
      <div className="py-4 text-center text-sm text-[var(--muted-foreground)]">
        No applications in the selected range yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stages.map((s, i) => {
        const pct = Math.round((s.value / max) * 100);
        const dropOff =
          i > 0 && stages[i - 1]!.value > 0
            ? Math.round(100 - (s.value / stages[i - 1]!.value) * 100)
            : null;
        return (
          <div key={s.label}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium">{s.label}</span>
              <span className="text-[var(--muted-foreground)]">
                <strong className="text-[var(--foreground)]">{s.value}</strong>
                {dropOff != null && dropOff > 0 && (
                  <span className="ml-2 text-[10px] text-rose-600">
                    −{dropOff}% drop
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-6 w-full overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-orange-400 transition-all"
                style={{ width: `${Math.max(4, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Sortable header ──────────────────────────────────────────────

function SortHeader({
  label,
  col,
  sort,
  onClick,
  align = "left"
}: {
  label: string;
  col: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onClick: (col: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === col;
  const arrow = active ? (sort.dir === "asc" ? "↑" : "↓") : "";
  return (
    <th className={`p-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onClick(col)}
        className={[
          "inline-flex items-center gap-1 transition-colors",
          active ? "text-[var(--foreground)]" : "hover:text-[var(--foreground)]"
        ].join(" ")}
      >
        {label}
        <span className="text-[10px] opacity-70">{arrow}</span>
      </button>
    </th>
  );
}

// ── State pill (mirrors the colour system used on /pets) ────────

function StatePill({ state }: { state: ListingState | string }) {
  const palette: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700",
    pending_review: "bg-amber-100 text-amber-800",
    published: "bg-emerald-100 text-emerald-800",
    paused: "bg-sky-100 text-sky-800",
    adopted: "bg-teal-100 text-teal-800",
    archived: "bg-zinc-100 text-zinc-700",
    rejected: "bg-rose-100 text-rose-800"
  };
  const cls = palette[state] ?? palette.draft;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {state.replace(/_/g, " ")}
    </span>
  );
}

// ── Blocked state for viewer role (backend 403) ─────────────────

function BlockedState() {
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <ShieldAlert className="mx-auto h-10 w-10 text-amber-600" />
      <h1 className="mt-3 text-xl font-semibold">Analytics is editor-only</h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Ask a team admin to bump your role to <strong>Editor</strong> or higher to
        see the dashboard.
      </p>
    </div>
  );
}
