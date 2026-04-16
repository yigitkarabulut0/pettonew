"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardCheck } from "lucide-react";
import * as React from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { useDataTable } from "@/components/data-table/useDataTable";
import { Badge } from "@/components/ui/badge";
import { listAuditLogs, type AuditLog } from "@/lib/api/system";

export default function AuditLogsPage() {
  const { state, setState } = useDataTable();

  const query = useQuery({
    queryKey: ["audit-logs", state],
    queryFn: () => listAuditLogs(state)
  });

  const columns = React.useMemo<ColumnDef<AuditLog, unknown>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "When",
        cell: ({ row }) => <RelativeTime value={row.original.createdAt} />
      },
      {
        accessorKey: "actorName",
        header: "Admin",
        cell: ({ row }) => (
          <div className="text-sm">{row.original.actorName ?? row.original.actorAdminId}</div>
        )
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => <Badge tone="info">{row.original.action}</Badge>
      },
      {
        accessorKey: "entityType",
        header: "Target",
        cell: ({ row }) => (
          <div className="text-xs text-[var(--petto-muted)]">
            {row.original.entityType}
            {row.original.entityId ? `:${row.original.entityId}` : ""}
          </div>
        )
      },
      {
        accessorKey: "payload",
        header: "Payload",
        cell: ({ row }) =>
          row.original.payload ? (
            <details>
              <summary className="cursor-pointer text-xs text-[var(--petto-muted)]">view</summary>
              <pre className="mt-1 max-w-md overflow-auto rounded bg-[var(--petto-card)]/60 p-2 text-[11px]">
                {JSON.stringify(row.original.payload, null, 2)}
              </pre>
            </details>
          ) : null
      }
    ],
    []
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Audit logs"
        description="Every destructive admin action is recorded here with actor, target, and diff."
      />
      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
        searchPlaceholder="Search action or entity"
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
            <ClipboardCheck className="h-5 w-5" />
            <div>No audit entries in this window.</div>
          </div>
        }
      />
    </div>
  );
}
