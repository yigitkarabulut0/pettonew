"use client";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { MessagesSquare } from "lucide-react";

export default function GroupChatsPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Group chats"
        description="Moderate group conversations. Open any group from the Groups page to inspect or delete messages."
      />
      <EmptyState
        icon={MessagesSquare}
        title="Open a group to moderate its chat"
        description="Per-group chat moderation is accessed from the Groups list. This landing page will aggregate activity in a future release."
      />
    </div>
  );
}
