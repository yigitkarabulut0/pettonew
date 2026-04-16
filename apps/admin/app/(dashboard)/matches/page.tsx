"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { HeartCrack } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { RowActions } from "@/components/data-table/columns";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { useDataTable } from "@/components/data-table/useDataTable";
import { deleteAdminMatch, listAdminMatches, type AdminMatch } from "@/lib/api/moderation";

export default function MatchesPage() {
  const { state, setState, selection, setSelection } = useDataTable();
  const qc = useQueryClient();
  const { confirm, node: confirmNode } = useConfirm();

  const query = useQuery({
    queryKey: ["matches", state],
    queryFn: () => listAdminMatches(state)
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => deleteAdminMatch(id, reason),
    onSuccess: () => {
      toast.success("Match removed");
      qc.invalidateQueries({ queryKey: ["matches"] });
    }
  });

  const columns = React.useMemo<ColumnDef<AdminMatch, unknown>[]>(
    () => [
      {
        accessorKey: "petAName",
        header: "Pet A",
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.petAName ?? row.original.petAId}
          </div>
        )
      },
      {
        accessorKey: "petBName",
        header: "Pet B",
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.petBName ?? row.original.petBId}
          </div>
        )
      },
      {
        accessorKey: "matchedAt",
        header: "Matched",
        cell: ({ row }) => <RelativeTime value={row.original.matchedAt} />
      },
      {
        accessorKey: "lastInteractionAt",
        header: "Last interaction",
        cell: ({ row }) => <RelativeTime value={row.original.lastInteractionAt} />
      },
      {
        id: "_actions",
        header: "",
        cell: ({ row }) => (
          <RowActions
            items={[
              {
                label: "Unmatch",
                destructive: true,
                onSelect: async () => {
                  await confirm({
                    title: "Unmatch these pets?",
                    description: "Both users will lose access to the conversation.",
                    destructive: true,
                    requireReason: true,
                    onConfirm: (reason) =>
                      deleteMut.mutateAsync({ id: row.original.id, reason })
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
      <PageHeader
        title="Matches"
        description="Inspect the matching graph. Use unmatch to resolve escalated safety reports."
      />
      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
        searchPlaceholder="Search by user or pet id"
      />
      <DataTable
        data={query.data?.data ?? []}
        columns={columns}
        rowId={(row) => row.id}
        total={query.data?.total}
        state={state}
        onStateChange={setState}
        loading={query.isLoading}
        selection={selection}
        onSelectionChange={setSelection}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-6 text-sm text-[var(--petto-muted)]">
            <HeartCrack className="h-5 w-5" />
            <div>No matches in this window.</div>
          </div>
        }
      />
      {confirmNode}
    </div>
  );
}
