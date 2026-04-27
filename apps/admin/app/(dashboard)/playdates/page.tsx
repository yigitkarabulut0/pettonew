"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Calendar, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { useDataTable } from "@/components/data-table/useDataTable";
import { Badge } from "@/components/ui/badge";
import { getAdminPlaydates } from "@/lib/admin-api";

type Playdate = {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  maxPets: number;
  attendees: string[];
  createdAt: string;
};

export default function PlaydatesPage() {
  const { state, setState, selection, setSelection } = useDataTable();
  const router = useRouter();
  const query = useQuery({ queryKey: ["admin-playdates"], queryFn: getAdminPlaydates });

  const all = (query.data as Playdate[] | undefined) ?? [];
  const filtered = React.useMemo(() => {
    const q = state.search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) =>
      [p.title, p.description, p.location].some((v) => v?.toLowerCase().includes(q))
    );
  }, [all, state.search]);
  const paged = React.useMemo(() => {
    const start = (state.page - 1) * state.pageSize;
    return filtered.slice(start, start + state.pageSize);
  }, [filtered, state.page, state.pageSize]);

  const columns = React.useMemo<ColumnDef<Playdate, unknown>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <Link
            href={`/playdates/${row.original.id}`}
            className="text-sm font-medium text-[var(--foreground)] hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.title}
          </Link>
        )
      },
      {
        accessorKey: "location",
        header: "Location",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
            <MapPin className="h-3 w-3" /> {row.original.location || "—"}
          </span>
        )
      },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }) => <RelativeTime value={row.original.date} />
      },
      {
        accessorKey: "attendees",
        header: "Attendees",
        cell: ({ row }) => (
          <Badge tone="neutral">
            {row.original.attendees?.length ?? 0}/{row.original.maxPets}
          </Badge>
        )
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => <RelativeTime value={row.original.createdAt} />
      }
    ],
    []
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Playdates"
        description="All user-organized pet meetups. Use the row menu to edit or cancel."
      />
      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
        searchPlaceholder="Search title, description, location"
      />
      <DataTable<Playdate>
        data={paged}
        columns={columns}
        rowId={(row) => row.id}
        total={filtered.length}
        state={state}
        onStateChange={setState}
        loading={query.isLoading}
        selection={selection}
        onSelectionChange={setSelection}
        onRowClick={(row) => router.push(`/playdates/${row.id}`)}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-6 text-sm text-[var(--muted-foreground)]">
            <Calendar className="h-5 w-5" />
            <div>No playdates yet.</div>
          </div>
        }
      />
    </div>
  );
}
