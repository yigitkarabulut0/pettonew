"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { PawPrint } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { RowActions } from "@/components/data-table/columns";
import { useDataTable } from "@/components/data-table/useDataTable";
import type { Pet } from "@petto/contracts";
import { getPets, updatePetVisibility } from "@/lib/admin-api";

export default function PetsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { state, setState, selection, setSelection } = useDataTable();

  const query = useQuery({ queryKey: ["admin-pets"], queryFn: getPets });
  const mutation = useMutation({
    mutationFn: ({ petId, hidden }: { petId: string; hidden: boolean }) =>
      updatePetVisibility(petId, hidden),
    onSuccess: () => {
      toast.success("Visibility updated");
      qc.invalidateQueries({ queryKey: ["admin-pets"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const all = query.data ?? [];
  const filtered = React.useMemo(() => {
    const q = state.search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) =>
      [p.name, p.breedLabel, p.speciesLabel, p.cityLabel, p.bio].some((v) =>
        v?.toLowerCase().includes(q)
      )
    );
  }, [all, state.search]);
  const paged = React.useMemo(() => {
    const start = (state.page - 1) * state.pageSize;
    return filtered.slice(start, start + state.pageSize);
  }, [filtered, state.page, state.pageSize]);

  const columns = React.useMemo<ColumnDef<Pet, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Pet",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--muted)] text-[var(--muted-foreground)]">
              <PawPrint className="h-3.5 w-3.5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-medium text-[var(--foreground)]">{row.original.name}</div>
              <div className="text-[11px] text-[var(--muted-foreground)]">
                {row.original.speciesLabel || "—"} · {row.original.breedLabel || "mixed"}
              </div>
            </div>
          </div>
        )
      },
      {
        accessorKey: "cityLabel",
        header: "City",
        cell: ({ row }) => (
          <span className="text-xs text-[var(--muted-foreground)]">{row.original.cityLabel || "—"}</span>
        )
      },
      {
        accessorKey: "isHidden",
        header: "Visibility",
        cell: ({ row }) => (
          <StatusBadge status={row.original.isHidden ? "hidden" : "active"} />
        )
      },
      {
        accessorKey: "ageYears",
        header: "Age",
        cell: ({ row }) => (
          <span className="text-xs text-[var(--muted-foreground)]">
            {row.original.ageYears != null ? `${row.original.ageYears}y` : "—"}
          </span>
        )
      },
      {
        id: "_actions",
        header: "",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <RowActions
              items={[
                { label: "View details", href: `/pets/${p.id}` },
                {
                  label: p.isHidden ? "Show in discovery" : "Hide from discovery",
                  onSelect: () => mutation.mutate({ petId: p.id, hidden: !p.isHidden })
                }
              ]}
            />
          );
        }
      }
    ],
    [mutation]
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Pets"
        description="Every pet profile in the network. Toggle visibility, open a pet for health and album moderation."
      />
      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
        searchPlaceholder="Search by name, breed, or city"
      />
      <DataTable<Pet>
        data={paged}
        columns={columns}
        rowId={(row) => row.id}
        total={filtered.length}
        state={state}
        onStateChange={setState}
        loading={query.isLoading}
        selection={selection}
        onSelectionChange={setSelection}
        onRowClick={(row) => router.push(`/pets/${row.id}`)}
      />
    </div>
  );
}
