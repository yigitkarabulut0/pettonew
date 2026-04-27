"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, User } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { PlaydateChatPane } from "@/components/playdate/PlaydateChatPane";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAdminConversations, type AdminConversation } from "@/lib/api/moderation";
import { fmtInitials } from "@/lib/format";

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const conversationId = params?.id ?? "";

  // The list endpoint is the only place that returns participant + message
  // count metadata — fetch it once so the header can show who's in the DM.
  // Cached and reused with the listing page so this is usually a no-op.
  const conversationsQuery = useQuery({
    queryKey: ["conversations", { pageSize: 200 }],
    queryFn: () => listAdminConversations({ pageSize: 200 }),
    enabled: Boolean(conversationId)
  });
  const conversation: AdminConversation | undefined = conversationsQuery.data?.data?.find(
    (c) => c.id === conversationId
  );

  const titleParts = [
    conversation?.userAName ?? conversation?.userAId,
    conversation?.userBName ?? conversation?.userBId
  ].filter(Boolean);
  const title =
    titleParts.length === 2
      ? `${titleParts[0]} ↔ ${titleParts[1]}`
      : `Conversation ${conversationId.slice(0, 8)}`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={title}
        description="Direct-message moderation — review the live chat or remove specific messages."
        breadcrumbs={
          <Link
            href="/conversations"
            className="inline-flex w-fit items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-3 w-3" /> All conversations
          </Link>
        }
        actions={
          conversation ? (
            <div className="flex items-center gap-1.5">
              <Badge tone="neutral">
                <MessageSquare className="h-3 w-3" /> {conversation.messageCount} messages
              </Badge>
              {conversation.muted ? <Badge tone="warning">muted</Badge> : null}
            </div>
          ) : null
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,1.4fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Participants</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {conversation ? (
              <>
                <ParticipantRow
                  id={conversation.userAId}
                  name={conversation.userAName}
                />
                <ParticipantRow
                  id={conversation.userBId}
                  name={conversation.userBName}
                />
                {conversation.lastMessageAt ? (
                  <div className="mt-2 text-[11px] text-[var(--muted-foreground)]">
                    Last message <RelativeTime value={conversation.lastMessageAt} />
                  </div>
                ) : null}
              </>
            ) : conversationsQuery.isLoading ? (
              <span className="text-xs text-[var(--muted-foreground)]">Loading…</span>
            ) : (
              <span className="text-xs text-[var(--muted-foreground)]">
                Conversation metadata unavailable.
              </span>
            )}
          </CardContent>
        </Card>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <div className="h-[calc(100vh-7rem)] min-h-[520px]">
            <PlaydateChatPane
              conversationId={conversationId}
              dmParticipants={
                conversation?.userAId && conversation?.userBId
                  ? [conversation.userAId, conversation.userBId]
                  : undefined
              }
              className="h-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ParticipantRow({ id, name }: { id: string; name?: string }) {
  if (!id) return null;
  const display = name && name.trim() ? name : id;
  return (
    <Link
      href={`/users/${encodeURIComponent(id)}`}
      className="flex items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2 transition-colors hover:bg-[var(--muted)]"
    >
      <Avatar className="h-8 w-8">
        <AvatarFallback>{fmtInitials(display)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--foreground)]">{display}</div>
        <div className="truncate text-[11px] text-[var(--muted-foreground)]">{id}</div>
      </div>
      <User className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
    </Link>
  );
}
