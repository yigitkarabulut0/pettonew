"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  ShieldCheck
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StateBadge } from "@/components/listings-moderation/StateBadge";
import {
  AUTO_FLAG_LABELS,
  listAdminListings,
  type ListingQueueTab
} from "@/lib/api/listings-moderation";

const TABS: { key: ListingQueueTab; label: string }[] = [
  { key: "pending_review", label: "Pending review" },
  { key: "published", label: "Published" },
  { key: "paused", label: "Paused" },
  { key: "adopted", label: "Adopted" },
  { key: "archived", label: "Archived" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" }
];

function relativeTime(iso: string): string {
  if (!iso) return "";
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

function slaCountdown(iso: string): { label: string; tone: "calm" | "warn" | "danger" } | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const deadline = then + 24 * 60 * 60 * 1000;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return { label: "SLA breached", tone: "danger" };
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const tone = remaining < 4 * 3_600_000 ? "warn" : "calm";
  return { label: `${hours}h ${minutes}m left`, tone };
}

export default function ListingsModerationPage() {
  const [tab, setTab] = useState<ListingQueueTab>("pending_review");

  const { data, isLoading } = useQuery({
    queryKey: ["listings-queue", tab],
    queryFn: () => listAdminListings(tab),
    staleTime: 30_000
  });
  const items = data?.data ?? [];
  const total = data?.total ?? 0;

  const visible = useMemo(() => items, [items]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-orange-600">
            <ShieldCheck className="h-3.5 w-3.5" />
            Listing moderation
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Adoption listings</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            DSA Art. 16 notice-and-action queue for shelter listings. Auto-flagged submissions land
            here for human review with a 24-hour SLA. Published listings never reach this tab.
          </p>
        </div>
        <div className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
          {total} total
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ListingQueueTab)}>
        <TabsList className="flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
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
            {visible.map((pet) => {
              const sla = tab === "pending_review" ? slaCountdown(pet.createdAt) : null;
              const thumb = pet.photos?.[0];
              return (
                <li key={pet.id}>
                  <Link href={`/listings/${pet.id}`} className="block group">
                    <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-md">
                      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border bg-muted">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                            No photo
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold truncate">{pet.name || "(unnamed)"}</span>
                          <StateBadge state={pet.listingState} />
                          {pet.autoFlagReasons?.map((r) => (
                            <span
                              key={r}
                              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {AUTO_FLAG_LABELS[r] ?? r}
                            </span>
                          ))}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {pet.shelterName && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {pet.shelterName}
                              {pet.shelterCity ? ` · ${pet.shelterCity}` : ""}
                            </span>
                          )}
                          <span>
                            {pet.species || "—"}
                            {pet.breed ? ` / ${pet.breed}` : ""}
                          </span>
                          {pet.ageMonths != null && <span>{pet.ageMonths}mo</span>}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {relativeTime(pet.createdAt)}
                          </span>
                        </div>
                      </div>
                      {sla && (
                        <div
                          className={
                            sla.tone === "danger"
                              ? "rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
                              : sla.tone === "warn"
                                ? "rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                                : "rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                          }
                        >
                          {sla.label}
                        </div>
                      )}
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: ListingQueueTab }) {
  const copy: Record<ListingQueueTab, string> = {
    pending_review: "No listings awaiting review. Auto-flag rules will drop flagged submissions here.",
    published: "No published listings.",
    paused: "No paused listings.",
    adopted: "No adopted listings on record.",
    archived: "No archived listings.",
    rejected: "No rejected listings.",
    all: "No listings to show."
  };
  return (
    <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      <ShieldCheck className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{copy[tab]}</p>
    </Card>
  );
}
