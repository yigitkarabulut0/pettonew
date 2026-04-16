"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Calendar,
  Flag,
  Heart,
  Image as ImageIcon,
  MapPin,
  MessageSquare,
  PawPrint,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { UserLocationMap } from "@/components/common/UserLocationMap";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, type AdminListEnvelope } from "@/lib/api/client";
import { banAdminUser, unbanAdminUser } from "@/lib/api/users";
import { deleteUser, getUserDetail, updateUser } from "@/lib/admin-api";
import { fmtDate, fmtDateTime, fmtInitials } from "@/lib/format";

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const userID = params?.id ?? "";
  const qc = useQueryClient();
  const { confirm, node: confirmNode } = useConfirm();

  const detailQ = useQuery({
    queryKey: ["admin-user-detail", userID],
    queryFn: () => getUserDetail(userID),
    enabled: Boolean(userID)
  });

  const playdatesQ = useQuery({
    queryKey: ["admin-user-playdates", userID],
    queryFn: () => apiRequest<AdminListEnvelope<any>>(`/users/${userID}/playdates`),
    enabled: Boolean(userID)
  });
  const groupsQ = useQuery({
    queryKey: ["admin-user-groups", userID],
    queryFn: () => apiRequest<AdminListEnvelope<any>>(`/users/${userID}/groups`),
    enabled: Boolean(userID)
  });
  const reportsQ = useQuery({
    queryKey: ["admin-user-reports", userID],
    queryFn: () => apiRequest<AdminListEnvelope<any>>(`/users/${userID}/reports`),
    enabled: Boolean(userID)
  });
  const bansQ = useQuery({
    queryKey: ["admin-user-bans", userID],
    queryFn: () => apiRequest<AdminListEnvelope<any>>(`/users/${userID}/bans`),
    enabled: Boolean(userID)
  });
  const activityQ = useQuery({
    queryKey: ["admin-user-activity", userID],
    queryFn: () => apiRequest<AdminListEnvelope<any>>(`/users/${userID}/activity`),
    enabled: Boolean(userID)
  });

  const banMut = useMutation({
    mutationFn: (payload: { reason: string; durationHours?: number; notes?: string }) =>
      banAdminUser(userID, payload),
    onSuccess: () => {
      toast.success("User banned");
      qc.invalidateQueries({ queryKey: ["admin-user-detail", userID] });
      qc.invalidateQueries({ queryKey: ["admin-user-bans", userID] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const unbanMut = useMutation({
    mutationFn: (notes: string) => unbanAdminUser(userID, notes),
    onSuccess: () => {
      toast.success("User unbanned");
      qc.invalidateQueries({ queryKey: ["admin-user-detail", userID] });
      qc.invalidateQueries({ queryKey: ["admin-user-bans", userID] });
    }
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteUser(userID),
    onSuccess: () => {
      toast.success("User deleted");
      window.location.href = "/users";
    }
  });

  if (detailQ.isLoading) {
    return <div className="py-6 text-sm text-[var(--muted-foreground)]">Loading…</div>;
  }
  if (detailQ.error || !detailQ.data) {
    return (
      <div className="flex flex-col gap-3">
        <Link href="/users" className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          <ArrowLeft className="h-3 w-3" /> Users
        </Link>
        <EmptyState title="User not found" description="The user may have been deleted." />
      </div>
    );
  }

  const { user, pets, matches, posts, conversations, totalLikesReceived } = detailQ.data;
  const playdates = playdatesQ.data?.data ?? [];
  const groups = groupsQ.data?.data ?? [];
  const reports = reportsQ.data?.data ?? [];
  const bans = bansQ.data?.data ?? [];
  const activity = activityQ.data?.data ?? [];
  const isBanned = (user.status as string) === "banned" || bans.some((b: any) => !b.revokedAt);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email}
        description={user.email}
        breadcrumbs={
          <Link href="/users" className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            <ArrowLeft className="h-3 w-3" /> Users
          </Link>
        }
        actions={
          <>
            {isBanned ? (
              <Button
                variant="outline"
                onClick={() =>
                  confirm({
                    title: "Unban user?",
                    description: "They will regain access to the app immediately.",
                    requireReason: true,
                    confirmLabel: "Unban",
                    onConfirm: (reason) => unbanMut.mutateAsync(reason)
                  })
                }
              >
                Unban
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() =>
                  confirm({
                    title: "Ban user?",
                    description: "They will lose access to the app. Add a reason for the audit trail.",
                    requireReason: true,
                    destructive: true,
                    confirmLabel: "Ban user",
                    onConfirm: (reason) => banMut.mutateAsync({ reason })
                  })
                }
              >
                <Ban className="h-3.5 w-3.5" /> Ban user
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() =>
                confirm({
                  title: "Delete user permanently?",
                  description: "All pets, posts, and history will be removed. This cannot be undone.",
                  destructive: true,
                  requireReason: true,
                  confirmLabel: "Delete",
                  onConfirm: () => deleteMut.mutateAsync()
                })
              }
            >
              Delete
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-start">
          <Avatar className="h-16 w-16">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.firstName ?? user.email} /> : null}
            <AvatarFallback className="text-base">
              {fmtInitials(`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Status">
              <StatusBadge status={user.status} />
            </Field>
            <Field label="User ID">
              <code className="truncate text-xs">{user.id}</code>
            </Field>
            <Field label="Email">{user.email}</Field>
            <Field label="Gender">{user.gender ?? "—"}</Field>
            <Field label="Birthdate">{user.birthDate ? fmtDate(user.birthDate) : "—"}</Field>
            <Field label="Location">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {user.cityLabel || "—"}
              </span>
            </Field>
            <Field label="Visible on map">{user.isVisibleOnMap ? "Yes" : "No"}</Field>
            <Field label="Joined">
              <RelativeTime value={user.createdAt} />
            </Field>
            <Field label="Total likes received">{totalLikesReceived}</Field>
            {user.bio ? (
              <div className="col-span-full">
                <p className="text-[11px] font-medium text-[var(--muted-foreground)]">Bio</p>
                <p className="text-sm text-[var(--foreground)]">{user.bio}</p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <UserLocationMap userID={userID} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard label="Pets" value={pets.length} icon={PawPrint} />
        <StatCard label="Posts" value={posts.length} icon={ImageIcon} />
        <StatCard label="Matches" value={matches.length} icon={Heart} />
        <StatCard label="Conversations" value={conversations.length} icon={MessageSquare} />
        <StatCard label="Playdates" value={playdates.length} icon={Calendar} />
        <StatCard label="Groups" value={groups.length} icon={UsersRound} />
      </div>

      <Tabs defaultValue="pets">
        <TabsList className="flex-wrap">
          <TabsTrigger value="pets">Pets ({pets.length})</TabsTrigger>
          <TabsTrigger value="posts">Posts ({posts.length})</TabsTrigger>
          <TabsTrigger value="matches">Matches ({matches.length})</TabsTrigger>
          <TabsTrigger value="conversations">DMs ({conversations.length})</TabsTrigger>
          <TabsTrigger value="playdates">Playdates ({playdates.length})</TabsTrigger>
          <TabsTrigger value="groups">Groups ({groups.length})</TabsTrigger>
          <TabsTrigger value="reports">Reports ({reports.length})</TabsTrigger>
          <TabsTrigger value="bans">Bans ({bans.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="edit">Edit</TabsTrigger>
        </TabsList>

        <TabsContent value="pets">
          {pets.length === 0 ? (
            <EmptyState icon={PawPrint} title="No pets" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {pets.map((pet) => (
                <Link
                  key={pet.id}
                  href={`/pets/${pet.id}`}
                  className="flex items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] p-3 transition-colors hover:bg-[var(--muted)]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--muted)]">
                    <PawPrint className="h-4 w-4 text-[var(--muted-foreground)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{pet.name}</div>
                    <div className="truncate text-[11px] text-[var(--muted-foreground)]">
                      {pet.speciesLabel} · {pet.breedLabel || "mixed"}
                    </div>
                    <div className="mt-1">
                      <StatusBadge status={pet.isHidden ? "hidden" : "active"} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="posts">
          {posts.length === 0 ? (
            <EmptyState icon={ImageIcon} title="No posts" />
          ) : (
            <div className="flex flex-col gap-2">
              {posts.map((post) => (
                <Card key={post.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-xs text-[var(--muted-foreground)]">
                        <RelativeTime value={post.createdAt} />
                        {post.venueName ? ` · @ ${post.venueName}` : ""}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{post.body}</p>
                    </div>
                    <Badge tone="neutral">
                      <Heart className="h-3 w-3" /> {post.likeCount}
                    </Badge>
                  </div>
                  {post.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.imageUrl} alt="" className="mt-2 max-h-64 rounded border border-[var(--border)]" />
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="matches">
          {matches.length === 0 ? (
            <EmptyState icon={Heart} title="No matches" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {matches.map((m) => (
                <Card key={m.id} className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-medium">
                        {m.pet.name} ↔ {m.matchedPet?.name ?? "—"}
                      </div>
                      <div className="text-[11px] text-[var(--muted-foreground)]">
                        owner: {m.matchedOwnerName} · <RelativeTime value={m.createdAt} />
                      </div>
                    </div>
                    {m.unreadCount > 0 ? <Badge tone="info">{m.unreadCount}</Badge> : null}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="conversations">
          {conversations.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No conversations" />
          ) : (
            <div className="flex flex-col gap-1.5">
              {conversations.map((c) => (
                <Link
                  key={c.id}
                  href={`/conversations/${c.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 hover:bg-[var(--muted)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.title || "(no title)"}</div>
                    <div className="truncate text-[11px] text-[var(--muted-foreground)]">{c.subtitle}</div>
                  </div>
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    <RelativeTime value={c.lastMessageAt} />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="playdates">
          {playdates.length === 0 ? (
            <EmptyState icon={Calendar} title="No playdates" />
          ) : (
            <div className="flex flex-col gap-1.5">
              {playdates.map((p: any) => (
                <Link
                  key={p.id}
                  href={`/playdates/${p.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 hover:bg-[var(--muted)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.title}</div>
                    <div className="truncate text-[11px] text-[var(--muted-foreground)]">
                      {p.location} · {fmtDate(p.date)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={p.role === "organizer" ? "brand" : "neutral"}>{p.role}</Badge>
                    <StatusBadge status={p.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="groups">
          {groups.length === 0 ? (
            <EmptyState icon={UsersRound} title="No groups" />
          ) : (
            <div className="flex flex-col gap-1.5">
              {groups.map((g: any) => (
                <Link
                  key={g.id}
                  href={`/groups/${g.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 hover:bg-[var(--muted)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{g.name}</div>
                    <div className="truncate text-[11px] text-[var(--muted-foreground)]">
                      {g.petType} · {g.memberCount} members
                    </div>
                  </div>
                  <RelativeTime value={g.createdAt} />
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports">
          {reports.length === 0 ? (
            <EmptyState icon={Flag} title="No reports" />
          ) : (
            <div className="flex flex-col gap-1.5">
              {reports.map((r: any) => (
                <Card key={r.id} className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-medium">{r.reason}</div>
                      <div className="text-[11px] text-[var(--muted-foreground)]">
                        {r.reporterId === userID ? "reporter" : "target"} · {r.targetType}:{r.targetLabel}
                      </div>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bans">
          {bans.length === 0 ? (
            <EmptyState icon={Ban} title="No ban history" />
          ) : (
            <div className="flex flex-col gap-1.5">
              {bans.map((b: any) => (
                <Card key={b.id} className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-medium">{b.reason}</div>
                      {b.notes ? <div className="text-xs text-[var(--muted-foreground)]">{b.notes}</div> : null}
                      <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                        by {b.adminId} · started {fmtDateTime(b.startsAt)}
                        {b.endsAt ? ` · ends ${fmtDateTime(b.endsAt)}` : ""}
                      </div>
                    </div>
                    {b.revokedAt ? (
                      <Badge tone="neutral">revoked {fmtDateTime(b.revokedAt)}</Badge>
                    ) : (
                      <Badge tone="danger">active</Badge>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity">
          {activity.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {activity.map((a: any, idx: number) => (
                <li
                  key={`${a.refId}-${idx}`}
                  className="flex items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                >
                  <Badge tone="neutral">{a.kind}</Badge>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="truncate">{a.label || "(no label)"}</div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      <RelativeTime value={a.occurAt} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="edit">
          <EditProfileForm
            userId={userID}
            initial={user}
            onSaved={() => qc.invalidateQueries({ queryKey: ["admin-user-detail", userID] })}
          />
        </TabsContent>
      </Tabs>

      {confirmNode}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-[var(--muted-foreground)]">{label}</p>
      <div className="text-sm text-[var(--foreground)]">{children}</div>
    </div>
  );
}

function EditProfileForm({
  userId,
  initial,
  onSaved
}: {
  userId: string;
  initial: { firstName?: string; lastName?: string; bio?: string; cityLabel?: string; gender?: string; birthDate?: string | null };
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState({
    firstName: initial.firstName ?? "",
    lastName: initial.lastName ?? "",
    bio: initial.bio ?? "",
    cityLabel: initial.cityLabel ?? "",
    gender: initial.gender ?? "",
    birthDate: initial.birthDate ? new Date(initial.birthDate).toISOString().slice(0, 10) : ""
  });

  const mut = useMutation({
    mutationFn: () => updateUser(userId, form),
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <Label>First name</Label>
            <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Last name</Label>
            <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>City</Label>
            <Input value={form.cityLabel} onChange={(e) => setForm({ ...form, cityLabel: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Gender</Label>
            <Input value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Birth date</Label>
            <Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
          </div>
          <div className="col-span-full flex flex-col gap-1">
            <Label>Bio</Label>
            <Textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </div>
          <div className="col-span-full flex items-center justify-end gap-2">
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
