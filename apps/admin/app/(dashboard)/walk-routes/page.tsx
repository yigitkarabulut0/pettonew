"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Footprints, Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { RowActions } from "@/components/data-table/columns";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { useDataTable } from "@/components/data-table/useDataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api/client";

type WalkRoute = {
  id: string;
  name: string;
  description?: string;
  distance?: number;
  difficulty?: string;
  city?: string;
};

export default function WalkRoutesPage() {
  const { state, setState } = useDataTable();
  const qc = useQueryClient();
  const { confirm, node: confirmNode } = useConfirm();
  const [open, setOpen] = React.useState(false);

  const query = useQuery({
    queryKey: ["walk-routes", state],
    queryFn: async () => {
      const data = await apiRequest<WalkRoute[] | { data: WalkRoute[]; total: number }>(`/walk-routes`);
      return Array.isArray(data) ? { data, total: data.length } : data;
    }
  });

  const createMut = useMutation({
    mutationFn: (payload: Partial<WalkRoute>) =>
      apiRequest("/walk-routes", { method: "POST", body: payload }),
    onSuccess: () => {
      toast.success("Route added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["walk-routes"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest(`/walk-routes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["walk-routes"] });
    }
  });

  const columns = React.useMemo<ColumnDef<WalkRoute, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "city", header: "City" },
      { accessorKey: "distance", header: "Distance (km)" },
      { accessorKey: "difficulty", header: "Difficulty" },
      {
        id: "_actions",
        header: "",
        cell: ({ row }) => (
          <RowActions
            items={[
              {
                label: "Delete",
                destructive: true,
                onSelect: async () => {
                  await confirm({
                    title: "Delete route?",
                    destructive: true,
                    requireReason: false,
                    onConfirm: () => deleteMut.mutateAsync(row.original.id)
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
        title="Walk routes"
        description="Curated routes surfaced in the mobile app's discovery tab."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New route
          </Button>
        }
      />
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
            <Footprints className="h-5 w-5" />
            <div>No walk routes yet.</div>
          </div>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New walk route</DialogTitle>
          </DialogHeader>
          <RouteForm onSubmit={(values) => createMut.mutate(values)} pending={createMut.isPending} />
          <DialogFooter />
        </DialogContent>
      </Dialog>
      {confirmNode}
    </div>
  );
}

function RouteForm({
  onSubmit,
  pending
}: {
  onSubmit: (values: Partial<WalkRoute>) => void;
  pending: boolean;
}) {
  const [name, setName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [distance, setDistance] = React.useState("");
  const [difficulty, setDifficulty] = React.useState("easy");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>City</Label>
        <Input value={city} onChange={(e) => setCity(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Description</Label>
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Distance (km)</Label>
          <Input type="number" value={distance} onChange={(e) => setDistance(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Difficulty</Label>
          <Input value={difficulty} onChange={(e) => setDifficulty(e.target.value)} placeholder="easy / medium / hard" />
        </div>
      </div>
      <Button
        disabled={!name || pending}
        onClick={() =>
          onSubmit({
            name,
            city,
            description,
            distance: Number(distance) || 0,
            difficulty
          })
        }
      >
        {pending ? "Saving…" : "Add route"}
      </Button>
    </div>
  );
}
