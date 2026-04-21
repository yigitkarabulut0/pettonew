"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  Flag,
  Loader2,
  ShieldAlert
} from "lucide-react";
import { toast } from "sonner";

import type { ListingReport, ListingReportResolution } from "@petto/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StateBadge } from "@/components/listings-moderation/StateBadge";
import {
  RESOLUTION_LABELS,
  listAdminListingReports,
  resolveAdminListingReport,
  type ListingReportTab
} from "@/lib/api/listings-moderation";

const TABS: { key: ListingReportTab; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "trusted", label: "Trusted flaggers" },
  { key: "dismissed", label: "Dismissed" },
  { key: "warned", label: "Warned" },
  { key: "removed", label: "Removed" },
  { key: "suspended", label: "Suspended" },
  { key: "all", label: "All" }
];

export default function ListingReportsPage() {
  const [tab, setTab] = useState<ListingReportTab>("open");
  const [active, setActive] = useState<ListingReport | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["listing-reports", tab],
    queryFn: () => listAdminListingReports(tab),
    staleTime: 30_000
  });
  const items = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-orange-600">
            <Flag className="h-3.5 w-3.5" />
            DSA notice-and-action
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Listing reports</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            User-submitted reports on adoption listings. Trusted flaggers (DSA Art. 22) are prioritised.
            Removing a listing generates a statement of reasons automatically.
          </p>
        </div>
        <div className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
          {total} total
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ListingReportTab)}>
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
        ) : items.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            <ShieldAlert className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No reports in this tab.</p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {items.map((r) => (
              <li key={r.id}>
                <button className="block w-full text-left group" onClick={() => setActive(r)}>
                  <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-md">
                    <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border bg-muted">
                      {r.listingPhotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.listingPhotoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                          —
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{r.listingName || "(listing gone)"}</span>
                        {r.trustedFlagger && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200">
                            <AlertTriangle className="h-3 w-3" />
                            Trusted flagger
                          </span>
                        )}
                        {r.listingCurrentState && <StateBadge state={r.listingCurrentState || "draft"} />}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>by {r.reporterName || r.reporterId || "anonymous"}</span>
                        {r.shelterName && <span>· {r.shelterName}</span>}
                        <span>· {r.reason || "(no reason)"}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Card>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active && <ResolveDialog report={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function ResolveDialog({ report, onClose }: { report: ListingReport; onClose: () => void }) {
  const qc = useQueryClient();
  const [resolution, setResolution] = useState<ListingReportResolution | null>(null);
  const [note, setNote] = useState("");

  const resolve = useMutation({
    mutationFn: () => {
      if (!resolution) throw new Error("Pick an action first.");
      return resolveAdminListingReport(report.id, resolution, note.trim());
    },
    onSuccess: () => {
      toast.success("Report resolved.");
      qc.invalidateQueries({ queryKey: ["listing-reports"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const ACTIONS: {
    value: ListingReportResolution;
    tone: "ghost" | "warn" | "danger";
    icon: React.ReactNode;
    hint: string;
  }[] = [
    { value: "dismiss", tone: "ghost", icon: <CheckCircle2 className="h-4 w-4" />, hint: "Close without action." },
    { value: "warn", tone: "warn", icon: <AlertTriangle className="h-4 w-4" />, hint: "Notify the shelter; listing stays live." },
    { value: "remove", tone: "danger", icon: <Ban className="h-4 w-4" />, hint: "Remove listing + generate DSA statement of reasons." },
    { value: "suspend", tone: "danger", icon: <ShieldAlert className="h-4 w-4" />, hint: "Remove listing AND suspend the shelter." }
  ];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Resolve report</DialogTitle>
          <DialogDescription>
            {report.listingName ? (
              <>
                Listing:{" "}
                <Link href={`/listings/${report.listingId}`} className="underline hover:text-foreground">
                  {report.listingName}
                </Link>
                {report.shelterName ? ` · ${report.shelterName}` : ""}
              </>
            ) : (
              "Listing details"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reason
            </div>
            <div className="mt-1">{report.reason || "(no reason provided)"}</div>
            {report.description && (
              <>
                <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Description
                </div>
                <div className="mt-1 whitespace-pre-wrap">{report.description}</div>
              </>
            )}
            <div className="mt-2 text-[11px] text-muted-foreground">
              Reported by {report.reporterName || report.reporterId || "anonymous"}
              {report.trustedFlagger && " · trusted flagger"}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ACTIONS.map((a) => (
              <button
                key={a.value}
                onClick={() => setResolution(a.value)}
                className={[
                  "flex items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors",
                  resolution === a.value
                    ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30"
                    : "hover:border-orange-300 hover:bg-muted/40"
                ].join(" ")}
              >
                <span className="mt-0.5">{a.icon}</span>
                <span>
                  <span className="block font-medium">{RESOLUTION_LABELS[a.value]}</span>
                  <span className="block text-[11px] text-muted-foreground">{a.hint}</span>
                </span>
              </button>
            ))}
          </div>

          <div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Optional note (≤500). For `warn` this goes to the shelter; for other actions it's stored with the resolution."
            />
            <div className="mt-1 text-right text-[11px] text-muted-foreground">{note.length} / 500</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={resolve.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => resolve.mutate()}
            disabled={!resolution || resolve.isPending || note.length > 500}
            className={
              resolution === "remove" || resolution === "suspend"
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : undefined
            }
          >
            {resolve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
