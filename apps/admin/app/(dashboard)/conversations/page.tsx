"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { useDataTable } from "@/components/data-table/useDataTable";
import { Badge } from "@/components/ui/badge";
import { listAdminConversations, type AdminConversation } from "@/lib/api/moderation";

export default function ConversationsPage() {
  const router = useRouter();
  const { state, setState } = useDataTable();

  const query = useQuery({
    queryKey: ["conversations", state],
    queryFn: () => listAdminConversations(state)
  });

  const columns = React.useMemo<ColumnDef<AdminConversation, unknown>[]>(
    () => [
      {
        accessorKey: "userAName",
        header: "Participants",
        cell: ({ row }) => (
          <div className="text-sm">
            <div>{row.original.userAName ?? row.original.userAId}</div>
            <div className="text-xs text-[var(--petto-muted)]">↔ {row.original.userBName ?? row.original.userBId}</div>
          </div>
        )
      },
      {
        accessorKey: "messageCount",
        header: "Messages",
        cell: ({ row }) => (
          <span className="rounded-full bg-[var(--petto-card)] px-2 py-0.5 text-xs">
            {row.original.messageCount}
          </span>
        )
      },
      {
        accessorKey: "muted",
        header: "Muted",
        cell: ({ row }) => (row.original.muted ? <Badge tone="warning">muted</Badge> : null)
      },
      {
        accessorKey: "lastMessageAt",
        header: "Last message",
        cell: ({ row }) => <RelativeTime value={row.original.lastMessageAt} />
      }
    ],
    []
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Conversations"
        description="DM moderation — open a thread to review or delete specific messages."
      />
      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
        searchPlaceholder="Search by user id"
      />
      <DataTable
        data={query.data?.data ?? []}
        columns={columns}
        rowId={(row) => row.id}
        total={query.data?.total}
        state={state}
        onStateChange={setState}
        loading={query.isLoading}
        selectable={false}
        onRowClick={(row) => router.push(`/conversations/${row.id}`)}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-6 text-sm text-[var(--petto-muted)]">
            <MessageSquare className="h-5 w-5" />
            <div>No DM conversations found.</div>
          </div>
        }
      />
    </div>
  );
}
