"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Flag,
  ImageIcon,
  MessageSquare,
  PawPrint,
  Shield,
  Trash2
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deletePost,
  getReportDetail,
  resolveReport,
  updatePetVisibility,
  updateUserStatus
} from "@/lib/admin-api";
import { fmtInitials } from "@/lib/format";

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const reportID = params?.id ?? "";
  const router = useRouter();
  const qc = useQueryClient();
  const { confirm, node: confirmNode } = useConfirm();
  const [notes, setNotes] = React.useState("");

  const detailQ = useQuery({
    queryKey: ["admin-report", reportID],
    queryFn: () => getReportDetail(reportID),
    enabled: Boolean(reportID)
  });

  const resolveMut = useMutation({
    mutationFn: () => resolveReport(reportID, notes),
    onSuccess: () => {
      toast.success("Report resolved");
      qc.invalidateQueries({ queryKey: ["admin-report", reportID] });
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      router.push("/reports");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const banMut = useMutation({
    mutationFn: (userId: string) => updateUserStatus(userId, "suspended"),
    onSuccess: () => {
      toast.success("User suspended");
      qc.invalidateQueries({ queryKey: ["admin-report", reportID] });
    }
  });

  const deletePostMut = useMutation({
    mutationFn: (postId: string) => deletePost(postId),
    onSuccess: () => {
      toast.success("Post deleted");
      qc.invalidateQueries({ queryKey: ["admin-report", reportID] });
    }
  });

  const hidePetMut = useMutation({
    mutationFn: (petId: string) => updatePetVisibility(petId, true),
    onSuccess: () => {
      toast.success("Pet hidden");
      qc.invalidateQueries({ queryKey: ["admin-report", reportID] });
    }
  });

  if (detailQ.isLoading) {
    return <div className="py-6 text-sm text-[var(--muted-foreground)]">Loading…</div>;
  }
  if (detailQ.error || !detailQ.data) {
    return (
      <div className="flex flex-col gap-3">
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft className="h-3 w-3" /> Reports
        </Link>
        <EmptyState
          icon={Flag}
          title="Report not found"
          description={detailQ.error instanceof Error ? detailQ.error.message : undefined}
        />
      </div>
    );
  }
  const report = detailQ.data;
  const isResolved = report.status === "resolved";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`Report · ${report.reason.slice(0, 60)}`}
        description={`Target: ${report.targetType} · ${report.targetLabel || report.targetID}`}
        breadcrumbs={
          <Link
            href="/reports"
            className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-3 w-3" /> Reports
          </Link>
        }
        actions={<StatusBadge status={report.status} />}
      />

      <Card>
        <CardContent className="grid gap-x-6 gap-y-2 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Type">
            <Badge tone="neutral">{report.targetType}</Badge>
          </Field>
          <Field label="Reason">{report.reason}</Field>
          <Field label="Reporter">
            <Link href={`/users/${report.reporterID}`} className="hover:underline">
              {report.reporterName}
            </Link>
          </Field>
          <Field label="Reported">
            <RelativeTime value={report.createdAt} />
          </Field>
          {report.resolvedAt ? (
            <Field label="Resolved">
              <RelativeTime value={report.resolvedAt} />
            </Field>
          ) : null}
          {report.notes ? (
            <div className="col-span-full">
              <p className="text-[11px] font-medium text-[var(--muted-foreground)]">Notes</p>
              <p className="text-sm">{report.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {report.targetType === "chat" ? (
        <ChatContext
          messages={report.chatMessages ?? []}
          users={report.chatUsers ?? []}
          onBan={(uid) =>
            confirm({
              title: "Suspend this user?",
              description: "They will no longer be able to sign in.",
              destructive: true,
              requireReason: true,
              onConfirm: () => banMut.mutateAsync(uid)
            })
          }
        />
      ) : null}

      {report.targetType === "pet" && report.pet ? (
        <PetContext
          pet={report.pet}
          onHide={() =>
            confirm({
              title: "Hide this pet from discovery?",
              destructive: true,
              requireReason: true,
              onConfirm: () => hidePetMut.mutateAsync(report.pet!.id)
            })
          }
          onBanOwner={() =>
            confirm({
              title: "Suspend the owner?",
              destructive: true,
              requireReason: true,
              onConfirm: () => banMut.mutateAsync(report.pet!.ownerID)
            })
          }
        />
      ) : null}

      {report.targetType === "post" && report.post ? (
        <PostContext
          post={report.post}
          onDelete={() =>
            confirm({
              title: "Delete this post?",
              destructive: true,
              requireReason: true,
              onConfirm: () => deletePostMut.mutateAsync(report.post!.id)
            })
          }
          onBanAuthor={() =>
            confirm({
              title: "Suspend the author?",
              destructive: true,
              requireReason: true,
              onConfirm: () => banMut.mutateAsync(report.post!.authorID)
            })
          }
        />
      ) : null}

      {!isResolved ? (
        <Card>
          <CardHeader>
            <CardTitle>Resolve</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why is this safe / action taken…"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => router.push("/reports")}>
                Back
              </Button>
              <Button onClick={() => resolveMut.mutate()} disabled={resolveMut.isPending}>
                <Shield className="h-3.5 w-3.5" />
                {resolveMut.isPending ? "Resolving…" : "Mark resolved"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {confirmNode}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-[var(--muted-foreground)]">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function ChatContext({
  messages,
  users,
  onBan
}: {
  messages: Array<{ id: string; senderProfileID: string; senderName: string; body: string; createdAt: string }>;
  users: Array<{ id: string; firstName: string; lastName: string; avatarUrl?: string | null }>;
  onBan: (userId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-[var(--muted-foreground)]" /> Participants
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {users.length === 0 ? (
            <span className="text-xs text-[var(--muted-foreground)]">No participants.</span>
          ) : (
            users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-md border border-[var(--border)] p-2">
                <Avatar className="h-8 w-8">
                  {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt={u.firstName} /> : null}
                  <AvatarFallback>{fmtInitials(`${u.firstName} ${u.lastName}`)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <Link href={`/users/${u.id}`} className="text-sm font-medium hover:underline">
                    {u.firstName} {u.lastName}
                  </Link>
                  <div className="truncate text-[11px] text-[var(--muted-foreground)]">{u.id.slice(0, 20)}…</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => onBan(u.id)}>
                  <Ban className="h-3 w-3" /> Suspend
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Messages ({messages.length})</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[480px] overflow-y-auto">
          {messages.length === 0 ? (
            <span className="text-xs text-[var(--muted-foreground)]">No messages.</span>
          ) : (
            <ul className="flex flex-col gap-2">
              {messages.map((m) => (
                <li key={m.id} className="rounded-md border border-[var(--border)] bg-[var(--muted)]/50 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{m.senderName || "system"}</span>
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      <RelativeTime value={m.createdAt} />
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PetContext({
  pet,
  onHide,
  onBanOwner
}: {
  pet: {
    id: string;
    name: string;
    speciesLabel: string;
    breedLabel: string;
    isHidden: boolean;
    photos: Array<{ id: string; url: string }>;
    ownerID: string;
    ownerName: string;
    ownerAvatarUrl?: string | null;
  };
  onHide: () => void;
  onBanOwner: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2">
          <PawPrint className="h-4 w-4 text-[var(--muted-foreground)]" /> Reported pet
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-3 rounded-md border border-[var(--border)] p-3">
          {pet.photos[0]?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pet.photos[0].url} alt={pet.name} className="h-20 w-20 rounded-md object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">
              <Link href={`/pets/${pet.id}`} className="hover:underline">
                {pet.name}
              </Link>
            </div>
            <div className="text-xs text-[var(--muted-foreground)]">
              {pet.speciesLabel} · {pet.breedLabel}
            </div>
            <div className="text-xs text-[var(--muted-foreground)]">
              Owner:{" "}
              <Link href={`/users/${pet.ownerID}`} className="hover:underline">
                {pet.ownerName}
              </Link>
            </div>
            {pet.isHidden ? <Badge tone="warning">hidden</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onHide} disabled={pet.isHidden}>
            <PawPrint className="h-3.5 w-3.5" />
            {pet.isHidden ? "Already hidden" : "Hide from discovery"}
          </Button>
          <Button variant="destructive" onClick={onBanOwner}>
            <Ban className="h-3.5 w-3.5" /> Suspend owner
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PostContext({
  post,
  onDelete,
  onBanAuthor
}: {
  post: {
    id: string;
    body: string;
    imageUrl?: string | null;
    authorID: string;
    authorName: string;
    authorAvatarUrl?: string | null;
    likeCount: number;
    createdAt: string;
  };
  onDelete: () => void;
  onBanAuthor: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-[var(--muted-foreground)]" /> Reported post
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="rounded-md border border-[var(--border)] p-3">
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7">
              {post.authorAvatarUrl ? <AvatarImage src={post.authorAvatarUrl} alt={post.authorName} /> : null}
              <AvatarFallback>{fmtInitials(post.authorName)}</AvatarFallback>
            </Avatar>
            <div className="leading-tight">
              <Link href={`/users/${post.authorID}`} className="text-sm font-medium hover:underline">
                {post.authorName}
              </Link>
              <div className="text-[11px] text-[var(--muted-foreground)]">
                <RelativeTime value={post.createdAt} /> · {post.likeCount} likes
              </div>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{post.body}</p>
          {post.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.imageUrl} alt="Post" className="mt-2 max-h-72 rounded-md border border-[var(--border)]" />
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Delete post
          </Button>
          <Button variant="outline" onClick={onBanAuthor}>
            <Ban className="h-3.5 w-3.5" /> Suspend author
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
