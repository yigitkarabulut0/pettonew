"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Store } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { RowActions } from "@/components/data-table/columns";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { useDataTable } from "@/components/data-table/useDataTable";
import {
  deleteAdminVenueCheckIn,
  listAdminVenueCheckIns
} from "@/lib/api/moderation";

export default function CheckInsPage() {
  const { state, setState } = useDataTable();
  const qc = useQueryClient();
  const { confirm, node: confirmNode } = useConfirm();

  const query = useQuery({
    queryKey: ["check-ins", state],
    queryFn: () => listAdminVenueCheckIns(state)
  });

  const deleteMut = useMutation({
    mutationFn: deleteAdminVenueCheckIn,
    onSuccess: () => {
      toast.success("Check-in removed");
      qc.invalidateQueries({ queryKey: ["check-ins"] });
    }
  });

  const columns = React.useMemo<ColumnDef<any, unknown>[]>(
    () => [
      { accessorKey: "venueName", header: "Venue", cell: ({ row }) => row.original.venueName ?? row.original.venueId },
      { accessorKey: "userName", header: "User", cell: ({ row }) => row.original.userName ?? row.original.userId },
      { accessorKey: "petCount", header: "Pets" },
      {
        accessorKey: "checkedInAt",
        header: "When",
        cell: ({ row }) => <RelativeTime value={row.original.checkedInAt ?? row.original.createdAt} />
      },
      {
        id: "_actions",
        header: "",
        cell: ({ row }) => (
          <RowActions
            items={[
              {
                label: "Remove check-in",
                destructive: true,
                onSelect: async () => {
                  await confirm({
                    title: "Remove this check-in?",
                    destructive: true,
                    requireReason: true,
                    onConfirm: async () => deleteMut.mutateAsync(row.original.id)
                  });
                }
              }
            ]}
          />
        )
      }
    ],
    [confirm, deleteMut]
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Check-ins" description="Remove check-ins that violate community guidelines." />
      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
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
            <Store className="h-5 w-5" />
            <div>No check-ins to show.</div>
          </div>
        }
      />
      {confirmNode}
    </div>
  );
}
