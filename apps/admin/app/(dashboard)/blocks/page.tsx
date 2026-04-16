"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ShieldAlert } from "lucide-react";
import * as React from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { useDataTable } from "@/components/data-table/useDataTable";
import { listAdminBlocks, type AdminBlock } from "@/lib/api/moderation";

export default function BlocksPage() {
  const { state, setState } = useDataTable();

  const query = useQuery({
    queryKey: ["blocks", state],
    queryFn: () => listAdminBlocks(state)
  });

  const columns = React.useMemo<ColumnDef<AdminBlock, unknown>[]>(
    () => [
      {
        accessorKey: "blockerName",
        header: "Blocker",
        cell: ({ row }) => row.original.blockerName ?? row.original.blockerUserId
      },
      {
        accessorKey: "blockedName",
        header: "Blocked",
        cell: ({ row }) => row.original.blockedName ?? row.original.blockedUserId
      },
      {
        accessorKey: "createdAt",
        header: "When",
        cell: ({ row }) => <RelativeTime value={row.original.createdAt} />
      }
    ],
    []
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Blocks"
        description="User-to-user blocks. Moderators use this to investigate patterns of abuse."
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
        emptyState={
          <div className="flex flex-col items-center gap-2 py-6 text-sm text-[var(--petto-muted)]">
            <ShieldAlert className="h-5 w-5" />
            <div>No blocks recorded.</div>
          </div>
        }
      />
    </div>
  );
}
