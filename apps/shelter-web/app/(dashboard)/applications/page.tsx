"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight, Inbox, PawPrint } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listShelterApplications } from "@/lib/api";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "chat_open", label: "In chat" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "adopted", label: "Adopted" }
] as const;

export default function ApplicationsPage() {
  const [status, setStatus] = useState<(typeof FILTERS)[number]["value"]>("pending");
  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["shelter-applications", status],
    queryFn: () => listShelterApplications(status === "all" ? undefined : status)
  });

  return (
    <div className="space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Review requests to adopt the pets you&apos;ve listed.
        </p>
      </header>

      <div className="flex gap-1 rounded-full bg-[var(--muted)] p-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              status === f.value
                ? "bg-white text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-[var(--muted-foreground)]">Loading…</div>
      ) : apps.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <Inbox className="size-6 text-[var(--muted-foreground)]" />
          <p className="text-sm text-[var(--muted-foreground)]">
            No applications in this view yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {apps.map((app) => (
            <Link key={app.id} href={`/applications/${app.id}`}>
              <Card className="flex items-center gap-3 p-3 transition-colors hover:bg-[var(--muted)]">
                {app.petPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={app.petPhoto}
                    alt={app.petName ?? ""}
                    className="size-14 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex size-14 items-center justify-center rounded-lg bg-[var(--muted)]">
                    <PawPrint className="size-5 text-[var(--muted-foreground)]" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{app.petName ?? "—"}</span>
                    <Badge tone={appTone(app.status)}>{labelFor(app.status)}</Badge>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                    {app.userName} —{" "}
                    {app.housingType ? `${app.housingType} · ` : ""}
                    {formatDistanceToNow(new Date(app.createdAt), { addSuffix: true })}
                  </div>
                </div>
                <ChevronRight className="size-4 text-[var(--muted-foreground)]" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function appTone(
  status: string
): "neutral" | "success" | "warning" | "danger" | "info" {
  switch (status) {
    case "pending":
      return "warning";
    case "approved":
    case "chat_open":
      return "info";
    case "adopted":
      return "success";
    case "rejected":
    case "withdrawn":
      return "danger";
    default:
      return "neutral";
  }
}

function labelFor(status: string) {
  return {
    pending: "Pending",
    approved: "Approved",
    chat_open: "In chat",
    adopted: "Adopted",
    rejected: "Rejected",
    withdrawn: "Withdrawn"
  }[status] ?? status;
}
