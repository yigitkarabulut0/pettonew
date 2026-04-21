"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  Clock,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Users
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getAdminShelter,
  listShelterAuditLog,
  listShelterMembers,
  setAdminShelterFeatured,
  transferShelterAdmin,
  type AdminShelterAuditEntry,
  type AdminShelterMember
} from "@/lib/admin-api";
import { getShelterStrikes, suspendShelter } from "@/lib/api/listings-moderation";
import { StateBadge } from "@/components/listings-moderation/StateBadge";

// Platform-admin detail view for a single shelter. Read-only for the
// profile block; the Team tab adds a "Transfer admin" escape hatch that
// exists purely for spec-mandated recovery (shelter locked with no
// active admin).

export default function AdminShelterDetailPage({
  params
}: {
  params: Promise<{ shelterID: string }>;
}) {
  const { shelterID } = use(params);
  const qc = useQueryClient();

  const { data: shelterData, isLoading } = useQuery({
    queryKey: ["admin-shelter", shelterID],
    queryFn: () => getAdminShelter(shelterID)
  });

  const { data: team } = useQuery({
    queryKey: ["admin-shelter", shelterID, "members"],
    queryFn: () => listShelterMembers(shelterID)
  });

  const { data: audit = [] } = useQuery({
    queryKey: ["admin-shelter", shelterID, "audit"],
    queryFn: () => listShelterAuditLog(shelterID, 200, 0),
    staleTime: 60_000
  });

  const transferMut = useMutation({
    mutationFn: (memberId: string) =>
      transferShelterAdmin(shelterID, memberId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-shelter", shelterID, "members"] });
      qc.invalidateQueries({ queryKey: ["admin-shelter", shelterID, "audit"] });
      toast.success("Admin transferred");
    },
    onError: (err: Error) => toast.error(err.message || "Could not transfer")
  });

  // v0.24 — Feature toggle for the fetcht discovery home's curated
  // rail. Optimistic update; rollback if the backend rejects.
  const featureMut = useMutation({
    mutationFn: (featured: boolean) =>
      setAdminShelterFeatured(shelterID, featured),
    onSuccess: (_res, featured) => {
      qc.invalidateQueries({ queryKey: ["admin-shelter", shelterID] });
      toast.success(
        featured
          ? "Added to the featured-shelters rail."
          : "Removed from the featured-shelters rail."
      );
    },
    onError: (err: Error) =>
      toast.error(err.message || "Could not update featured flag")
  });

  // DSA Art. 23 repeat-offender panel: rejections in last 90 days.
  const { data: strikes } = useQuery({
    queryKey: ["admin-shelter", shelterID, "strikes"],
    queryFn: () => getShelterStrikes(shelterID),
    staleTime: 60_000
  });

  const suspendMut = useMutation({
    mutationFn: (reason: string) => suspendShelter(shelterID, reason),
    onSuccess: () => {
      toast.success("Shelter suspended.");
      qc.invalidateQueries({ queryKey: ["admin-shelter", shelterID] });
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const shelter = shelterData?.shelter;
  const stats = shelterData?.stats;

  const [tab, setTab] = useState<"overview" | "team" | "audit">("overview");

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="mb-4 text-muted-foreground"
      >
        <Link href="/shelters">
          <ArrowLeft className="h-4 w-4" />
          Back to shelters
        </Link>
      </Button>

      {isLoading || !shelter ? (
        <Card className="flex items-center justify-center p-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </Card>
      ) : (
        <>
          <Card className="p-6 mb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="grid size-12 place-items-center rounded-xl bg-orange-50 text-orange-600">
                  <Building2 className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-xl font-semibold">
                      {shelter.name}
                    </h1>
                    {shelter.verifiedAt && (
                      <BadgeCheck className="size-4 text-[var(--primary)]" />
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    {shelter.email}{" "}
                    {shelter.cityLabel && (
                      <>
                        · <MapPin className="inline size-3" /> {shelter.cityLabel}
                      </>
                    )}{" "}
                    {shelter.phone && (
                      <>
                        · <Phone className="inline size-3" /> {shelter.phone}
                      </>
                    )}
                  </p>
                </div>
              </div>
              {stats && (
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <Badge tone="neutral">{stats.totalPets} pets</Badge>
                  <Badge tone="neutral">{stats.pendingApplications} pending apps</Badge>
                  <Badge tone="neutral">{stats.activeChats} chats</Badge>
                </div>
              )}
            </div>

            {/* v0.24 — Featured on discovery home toggle */}
            {shelter.verifiedAt ? (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-3">
                <div>
                  <div className="text-sm font-semibold">
                    {shelter.isFeatured ? "Featured on discovery home" : "Feature on discovery home"}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Adds this shelter to the fetcht app's curated rail. Up to 10 shelters show at once.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={shelter.isFeatured ? "outline" : "primary"}
                  onClick={() => featureMut.mutate(!shelter.isFeatured)}
                  disabled={featureMut.isPending}
                >
                  {featureMut.isPending
                    ? "…"
                    : shelter.isFeatured
                      ? "Remove from rail"
                      : "Add to rail"}
                </Button>
              </div>
            ) : null}
          </Card>

          {strikes && (
            <Card
              className={
                strikes.triggered
                  ? "mb-4 border-rose-300 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30"
                  : "mb-4 p-4"
              }
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className={strikes.triggered ? "mt-0.5 text-rose-700 dark:text-rose-300" : "mt-0.5 text-muted-foreground"}>
                  {strikes.triggered ? <ShieldAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">
                    {strikes.triggered
                      ? `Repeat offender — ${strikes.count} rejections in last 90 days`
                      : `Rejections (last 90 days): ${strikes.count}`}
                  </div>
                  {strikes.triggered ? (
                    <p className="mt-0.5 text-xs text-rose-900/90 dark:text-rose-100/90">
                      DSA Art. 23 threshold reached ({strikes.threshold}+ rejections in {strikes.windowDays} days). Consider suspending this shelter.
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      DSA Art. 23 monitoring: flag at {strikes.threshold}+ rejections in {strikes.windowDays} days.
                    </p>
                  )}
                  {strikes.rejections.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {strikes.rejections.slice(0, 5).map((t) => (
                        <li key={t.id} className="flex flex-wrap items-center gap-2 text-xs">
                          <StateBadge state={t.newState} className="text-[10px]" />
                          <span className="font-mono text-muted-foreground">{t.reasonCode || "—"}</span>
                          {t.note && <span className="truncate">{t.note}</span>}
                          <span className="text-[10px] text-muted-foreground">{t.createdAt}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {strikes.triggered && shelter?.status !== "suspended" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      const reason = window.prompt("Reason for suspension (optional, shown only internally):") ?? "";
                      suspendMut.mutate(reason);
                    }}
                    disabled={suspendMut.isPending}
                  >
                    {suspendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                      <><AlertTriangle className="mr-1 h-4 w-4" /> Suspend shelter</>
                    )}
                  </Button>
                )}
              </div>
            </Card>
          )}

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="overview">
                <Mail className="size-3" /> Overview
              </TabsTrigger>
              <TabsTrigger value="team">
                <Users className="size-3" /> Team
              </TabsTrigger>
              <TabsTrigger value="audit">
                <ScrollText className="size-3" /> Audit log
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-5">
              <Card className="p-6">
                <h2 className="text-sm font-semibold">Shelter info</h2>
                <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                  <Field label="About">{shelter.about || "—"}</Field>
                  <Field label="Website">{shelter.website || "—"}</Field>
                  <Field label="Address">{shelter.address || "—"}</Field>
                  <Field label="Hours">{shelter.hours || "—"}</Field>
                  <Field label="Operating country">
                    {shelter.operatingCountry || "—"}
                  </Field>
                  <Field label="Created">
                    {new Date(shelter.createdAt).toLocaleString()}
                  </Field>
                </dl>
              </Card>
            </TabsContent>

            <TabsContent value="team" className="mt-5">
              <TeamPanel
                team={team}
                onTransferAdmin={(memberId) => transferMut.mutate(memberId)}
                pending={transferMut.isPending}
              />
            </TabsContent>

            <TabsContent value="audit" className="mt-5">
              <AuditPanel entries={audit} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

function TeamPanel({
  team,
  onTransferAdmin,
  pending
}: {
  team?: { members: AdminShelterMember[]; pendingInvites: unknown[] };
  onTransferAdmin: (memberId: string) => void;
  pending: boolean;
}) {
  if (!team) {
    return (
      <Card className="flex items-center justify-center p-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }
  const active = team.members.filter((m) => m.status === "active");
  const activeAdmins = active.filter((m) => m.role === "admin").length;
  return (
    <Card className="p-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Team members</h2>
        <span className="text-[11px] text-muted-foreground">
          {active.length} active · {team.pendingInvites.length} pending ·{" "}
          {activeAdmins} admin{activeAdmins === 1 ? "" : "s"}
        </span>
      </div>
      {activeAdmins === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Shelter is locked</strong> — no active admin. Promote an
          existing member below to restore write access for the team.
        </div>
      )}
      <ul className="divide-y divide-[var(--border)]">
        {active.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2.5">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold">
              {initials(m.name, m.email)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold">
                  {m.name?.trim() || m.email}
                </span>
                <Badge
                  tone={
                    m.role === "admin"
                      ? "danger"
                      : m.role === "editor"
                        ? "info"
                        : "neutral"
                  }
                >
                  {m.role}
                </Badge>
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                {m.email}
                {m.lastLoginAt && (
                  <>
                    {" · "}last signed in{" "}
                    {new Date(m.lastLoginAt).toLocaleDateString()}
                  </>
                )}
              </p>
            </div>
            {m.role !== "admin" && activeAdmins === 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => onTransferAdmin(m.id)}
              >
                <ShieldCheck className="size-3" />
                Promote to admin
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AuditPanel({ entries }: { entries: AdminShelterAuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        <ScrollText className="mx-auto mb-2 size-5" />
        No activity recorded yet.
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-[var(--border)]">
        {entries.map((e) => (
          <li key={e.id} className="flex items-start gap-3 px-5 py-3">
            <span
              className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground"
              title={new Date(e.createdAt).toLocaleString()}
            >
              <Clock className="inline mr-1 size-3" />
              {new Date(e.createdAt).toLocaleString()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <strong>{e.actorName?.trim() || e.actorEmail || "—"}</strong>{" "}
                <span className="text-muted-foreground">
                  {e.action.replace(/[._]/g, " ")}
                </span>
                {e.targetType && (
                  <span className="text-muted-foreground">
                    {" · "}
                    {e.targetType}
                    {e.targetId && `:${e.targetId.slice(0, 8)}`}
                  </span>
                )}
              </p>
              {e.metadata && Object.keys(e.metadata).length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-[var(--primary)]">
                    metadata
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
                    {JSON.stringify(e.metadata, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function initials(name: string | undefined, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}
