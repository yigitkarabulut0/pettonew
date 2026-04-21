"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  MapPin,
  Mail
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import {
  listShelterApplications,
  type AdminShelterApplication,
  type ShelterApplicationStatus
} from "@/lib/admin-api";
import { SlaCountdown } from "@/components/shelter-applications/SlaCountdown";

type TabKey = "submitted" | "approved" | "rejected" | "all";

const STATUS_BADGE: Record<
  ShelterApplicationStatus,
  { tone: "neutral" | "success" | "warning" | "danger"; label: string }
> = {
  submitted: { tone: "warning", label: "Pending review" },
  under_review: { tone: "warning", label: "In review" },
  approved: { tone: "success", label: "Approved" },
  rejected: { tone: "danger", label: "Rejected" }
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function ShelterApplicationsAdminPage() {
  const [tab, setTab] = useState<TabKey>("submitted");
  const statusFilter: ShelterApplicationStatus | undefined =
    tab === "all" ? undefined : (tab as ShelterApplicationStatus);

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["shelter-applications", tab],
    queryFn: () => listShelterApplications(statusFilter),
    staleTime: 30_000
  });

  // Sort submitted tab by SLA urgency (oldest first). Other tabs by most
  // recent decision. The backend already returns submitted oldest-first,
  // but we re-sort client-side to be defensive.
  const visible = useMemo(() => {
    const copy = [...apps];
    if (tab === "submitted") {
      copy.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    } else {
      copy.sort((a, b) =>
        (b.reviewedAt ?? b.submittedAt).localeCompare(
          a.reviewedAt ?? a.submittedAt
        )
      );
    }
    return copy;
  }, [apps, tab]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-orange-600">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Shelter review queue
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Shelter applications
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Public applications from the /apply wizard. Review within 48
            hours of submission; approval mints a shelter account with a
            one-time temporary password.
          </p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="submitted">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-5">
        {isLoading ? (
          <Card className="flex items-center justify-center p-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </Card>
        ) : visible.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <ul className="space-y-3">
            {visible.map((app) => (
              <ApplicationRow key={app.id} app={app} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ApplicationRow({ app }: { app: AdminShelterApplication }) {
  const badge = STATUS_BADGE[app.status];
  return (
    <li>
      <Link
        href={`/shelter-applications/${app.id}`}
        className="group block"
      >
        <Card className="flex items-center gap-4 p-4 transition hover:shadow-md">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{app.orgName}</h3>
              <Badge tone={badge.tone} className="text-[10px]">
                {badge.label}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                {app.country.toUpperCase()} · {app.entityType}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {app.primaryContactEmail}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {app.operatingRegionCity}, {app.operatingRegionCountry}
              </span>
              <span>Submitted {relativeTime(app.submittedAt)}</span>
            </div>
          </div>
          {app.status === "submitted" || app.status === "under_review" ? (
            <SlaCountdown deadline={app.slaDeadline} />
          ) : app.status === "approved" && app.reviewedAt ? (
            <span className="text-[11px] text-emerald-700">
              Approved {relativeTime(app.reviewedAt)}
            </span>
          ) : app.status === "rejected" && app.reviewedAt ? (
            <span className="text-[11px] text-red-700">
              Rejected {relativeTime(app.reviewedAt)}
            </span>
          ) : null}
          <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
        </Card>
      </Link>
    </li>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  const copy =
    tab === "submitted"
      ? "No applications waiting right now. You're all caught up."
      : tab === "approved"
        ? "No approvals yet in this view."
        : tab === "rejected"
          ? "No rejections yet."
          : "No applications to show.";
  return (
    <Card className="flex flex-col items-center gap-3 p-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <ClipboardCheck className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-sm font-semibold">Nothing here</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{copy}</p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href="/shelters">Back to shelters</Link>
      </Button>
    </Card>
  );
}
