"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  ShieldCheck,
  X
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StateBadge } from "@/components/listings-moderation/StateBadge";
import { RejectListingDialog } from "@/components/listings-moderation/RejectListingDialog";
import {
  AUTO_FLAG_LABELS,
  approveAdminListing,
  getAdminListingDetail,
  rejectAdminListing
} from "@/lib/api/listings-moderation";

export default function ListingDetailPage() {
  const params = useParams<{ listingId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["listing-detail", params.listingId],
    queryFn: () => getAdminListingDetail(params.listingId),
    enabled: !!params.listingId
  });

  const approve = useMutation({
    mutationFn: () => approveAdminListing(params.listingId),
    onSuccess: () => {
      toast.success("Listing approved — now live.");
      qc.invalidateQueries({ queryKey: ["listing-detail", params.listingId] });
      qc.invalidateQueries({ queryKey: ["listings-queue"] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const reject = useMutation({
    mutationFn: (vars: { code: Parameters<typeof rejectAdminListing>[1]; note: string; internal: string }) =>
      rejectAdminListing(params.listingId, vars.code, vars.note, vars.internal),
    onSuccess: () => {
      toast.success("Listing rejected. Statement of reasons recorded.");
      setRejectOpen(false);
      qc.invalidateQueries({ queryKey: ["listing-detail", params.listingId] });
      qc.invalidateQueries({ queryKey: ["listings-queue"] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Listing not found.</div>
    );
  }

  const pet = data.listing;
  const canDecide = pet.listingState === "pending_review";

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <button
        onClick={() => router.back()}
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to queue
      </button>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-orange-600">
            <ShieldCheck className="h-3.5 w-3.5" />
            Listing review
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{pet.name || "(unnamed)"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StateBadge state={pet.listingState} />
            <span>{pet.species || "—"}{pet.breed ? ` / ${pet.breed}` : ""}</span>
            {pet.ageMonths != null && <span>· {pet.ageMonths} months</span>}
            {pet.shelterName && (
              <Link
                href={`/shelters/${pet.shelterId}`}
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                · {pet.shelterName}
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
        {/* ── Main column ──────────────────────────────────────── */}
        <div className="space-y-6">
          {pet.autoFlagReasons && pet.autoFlagReasons.length > 0 && (
            <Card className="border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700 dark:text-amber-300" />
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                    Auto-flag triggers
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pet.autoFlagReasons.map((r) => (
                      <Badge key={r} tone="warning">
                        {AUTO_FLAG_LABELS[r] ?? r}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {pet.listingState === "rejected" && pet.lastRejectionCode && (
            <Card className="border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
              <div className="text-sm font-semibold text-rose-900 dark:text-rose-100">
                Rejection reason: {pet.lastRejectionCode}
              </div>
              {pet.lastRejectionNote && (
                <div className="mt-1 text-sm text-rose-900/90 dark:text-rose-100/90">
                  {pet.lastRejectionNote}
                </div>
              )}
            </Card>
          )}

          <Card className="overflow-hidden">
            {pet.photos && pet.photos.length > 0 && (
              <div className="grid grid-cols-3 gap-px bg-border">
                {pet.photos.slice(0, 6).map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={url} alt="" className="aspect-square w-full object-cover" />
                ))}
              </div>
            )}
            <div className="space-y-3 p-5">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <Field label="Sex" value={pet.sex} />
                <Field label="Size" value={pet.size} />
                <Field label="Color" value={pet.color} />
                <Field label="Neutered" value={pet.isNeutered ? "Yes" : "No"} />
                <Field label="Microchip" value={pet.microchipId || "—"} />
                <Field label="Intake" value={pet.intakeDate || "—"} />
              </div>
              {pet.description && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Description
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{pet.description}</p>
                </div>
              )}
              {pet.specialNeeds && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Special needs
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{pet.specialNeeds}</p>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 text-sm font-semibold">State timeline</div>
            {data.transitions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No transitions recorded yet.</p>
            ) : (
              <ol className="space-y-3">
                {data.transitions.map((t) => (
                  <li key={t.id} className="flex gap-3 text-sm">
                    <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-orange-500" />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <StateBadge state={t.prevState || "draft"} className="text-[10px]" />
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        <StateBadge state={t.newState} className="text-[10px]" />
                        <span className="ml-1 text-muted-foreground">by {t.actorRole}{t.actorName ? ` · ${t.actorName}` : ""}</span>
                      </div>
                      {t.reasonCode && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          reason: <span className="font-mono">{t.reasonCode}</span>
                        </div>
                      )}
                      {t.note && <div className="mt-0.5 text-sm">{t.note}</div>}
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{t.createdAt}</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {data.statementsOfReasons.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4" />
                Statements of reasons (DSA Art. 17)
              </div>
              <div className="space-y-4">
                {data.statementsOfReasons.map((sor) => (
                  <div key={sor.id} className="rounded-lg border bg-muted/20 p-4 text-sm">
                    <div className="text-xs text-muted-foreground">{sor.issuedAt}</div>
                    <div className="mt-2 grid gap-2">
                      <SorRow label="Content description" value={sor.contentDescription} />
                      <SorRow label="Legal ground" value={sor.legalGround} />
                      <SorRow label="Facts relied on" value={sor.factsReliedOn} />
                      <SorRow label="Scope" value={sor.scope} />
                      <SorRow label="Redress options" value={sor.redressOptions} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ── Action rail ─────────────────────────────────────── */}
        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <Card className="p-5">
            <div className="mb-3 text-sm font-semibold">Moderation actions</div>
            {!canDecide ? (
              <p className="text-xs text-muted-foreground">
                This listing is <strong>{pet.listingState}</strong>. Approve/Reject is only available from the
                pending_review queue.
              </p>
            ) : (
              <div className="space-y-2">
                <Button
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => approve.mutate()}
                  disabled={approve.isPending}
                >
                  {approve.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve & publish
                    </>
                  )}
                </Button>
                <Button variant="destructive" className="w-full" onClick={() => setRejectOpen(true)}>
                  <X className="mr-1.5 h-4 w-4" /> Reject…
                </Button>
              </div>
            )}
          </Card>

          {pet.shelterId && (
            <Card className="p-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Shelter
              </div>
              <Link
                href={`/shelters/${pet.shelterId}`}
                className="flex items-center justify-between text-sm hover:text-orange-700"
              >
                <span>{pet.shelterName || pet.shelterId}</span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Card>
          )}
        </aside>
      </div>

      <RejectListingDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        petName={pet.name}
        pending={reject.isPending}
        onConfirm={async (code, note, internal) => {
          await reject.mutateAsync({ code, note, internal });
        }}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value || "—"}</div>
    </div>
  );
}

function SorRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 whitespace-pre-wrap">{value}</div>
    </div>
  );
}
