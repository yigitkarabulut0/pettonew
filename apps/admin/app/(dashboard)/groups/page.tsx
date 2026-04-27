"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Globe,
  Hash,
  Lock,
  MapPin,
  PawPrint,
  Plus,
  Users
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog";
import { LocationPicker, type LocationValue } from "@/components/common/LocationPicker";
import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { StatCard } from "@/components/common/StatCard";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar, FacetFilter } from "@/components/data-table/DataTableToolbar";
import { RowActions } from "@/components/data-table/columns";
import { useDataTable } from "@/components/data-table/useDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type AdminGroupListItem,
  createAdminGroup,
  deleteAdminGroup,
  getAdminGroups,
  getTaxonomy
} from "@/lib/admin-api";

interface GroupFormValues {
  name: string;
  description: string;
  petType: string;
  cityLabel: string;
  code: string;
  isPrivate: boolean;
}

const EMPTY_LOCATION: LocationValue = {
  address: "",
  latitude: 0,
  longitude: 0,
  cityLabel: ""
};

export default function GroupsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { state, setState, selection, setSelection } = useDataTable();
  const { confirm, node: confirmNode } = useConfirm();

  const [createOpen, setCreateOpen] = React.useState(false);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["admin-groups"],
    queryFn: getAdminGroups
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAdminGroup(id),
    onSuccess: () => {
      toast.success("Group deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const petType = (state.filters.petType as string | undefined) ?? undefined;
  const visibility = (state.filters.visibility as string | undefined) ?? undefined;

  const filtered = React.useMemo(() => {
    const q = state.search.trim().toLowerCase();
    return groups.filter((g) => {
      if (petType && g.petType !== petType) return false;
      if (visibility === "private" && !g.isPrivate) return false;
      if (visibility === "public" && g.isPrivate) return false;
      if (q && ![g.name, g.description, g.cityLabel].some((v) => v?.toLowerCase().includes(q))) {
        return false;
      }
      return true;
    });
  }, [groups, state.search, petType, visibility]);

  const paged = React.useMemo(() => {
    const start = (state.page - 1) * state.pageSize;
    return filtered.slice(start, start + state.pageSize);
  }, [filtered, state.page, state.pageSize]);

  const totalMembers = React.useMemo(
    () => groups.reduce((sum, g) => sum + (g.memberCount ?? 0), 0),
    [groups]
  );
  const privateCount = groups.filter((g) => g.isPrivate).length;

  const columns = React.useMemo<ColumnDef<AdminGroupListItem, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Group",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]">
              {row.original.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.original.imageUrl}
                  alt={row.original.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className="h-full w-full"
                  style={{ background: "linear-gradient(135deg,#E6694A 0%,#21433C 100%)" }}
                />
              )}
            </div>
            <div className="min-w-0">
              <Link
                href={`/groups/${row.original.id}`}
                className="block truncate text-sm font-medium text-[var(--foreground)] hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {row.original.name}
              </Link>
              {row.original.description ? (
                <p className="truncate text-[11px] text-[var(--muted-foreground)]">
                  {row.original.description}
                </p>
              ) : null}
            </div>
          </div>
        )
      },
      {
        accessorKey: "petType",
        header: "Pet type",
        cell: ({ row }) => (
          <Badge tone="neutral">
            <PawPrint className="h-3 w-3" /> {row.original.petType || "all"}
          </Badge>
        )
      },
      {
        accessorKey: "cityLabel",
        header: "City",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
            <MapPin className="h-3 w-3" /> {row.original.cityLabel || "—"}
          </span>
        )
      },
      {
        accessorKey: "memberCount",
        header: "Members",
        cell: ({ row }) => (
          <Badge tone={row.original.memberCount > 0 ? "success" : "neutral"}>
            <Users className="h-3 w-3" /> {row.original.memberCount}
          </Badge>
        )
      },
      {
        accessorKey: "isPrivate",
        header: "Visibility",
        cell: ({ row }) =>
          row.original.isPrivate ? (
            <Badge tone="warning">
              <Lock className="h-3 w-3" /> private
            </Badge>
          ) : (
            <Badge tone="neutral">
              <Globe className="h-3 w-3" /> public
            </Badge>
          )
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => <RelativeTime value={row.original.createdAt} />
      },
      {
        id: "_actions",
        header: "",
        cell: ({ row }) => (
          <RowActions
            items={[
              {
                label: "Open",
                onSelect: () => router.push(`/groups/${row.original.id}`)
              },
              {
                label: "Delete group",
                destructive: true,
                onSelect: async () => {
                  await confirm({
                    title: "Delete this group?",
                    description: "All members lose access. This cannot be undone.",
                    destructive: true,
                    requireReason: true,
                    confirmLabel: "Delete",
                    onConfirm: () => deleteMut.mutateAsync(row.original.id)
                  });
                }
              }
            ]}
          />
        )
      }
    ],
    [confirm, deleteMut, router]
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Groups"
        description="Community groups for pet owners. Click a row to inspect members and watch the chat live."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New group
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Groups" value={groups.length.toLocaleString()} icon={Hash} />
        <StatCard
          label="Members (total)"
          value={totalMembers.toLocaleString()}
          icon={Users}
          tone={totalMembers > 0 ? "success" : "neutral"}
        />
        <StatCard
          label="Private groups"
          value={privateCount.toLocaleString()}
          icon={Lock}
          tone={privateCount > 0 ? "warning" : "neutral"}
        />
      </section>

      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
        searchPlaceholder="Search name, description, city"
      >
        <FacetFilter
          label="Pet type"
          value={petType}
          onChange={(value) =>
            setState({ filters: { ...state.filters, petType: value ?? "" }, page: 1 })
          }
          options={[
            { value: "all", label: "All" },
            { value: "dog", label: "Dog" },
            { value: "cat", label: "Cat" },
            { value: "bird", label: "Bird" }
          ]}
        />
        <FacetFilter
          label="Visibility"
          value={visibility}
          onChange={(value) =>
            setState({ filters: { ...state.filters, visibility: value ?? "" }, page: 1 })
          }
          options={[
            { value: "public", label: "Public" },
            { value: "private", label: "Private" }
          ]}
        />
      </DataTableToolbar>

      <DataTable<AdminGroupListItem>
        data={paged}
        columns={columns}
        rowId={(row) => row.id}
        total={filtered.length}
        state={state}
        onStateChange={setState}
        loading={isLoading}
        selection={selection}
        onSelectionChange={setSelection}
        onRowClick={(row) => router.push(`/groups/${row.id}`)}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-6 text-sm text-[var(--muted-foreground)]">
            <Users className="h-5 w-5" />
            <div>No groups match your filters yet.</div>
          </div>
        }
      />

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
      {confirmNode}
    </div>
  );
}

function CreateGroupDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, setValue, watch } = useForm<GroupFormValues>({
    defaultValues: {
      name: "",
      description: "",
      petType: "all",
      cityLabel: "",
      code: "",
      isPrivate: false
    }
  });
  const [location, setLocation] = React.useState<LocationValue>(EMPTY_LOCATION);
  const { data: speciesList = [] } = useQuery({
    queryKey: ["taxonomy", "species"],
    queryFn: () => getTaxonomy("species")
  });

  const createMutation = useMutation({
    mutationFn: (values: GroupFormValues) =>
      createAdminGroup({
        name: values.name,
        description: values.description,
        petType: values.petType,
        cityLabel: values.cityLabel || undefined,
        latitude: location.latitude,
        longitude: location.longitude,
        code: values.code || undefined,
        isPrivate: values.isPrivate
      }),
    onSuccess: () => {
      toast.success("Group created");
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
      reset();
      setLocation(EMPTY_LOCATION);
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const handleLocationChange = (next: LocationValue) => {
    setLocation(next);
    if (next.cityLabel && !watch("cityLabel")) {
      setValue("cityLabel", next.cityLabel);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>
            Create a community group. Private groups stay hidden from public discovery and need a
            join code.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={handleSubmit((values) => createMutation.mutate(values))}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label>Name</Label>
              <Input placeholder="Group name" {...register("name", { required: true })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Pet type</Label>
              <select
                className="flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                {...register("petType")}
              >
                <option value="all">All pets</option>
                {speciesList.map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Description</Label>
            <Textarea
              rows={2}
              placeholder="What is this group about?"
              {...register("description", { required: true })}
            />
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)] p-3">
            <Label className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
              Location
            </Label>
            <LocationPicker
              value={location}
              onChange={handleLocationChange}
              markerColor="#E6694A"
              label="Group base location"
              placeholder="Search a city or neighbourhood…"
              mapHeight={220}
            />
            <Input placeholder="City label" {...register("cityLabel")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label>Join code</Label>
              <Input placeholder="(optional, e.g. PET-1234)" {...register("code")} />
            </div>
            <label className="flex cursor-pointer items-center gap-2 self-end rounded-md border border-[var(--border)] px-3 py-2 text-sm">
              <input
                type="checkbox"
                {...register("isPrivate")}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              Private group
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
