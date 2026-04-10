"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Trash2,
  ShieldCheck,
  MessageSquare,
  PawPrint,
  ImageIcon,
  User
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getReportDetail,
  resolveReport,
  deletePost,
  updatePetVisibility,
  updateUserStatus
} from "@/lib/admin-api";

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");

  const { data: report, isLoading } = useQuery({
    queryKey: ["admin-report", params.id],
    queryFn: () => getReportDetail(params.id),
    enabled: Boolean(params.id)
  });

  const resolveMutation = useMutation({
    mutationFn: () => resolveReport(params.id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      queryClient.invalidateQueries({ queryKey: ["admin-report"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      router.push("/reports");
    }
  });

  const banMutation = useMutation({
    mutationFn: (userId: string) => updateUserStatus(userId, "suspended"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      queryClient.invalidateQueries({ queryKey: ["admin-report"] });
    }
  });

  const deletePostMutation = useMutation({
    mutationFn: () => deletePost(report!.post!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      queryClient.invalidateQueries({ queryKey: ["admin-report"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    }
  });

  const hidePetMutation = useMutation({
    mutationFn: () => updatePetVisibility(report!.pet!.id, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      queryClient.invalidateQueries({ queryKey: ["admin-report"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    }
  });

  if (isLoading || !report) {
    return (
      <Card>
        <p className="text-[var(--petto-muted)]">Loading...</p>
      </Card>
    );
  }

  const isResolved = report.status === "resolved";

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => router.push("/reports")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--petto-background)] hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-[var(--petto-ink)]" />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl text-[var(--petto-ink)]">Report Detail</h1>
          </div>
          <Badge tone={isResolved ? "success" : "warning"}>
            {report.status.replace("_", " ")}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-[16px] bg-[var(--petto-background)] p-4 text-sm">
          <div>
            <span className="text-[var(--petto-muted)]">Type</span>
            <p className="mt-0.5 font-medium text-[var(--petto-ink)] capitalize">
              {report.targetType === "chat"
                ? "💬 Chat"
                : report.targetType === "pet"
                  ? "🐕 Pet"
                  : "📝 Post"}
            </p>
          </div>
          <div>
            <span className="text-[var(--petto-muted)]">Reason</span>
            <p className="mt-0.5 font-medium text-[var(--petto-ink)]">
              {report.reason}
            </p>
          </div>
          <div>
            <span className="text-[var(--petto-muted)]">Target</span>
            <p className="mt-0.5 font-medium text-[var(--petto-ink)] truncate">
              {report.targetLabel}
            </p>
          </div>
          <div>
            <span className="text-[var(--petto-muted)]">Reported by</span>
            <p className="mt-0.5 font-medium text-[var(--petto-ink)]">
              {report.reporterName}
            </p>
          </div>
          <div>
            <span className="text-[var(--petto-muted)]">Created</span>
            <p className="mt-0.5 font-medium text-[var(--petto-ink)]">
              {new Date(report.createdAt).toLocaleString()}
            </p>
          </div>
          {report.resolvedAt && (
            <div>
              <span className="text-[var(--petto-muted)]">Resolved</span>
              <p className="mt-0.5 font-medium text-[var(--petto-ink)]">
                {new Date(report.resolvedAt).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {report.notes && (
          <div className="mt-4 rounded-[12px] border border-[var(--petto-border)] bg-white/50 p-3 text-sm">
            <span className="text-[var(--petto-muted)]">Notes: </span>
            <span className="text-[var(--petto-ink)]">{report.notes}</span>
          </div>
        )}
      </Card>

      {report.targetType === "chat" && (
        <ChatReportSection report={report} banMutation={banMutation as never} />
      )}

      {report.targetType === "pet" && (
        <PetReportSection
          report={report}
          hidePetMutation={hidePetMutation as never}
          banMutation={banMutation as never}
        />
      )}

      {report.targetType === "post" && (
        <PostReportSection
          report={report}
          deletePostMutation={deletePostMutation as never}
          banMutation={banMutation as never}
        />
      )}

      {!isResolved && (
        <Card>
          <h2 className="text-lg font-semibold text-[var(--petto-ink)] mb-3">
            Resolve Report
          </h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add optional notes (e.g. why marked as safe)..."
            rows={3}
            className="w-full rounded-[12px] border border-[var(--petto-border)] bg-white/70 px-4 py-3 text-sm text-[var(--petto-ink)] placeholder:text-[var(--petto-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--petto-primary)]"
          />
          <div className="mt-3 flex gap-3">
            <Button
              variant="ghost"
              onClick={() => resolveMutation.mutate()}
              disabled={resolveMutation.isPending}
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              {resolveMutation.isPending ? "Resolving..." : "Mark as Safe"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function ChatReportSection({
  report,
  banMutation
}: {
  report: {
    chatMessages?: Array<{
      id: string;
      senderProfileID: string;
      senderName: string;
      body: string;
      createdAt: string;
    }>;
    chatUsers?: Array<{
      id: string;
      firstName: string;
      lastName: string;
      avatarUrl?: string;
    }>;
  };
  banMutation: ReturnType<typeof useMutation<void, Error, string, unknown>>;
}) {
  const rawUsers = report.chatUsers ?? [];
  const messages = report.chatMessages ?? [];

  const users =
    rawUsers.length > 0
      ? rawUsers
      : messages.reduce<
          Array<{ id: string; firstName: string; lastName: string }>
        >((acc, msg) => {
          if (!acc.find((u) => u.id === msg.senderProfileID)) {
            const parts = msg.senderName.split(" ");
            acc.push({
              id: msg.senderProfileID,
              firstName: parts[0] ?? msg.senderName,
              lastName: parts.slice(1).join(" ")
            });
          }
          return acc;
        }, []);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-5 w-5 text-[var(--petto-secondary)]" />
        <h2 className="text-lg font-semibold text-[var(--petto-ink)]">
          Chat History
        </h2>
      </div>

      {users.length > 0 && (
        <div className="mb-4 flex gap-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 rounded-[16px] border border-[var(--petto-border)] bg-[var(--petto-background)] p-3 flex-1"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--petto-primary)] text-white font-semibold text-sm">
                {user.firstName[0]}
                {user.lastName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--petto-ink)] truncate">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-[var(--petto-muted)]">
                  ID: {user.id.slice(0, 8)}...
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => banMutation.mutate(user.id)}
                disabled={banMutation.isPending}
              >
                <Ban className="mr-1 h-3 w-3" />
                Ban
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="max-h-96 overflow-y-auto rounded-[12px] border border-[var(--petto-border)] bg-[var(--petto-background)] p-4 space-y-3">
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--petto-muted)]">
            No messages found.
          </p>
        )}
        {messages.map((msg) => {
          const isEven = parseInt(msg.id.slice(-1), 10) % 2 === 0;
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isEven ? "items-start" : "items-end"}`}
            >
              <span className="text-xs font-medium text-[var(--petto-muted)] mb-1">
                {msg.senderName}
              </span>
              <div
                className={`max-w-[75%] rounded-[16px] px-4 py-2 text-sm ${
                  isEven
                    ? "rounded-bl-sm bg-white text-[var(--petto-ink)]"
                    : "rounded-br-sm bg-[var(--petto-primary)] text-white"
                }`}
              >
                {msg.body}
              </div>
              <span className="text-[10px] text-[var(--petto-muted)] mt-1">
                {new Date(msg.createdAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PetReportSection({
  report,
  hidePetMutation,
  banMutation
}: {
  report: {
    pet?: {
      id: string;
      name: string;
      speciesLabel: string;
      breedLabel: string;
      isHidden: boolean;
      photos: Array<{ id: string; url: string }>;
      ownerID: string;
      ownerName: string;
      ownerAvatarUrl?: string;
    } | null;
  };
  hidePetMutation: ReturnType<typeof useMutation<void, Error, void, unknown>>;
  banMutation: ReturnType<typeof useMutation<void, Error, string, unknown>>;
}) {
  const pet = report.pet;
  if (!pet)
    return (
      <Card>
        <p className="text-[var(--petto-muted)]">Pet not found.</p>
      </Card>
    );

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <PawPrint className="h-5 w-5 text-[var(--petto-secondary)]" />
        <h2 className="text-lg font-semibold text-[var(--petto-ink)]">
          Reported Pet
        </h2>
      </div>

      <div className="flex gap-4 rounded-[16px] border border-[var(--petto-border)] bg-[var(--petto-background)] p-4">
        {pet.photos[0]?.url && (
          <img
            src={pet.photos[0].url}
            alt={pet.name}
            className="h-20 w-20 rounded-[12px] object-cover"
          />
        )}
        <div className="flex-1">
          <p className="font-semibold text-[var(--petto-ink)]">{pet.name}</p>
          <p className="text-sm text-[var(--petto-muted)]">
            {pet.speciesLabel} &middot; {pet.breedLabel}
          </p>
          <p className="text-sm text-[var(--petto-muted)]">
            Owner: {pet.ownerName}
          </p>
          {pet.isHidden && <Badge tone="warning">Hidden</Badge>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="ghost"
          onClick={() => hidePetMutation.mutate()}
          disabled={hidePetMutation.isPending || pet.isHidden}
        >
          <PawPrint className="mr-2 h-4 w-4" />
          {hidePetMutation.isPending
            ? "Hiding..."
            : pet.isHidden
              ? "Already Hidden"
              : "Remove Pet"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => banMutation.mutate(pet.ownerID)}
          disabled={banMutation.isPending}
        >
          <Ban className="mr-2 h-4 w-4" />
          {banMutation.isPending ? "Banning..." : "Ban Owner"}
        </Button>
      </div>
    </Card>
  );
}

function PostReportSection({
  report,
  deletePostMutation,
  banMutation
}: {
  report: {
    post?: {
      id: string;
      body: string;
      imageUrl?: string;
      authorID: string;
      authorName: string;
      authorAvatarUrl?: string;
      likeCount: number;
      createdAt: string;
    } | null;
  };
  deletePostMutation: ReturnType<
    typeof useMutation<void, Error, void, unknown>
  >;
  banMutation: ReturnType<typeof useMutation<void, Error, string, unknown>>;
}) {
  const post = report.post;
  if (!post)
    return (
      <Card>
        <p className="text-[var(--petto-muted)]">Post not found.</p>
      </Card>
    );

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <ImageIcon className="h-5 w-5 text-[var(--petto-secondary)]" />
        <h2 className="text-lg font-semibold text-[var(--petto-ink)]">
          Reported Post
        </h2>
      </div>

      <div className="rounded-[16px] border border-[var(--petto-border)] bg-[var(--petto-background)] p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--petto-primary)] text-white font-semibold text-sm">
            {post.authorName[0]}
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--petto-ink)]">
              {post.authorName}
            </p>
            <p className="text-xs text-[var(--petto-muted)]">
              {new Date(post.createdAt).toLocaleDateString("en-GB")}
            </p>
          </div>
        </div>
        <p className="text-sm text-[var(--petto-ink)] whitespace-pre-wrap">
          {post.body}
        </p>
        {post.imageUrl && (
          <img
            src={post.imageUrl}
            alt="Post"
            className="mt-3 rounded-[12px] max-h-48 w-full object-cover"
          />
        )}
        <p className="mt-2 text-xs text-[var(--petto-muted)]">
          {post.likeCount} likes
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="ghost"
          onClick={() => deletePostMutation.mutate()}
          disabled={deletePostMutation.isPending}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {deletePostMutation.isPending ? "Deleting..." : "Delete Post"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => banMutation.mutate(post.authorID)}
          disabled={banMutation.isPending}
        >
          <Ban className="mr-2 h-4 w-4" />
          {banMutation.isPending ? "Banning..." : "Ban Author"}
        </Button>
      </div>
    </Card>
  );
}
