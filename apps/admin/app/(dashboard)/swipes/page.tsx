"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Tag } from "lucide-react";
import * as React from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar, FacetFilter } from "@/components/data-table/DataTableToolbar";
import { useDataTable } from "@/components/data-table/useDataTable";
import { Badge } from "@/components/ui/badge";
import { listAdminSwipes, type AdminSwipe } from "@/lib/api/moderation";

export default function SwipesPage() {
  const { state, setState } = useDataTable();

  const query = useQuery({
    queryKey: ["swipes", state],
    queryFn: () => listAdminSwipes(state)
  });

  const direction = (state.filters.direction as string | undefined) ?? undefined;

  const columns = React.useMemo<ColumnDef<AdminSwipe, unknown>[]>(
    () => [
      { accessorKey: "actorPetId", header: "Actor pet" },
      { accessorKey: "targetPetId", header: "Target pet" },
      {
        accessorKey: "direction",
        header: "Direction",
        cell: ({ row }) => (
          <Badge
            tone={
              row.original.direction === "like"
                ? "success"
                : row.original.direction === "super-like"
                  ? "brand"
                  : "neutral"
            }
          >
            {row.original.direction}
          </Badge>
        )
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
        title="Swipes"
        description="Read-only stream of pet swipes — useful for debugging the discovery algorithm."
      />
      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
        searchPlaceholder="Search by pet id"
      >
        <FacetFilter
          label="Direction"
          value={direction}
          onChange={(value) => setState({ filters: { direction: value ?? "" }, page: 1 })}
          options={[
            { value: "like", label: "Like" },
            { value: "pass", label: "Pass" },
            { value: "super-like", label: "Super-like" }
          ]}
        />
      </DataTableToolbar>
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
            <Tag className="h-5 w-5" />
            <div>No swipes recorded.</div>
          </div>
        }
      />
    </div>
  );
}
