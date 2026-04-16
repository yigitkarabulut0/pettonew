"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  deleteAdminMessage,
  listAdminConversationMessages
} from "@/lib/api/moderation";

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const conversationId = params?.id ?? "";
  const qc = useQueryClient();
  const { confirm, node: confirmNode } = useConfirm();

  const query = useQuery({
    queryKey: ["conversation-messages", conversationId],
    queryFn: () => listAdminConversationMessages(conversationId, { pageSize: 100 }),
    enabled: Boolean(conversationId)
  });

  const deleteMut = useMutation({
    mutationFn: (messageId: string) => deleteAdminMessage(conversationId, messageId),
    onSuccess: () => {
      toast.success("Message deleted");
      qc.invalidateQueries({ queryKey: ["conversation-messages", conversationId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const messages = query.data?.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`Conversation ${conversationId.slice(0, 8)}`}
        description="Delete moderation — tombstones are shown to both participants."
        breadcrumbs={
          <Link href="/conversations" className="inline-flex items-center gap-1 text-xs text-[var(--petto-muted)] hover:text-[var(--petto-ink)]">
            <ArrowLeft className="h-3 w-3" /> Conversations
          </Link>
        }
      />
      <Card className="max-w-3xl p-4">
        {query.isLoading ? (
          <div className="text-sm text-[var(--petto-muted)]">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-[var(--petto-muted)]">
            No messages — this conversation may not yet be indexed.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((msg) => (
              <li
                key={msg.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-[var(--petto-border)] bg-[var(--petto-card)]/40 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-[var(--petto-ink)]">
                    {msg.senderName ?? msg.senderUserId}
                  </div>
                  <div className="mt-0.5 text-sm text-[var(--petto-ink)]">
                    {msg.deletedAt ? (
                      <em className="text-[var(--petto-muted)]">deleted</em>
                    ) : (
                      msg.body
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--petto-muted)]">
                    <RelativeTime value={msg.createdAt} />
                  </div>
                </div>
                {!msg.deletedAt ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete message"
                    onClick={() =>
                      confirm({
                        title: "Delete this message?",
                        description: "Both participants see a tombstone.",
                        destructive: true,
                        requireReason: true,
                        onConfirm: () => deleteMut.mutateAsync(msg.id)
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {confirmNode}
    </div>
  );
}
