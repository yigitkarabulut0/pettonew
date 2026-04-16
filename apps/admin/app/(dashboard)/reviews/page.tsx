"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Star } from "lucide-react";
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
  deleteAdminVenueReview,
  listAdminVenueReviews
} from "@/lib/api/moderation";

export default function ReviewsPage() {
  const { state, setState } = useDataTable();
  const qc = useQueryClient();
  const { confirm, node: confirmNode } = useConfirm();

  const query = useQuery({
    queryKey: ["venue-reviews", state],
    queryFn: () => listAdminVenueReviews(state)
  });

  const deleteMut = useMutation({
    mutationFn: deleteAdminVenueReview,
    onSuccess: () => {
      toast.success("Review removed");
      qc.invalidateQueries({ queryKey: ["venue-reviews"] });
    }
  });

  const columns = React.useMemo<ColumnDef<any, unknown>[]>(
    () => [
      { accessorKey: "venueName", header: "Venue", cell: ({ row }) => row.original.venueName ?? row.original.venueId },
      { accessorKey: "userName", header: "User", cell: ({ row }) => row.original.userName ?? row.original.userId },
      { accessorKey: "rating", header: "Rating", cell: ({ row }) => `${row.original.rating ?? "?"}/5` },
      {
        accessorKey: "comment",
        header: "Comment",
        cell: ({ row }) => (
          <span className="line-clamp-2 text-xs text-[var(--petto-muted)]">{row.original.comment}</span>
        )
      },
      {
        accessorKey: "createdAt",
        header: "When",
        cell: ({ row }) => <RelativeTime value={row.original.createdAt} />
      },
      {
        id: "_actions",
        header: "",
        cell: ({ row }) => (
          <RowActions
            items={[
              {
                label: "Delete review",
                destructive: true,
                onSelect: async () => {
                  await confirm({
                    title: "Delete this review?",
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
      <PageHeader title="Venue reviews" description="Moderate venue reviews — remove fake or abusive ones." />
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
            <Star className="h-5 w-5" />
            <div>No reviews to moderate.</div>
          </div>
        }
      />
      {confirmNode}
    </div>
  );
}
