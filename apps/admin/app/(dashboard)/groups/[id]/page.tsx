"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Copy,
  Globe,
  Hash,
  Lock,
  MapPin,
  PawPrint,
  Shield,
  Users,
  VolumeX
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { PlaydateChatPane } from "@/components/playdate/PlaydateChatPane";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type AdminGroupDetail, getAdminGroupDetail } from "@/lib/admin-api";
import { fmtInitials } from "@/lib/format";

export default function GroupDetailPage() {
  const params = useParams<{ id: string }>();
  const groupId = params?.id;

  const query = useQuery<AdminGroupDetail>({
    queryKey: ["admin-group-detail", groupId],
    queryFn: () => getAdminGroupDetail(groupId as string),
    enabled: !!groupId,
    refetchOnWindowFocus: true
  });

  const group = query.data;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={group?.name ?? "Group"}
        description={group?.description}
        breadcrumbs={
          <Link
            href="/groups"
            className="inline-flex w-fit items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-3 w-3" /> All groups
          </Link>
        }
        actions={
          group ? (
            <div className="flex items-center gap-1.5">
              <Badge tone={group.isPrivate ? "warning" : "neutral"}>
                {group.isPrivate ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                {group.isPrivate ? "private" : "public"}
              </Badge>
              <Badge tone="neutral">
                <PawPrint className="h-3 w-3" /> {group.petType || "all"}
              </Badge>
              <Badge tone={group.memberCount > 0 ? "success" : "neutral"}>
                <Users className="h-3 w-3" /> {group.memberCount}
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
      ) : query.isError || !group ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--destructive)]">
            {query.error instanceof Error ? query.error.message : "Group not found."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(380px,1fr)]">
          <div className="flex flex-col gap-4">
            <CoverCard group={group} />
            <MetadataCard group={group} />
            <MembersCard group={group} />
            {group.rules && group.rules.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Rules</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-1.5 text-sm text-[var(--foreground)]">
                    {group.rules.map((rule, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="xl:sticky xl:top-4 xl:self-start">
            {group.conversationId ? (
              <div className="h-[calc(100vh-7rem)] min-h-[480px]">
                <PlaydateChatPane
                  conversationId={group.conversationId}
                  organizerId={group.ownerUserId}
                  hostName={
                    group.members?.find((m) => m.userId === group.ownerUserId)?.firstName ??
                    undefined
                  }
                  className="h-full"
                />
              </div>
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-sm text-[var(--muted-foreground)]">
                  This group has no conversation thread.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CoverCard({ group }: { group: AdminGroupDetail }) {
  const cover = group.imageUrl;
  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[16/7] w-full">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={group.name}
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
            <h2 className="truncate text-base font-semibold drop-shadow">{group.name}</h2>
            {group.cityLabel ? (
              <p className="truncate text-xs opacity-90">
                <MapPin className="mr-1 inline h-3 w-3" />
                {group.cityLabel}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {group.description ? (
        <CardContent className="pt-4">
          <p className="whitespace-pre-wrap text-sm text-[var(--foreground)]">
            {group.description}
          </p>
          {group.hashtags && group.hashtags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {group.hashtags.map((tag) => (
                <Badge key={tag} tone="neutral">
                  #{tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function MetadataCard({ group }: { group: AdminGroupDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Field icon={MapPin} label="City">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {group.cityLabel || "—"}
          </span>
          {group.latitude && group.longitude ? (
            <a
              href={`https://maps.google.com/?q=${group.latitude},${group.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[var(--primary)] hover:underline"
            >
              Open in Maps
            </a>
          ) : null}
        </Field>
        <Field icon={PawPrint} label="Pet type">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {group.petType || "all"}
          </span>
          {group.category ? (
            <span className="text-[11px] text-[var(--muted-foreground)]">{group.category}</span>
          ) : null}
        </Field>
        <Field icon={Users} label="Members">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {group.memberCount.toLocaleString()}
          </span>
        </Field>
        <Field icon={Hash} label="Join code">
          {group.code ? <CopyPill value={group.code} /> : (
            <span className="text-xs text-[var(--muted-foreground)]">—</span>
          )}
          {group.isPrivate ? (
            <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--warning)]">
              <Lock className="h-3 w-3" /> Required to join
            </span>
          ) : null}
        </Field>
      </CardContent>
    </Card>
  );
}

function MembersCard({ group }: { group: AdminGroupDetail }) {
  const members = group.members ?? [];
  const adminIds = new Set(group.adminUserIds ?? []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Members{" "}
          <span className="ml-1 text-xs font-normal text-[var(--muted-foreground)]">
            ({members.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">
            No members yet.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {members.map((member) => {
              const isOwner = group.ownerUserId === member.userId;
              const isAdmin = adminIds.has(member.userId);
              return (
                <li
                  key={member.userId}
                  className="flex items-start gap-3 rounded-md border border-[var(--border)] px-3 py-2"
                >
                  <Link href={`/users/${member.userId}`}>
                    <Avatar className="h-9 w-9">
                      {member.avatarUrl ? (
                        <AvatarImage src={member.avatarUrl} alt={member.firstName} />
                      ) : null}
                      <AvatarFallback>{fmtInitials(member.firstName)}</AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/users/${member.userId}`}
                        className="truncate text-sm font-medium text-[var(--foreground)] hover:underline"
                      >
                        {member.firstName}
                      </Link>
                      {isOwner ? (
                        <span className="rounded-sm bg-[#E6694A]/15 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-[#E6694A]">
                          Owner
                        </span>
                      ) : isAdmin ? (
                        <span className="rounded-sm bg-[var(--info-soft)] px-1 py-px text-[9px] font-bold uppercase tracking-wide text-[var(--info)]">
                          Admin
                        </span>
                      ) : null}
                      {member.isMuted ? (
                        <span className="inline-flex items-center gap-0.5 rounded-sm bg-[var(--warning-soft)] px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--warning)]">
                          <VolumeX className="h-2.5 w-2.5" /> muted
                        </span>
                      ) : null}
                    </div>
                    {member.pets.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {member.pets.map((pet) => (
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
                    ) : null}
                  </div>
                </li>
              );
            })}
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
        if (!value) return;
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* noop */
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
