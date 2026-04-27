"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  Copy,
  Globe,
  Hash,
  Lock,
  MapPin,
  PawPrint,
  ShieldCheck,
  Users
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { PlaydateChatPane } from "@/components/playdate/PlaydateChatPane";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type AdminPlaydateDetail, getAdminPlaydateDetail } from "@/lib/admin-api";
import { fmtDateTime, fmtInitials, fmtRelative } from "@/lib/format";

export default function PlaydateDetailPage() {
  const params = useParams<{ id: string }>();
  const playdateId = params?.id;

  const query = useQuery<AdminPlaydateDetail>({
    queryKey: ["admin-playdate-detail", playdateId],
    queryFn: () => getAdminPlaydateDetail(playdateId as string),
    enabled: !!playdateId,
    refetchOnWindowFocus: true
  });

  const playdate = query.data;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={playdate?.title ?? "Playdate"}
        description={playdate?.description}
        breadcrumbs={
          <Link
            href="/playdates"
            className="inline-flex w-fit items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-3 w-3" /> All playdates
          </Link>
        }
        actions={
          playdate ? (
            <div className="flex items-center gap-1.5">
              <StatusBadge status={playdate.status} />
              <Badge tone={playdate.visibility === "private" ? "warning" : "neutral"}>
                {playdate.visibility === "private" ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  <Globe className="h-3 w-3" />
                )}
                {playdate.visibility}
              </Badge>
            </div>
          ) : null
        }
      />

      {query.isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--muted-foreground)]">
            Loading…
          </CardContent>
        </Card>
      ) : query.isError || !playdate ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--destructive)]">
            {query.error instanceof Error ? query.error.message : "Playdate not found."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(380px,1fr)]">
          <div className="flex flex-col gap-4">
            <CoverCard playdate={playdate} />
            <MetadataCard playdate={playdate} />
            <AttendeesCard playdate={playdate} />
            {playdate.rules && playdate.rules.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Rules</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-1.5 text-sm text-[var(--foreground)]">
                    {playdate.rules.map((rule, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="xl:sticky xl:top-4 xl:self-start">
            {playdate.conversationId ? (
              <div className="h-[calc(100vh-7rem)] min-h-[480px]">
                <PlaydateChatPane
                  conversationId={playdate.conversationId}
                  organizerId={playdate.organizerId}
                  hostName={playdate.hostInfo?.firstName}
                  mode="playdate"
                  className="h-full"
                />
              </div>
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-sm text-[var(--muted-foreground)]">
                  This playdate has no conversation thread.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "cancelled" ? "danger" : status === "active" ? "success" : "neutral";
  return <Badge tone={tone}>{status || "unknown"}</Badge>;
}

function CoverCard({ playdate }: { playdate: AdminPlaydateDetail }) {
  const cover = playdate.coverImageUrl;
  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[16/7] w-full">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={playdate.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, #E6694A 0%, #21433C 100%)" }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 flex flex-wrap items-end justify-between gap-2 text-white">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold drop-shadow">{playdate.title}</h2>
            {playdate.cityLabel ? (
              <p className="truncate text-xs opacity-90">
                <MapPin className="mr-1 inline h-3 w-3" />
                {playdate.cityLabel}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {playdate.description ? (
        <CardContent className="pt-4">
          <p className="whitespace-pre-wrap text-sm text-[var(--foreground)]">
            {playdate.description}
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function MetadataCard({ playdate }: { playdate: AdminPlaydateDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Field icon={Calendar} label="When">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {fmtDateTime(playdate.date)}
          </span>
          <span className="text-[11px] text-[var(--muted-foreground)]">
            {fmtRelative(playdate.date)}
          </span>
        </Field>
        <Field icon={MapPin} label="Where">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {playdate.location || "—"}
          </span>
          {playdate.cityLabel ? (
            <span className="text-[11px] text-[var(--muted-foreground)]">{playdate.cityLabel}</span>
          ) : null}
          {playdate.latitude && playdate.longitude ? (
            <a
              href={`https://maps.google.com/?q=${playdate.latitude},${playdate.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[var(--primary)] hover:underline"
            >
              Open in Maps
            </a>
          ) : null}
        </Field>
        <Field icon={Users} label="Slots">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {(playdate.slotsUsed ?? playdate.attendees?.length ?? 0)} / {playdate.maxPets} pets
          </span>
          {playdate.waitlist && playdate.waitlist.length > 0 ? (
            <span className="text-[11px] text-[var(--muted-foreground)]">
              {playdate.waitlist.length} on waitlist
            </span>
          ) : null}
        </Field>
        <Field icon={Hash} label="Join code">
          <CopyPill value={playdate.joinCode || "—"} />
          {playdate.shareToken ? (
            <span className="break-all text-[10px] text-[var(--muted-foreground)]">
              token · {playdate.shareToken.slice(0, 12)}…
            </span>
          ) : null}
        </Field>
        {playdate.hostInfo ? (
          <div className="sm:col-span-2">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Host
            </span>
            <Link
              href={`/users/${playdate.organizerId}`}
              className="mt-1 flex items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2 transition-colors hover:bg-[var(--muted)]"
            >
              <Avatar className="h-8 w-8">
                {playdate.hostInfo.avatarUrl ? (
                  <AvatarImage src={playdate.hostInfo.avatarUrl} alt={playdate.hostInfo.firstName} />
                ) : null}
                <AvatarFallback>{fmtInitials(playdate.hostInfo.firstName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--foreground)]">
                  {playdate.hostInfo.firstName}
                  {playdate.hostInfo.isVerified ? (
                    <ShieldCheck className="ml-1 inline h-3.5 w-3.5 text-[var(--info)]" />
                  ) : null}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)]">Organizer</div>
              </div>
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AttendeesCard({ playdate }: { playdate: AdminPlaydateDetail }) {
  const attendees = playdate.attendeesInfo ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Attendees{" "}
          <span className="ml-1 text-xs font-normal text-[var(--muted-foreground)]">
            ({attendees.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {attendees.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">
            No attendees yet.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {attendees.map((attendee) => (
              <li
                key={attendee.userId}
                className="flex items-start gap-3 rounded-md border border-[var(--border)] px-3 py-2"
              >
                <Link href={`/users/${attendee.userId}`}>
                  <Avatar className="h-9 w-9">
                    {attendee.avatarUrl ? (
                      <AvatarImage src={attendee.avatarUrl} alt={attendee.firstName} />
                    ) : null}
                    <AvatarFallback>{fmtInitials(attendee.firstName)}</AvatarFallback>
                  </Avatar>
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/users/${attendee.userId}`}
                    className="truncate text-sm font-medium text-[var(--foreground)] hover:underline"
                  >
                    {attendee.firstName}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {attendee.pets.map((pet) => (
                      <span
                        key={pet.id}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--muted)] px-1.5 py-0.5 text-[11px] text-[var(--foreground)]"
                      >
                        {pet.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={pet.photoUrl}
                            alt={pet.name}
                            className="h-3.5 w-3.5 rounded-full object-cover"
                          />
                        ) : (
                          <PawPrint className="h-3 w-3" />
                        )}
                        {pet.name}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  icon: Icon,
  label,
  children
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function CopyPill({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (!value || value === "—") return;
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className="inline-flex w-fit items-center gap-1.5 rounded-md bg-[#21433C] px-2 py-1 font-mono text-xs font-semibold text-white transition-opacity hover:opacity-90"
      title="Copy to clipboard"
    >
      <span>{value}</span>
      <Copy className="h-3 w-3 opacity-80" />
      {copied ? <span className="text-[10px] uppercase">copied</span> : null}
    </button>
  );
}
