"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import type { ExploreVenue } from "@petto/contracts";
import { MapPin, Plus, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { LocationPicker, type LocationValue } from "@/components/common/LocationPicker";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { RowActions } from "@/components/data-table/columns";
import { useDataTable } from "@/components/data-table/useDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { createVenue, deleteVenue, getVenues } from "@/lib/admin-api";
import { uploadImageFile } from "@/lib/media";
import { cn } from "@/lib/utils";

/** Every category maps to a shadcn Badge tone so the list reads at a glance. */
const CATEGORY_TONES: Record<string, "brand" | "success" | "warning" | "info" | "neutral"> = {
  park: "success",
  cafe: "warning",
  bar: "brand",
  beach: "info",
  trail: "success",
  other: "neutral"
};

const CATEGORY_OPTIONS = ["park", "cafe", "bar", "beach", "trail", "other"] as const;

type VenueFormValues = {
  name: string;
  category: string;
  description: string;
  cityLabel: string;
} & Record<`hours_${string}_open` | `hours_${string}_close`, string>;

const EMPTY_LOCATION: LocationValue = {
  address: "",
  latitude: 0,
  longitude: 0,
  cityLabel: ""
};

function formatHours(values: VenueFormValues) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days
    .map((day) => {
      const open = values[`hours_${day}_open`];
      const close = values[`hours_${day}_close`];
      return open && close ? `${day} ${open}-${close}` : null;
    })
    .filter(Boolean)
    .join(", ");
}

export default function VenuesPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { state, setState } = useDataTable({ pageSize: 20 });
  const { confirm, node: confirmNode } = useConfirm();

  const { data: venues = [], isLoading } = useQuery({
    queryKey: ["admin-venues"],
    queryFn: getVenues
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string>("");
  const [uploading, setUploading] = React.useState(false);
  const [location, setLocation] = React.useState<LocationValue>(EMPTY_LOCATION);

  const { register, handleSubmit, reset, setValue, watch } =
    useForm<VenueFormValues>({ defaultValues: { category: "park" } });
  const categoryValue = watch("category") ?? "park";

  const filtered = React.useMemo(() => {
    const q = state.search.trim().toLowerCase();
    if (!q) return venues;
    return venues.filter((v) =>
      [v.name, v.cityLabel, v.address, v.category].some((field) =>
        field?.toLowerCase().includes(q)
      )
    );
  }, [venues, state.search]);

  const paged = React.useMemo(() => {
    const start = (state.page - 1) * state.pageSize;
    return filtered.slice(start, start + state.pageSize);
  }, [filtered, state.page, state.pageSize]);

  const createMutation = useMutation({
    mutationFn: async (values: VenueFormValues) => {
      let imageUrl: string | undefined;
      if (imageFile) {
        setUploading(true);
        try {
          imageUrl = await uploadImageFile(imageFile, "venues");
        } finally {
          setUploading(false);
        }
      }
      return createVenue({
        name: values.name,
        category: values.category,
        description: values.description,
        cityLabel: values.cityLabel,
        address: location.address,
        hours: formatHours(values),
        latitude: location.latitude,
        longitude: location.longitude,
        imageUrl
      });
    },
    onSuccess: () => {
      toast.success("Venue added");
      queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      reset({ category: "park" });
      setImageFile(null);
      setImagePreview("");
      setLocation(EMPTY_LOCATION);
      setFormOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const deleteMutation = useMutation({
    mutationFn: (venueId: string) => deleteVenue(venueId),
    onSuccess: () => {
      toast.success("Venue deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleLocationChange = (next: LocationValue) => {
    setLocation(next);
    if (next.cityLabel && !watch("cityLabel")) {
      setValue("cityLabel", next.cityLabel);
    }
  };

  const columns = React.useMemo<ColumnDef<ExploreVenue, unknown>[]>(
    () => [
      {
        id: "thumbnail",
        header: "",
        cell: ({ row }) => <VenueThumb venue={row.original} />
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => {
          const v = row.original;
          return (
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="truncate text-sm font-medium text-[var(--foreground)]">
                {v.name}
              </span>
              {v.hours ? (
                <span className="truncate text-[11px] text-[var(--muted-foreground)]">
                  {v.hours}
                </span>
              ) : null}
            </div>
          );
        }
      },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => (
          <Badge tone={CATEGORY_TONES[row.original.category] ?? "neutral"}>
            {row.original.category}
          </Badge>
        )
      },
      {
        accessorKey: "cityLabel",
        header: "Location",
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-[var(--foreground)]">
              {row.original.cityLabel || "—"}
            </span>
            {row.original.address ? (
              <span className="truncate text-[11px] text-[var(--muted-foreground)] max-w-[240px]">
                {row.original.address}
              </span>
            ) : null}
          </div>
        )
      },
      {
        id: "checkIns",
        header: "Live",
        cell: ({ row }) => {
          const count = row.original.currentCheckIns.length;
          return (
            <div className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
              <Users className="h-3.5 w-3.5" />
              {count}
            </div>
          );
        }
      },
      {
        id: "_actions",
        header: "",
        cell: ({ row }) => {
          const venue = row.original;
          return (
            <RowActions
              items={[
                {
                  label: "View details",
                  onSelect: () => router.push(`/venues/${venue.id}`)
                },
                {
                  label: "Delete",
                  destructive: true,
                  onSelect: () => {
                    confirm({
                      title: `Delete ${venue.name}?`,
                      description:
                        "Removes the venue from the map and unlinks any posts tagged to it.",
                      confirmLabel: "Delete",
                      destructive: true,
                      onConfirm: () => deleteMutation.mutateAsync(venue.id)
                    });
                  }
                }
              ]}
            />
          );
        }
      }
    ],
    [router, confirm, deleteMutation]
  );

  return (
    <div className="space-y-5">
      {confirmNode}

      <PageHeader
        title="Venues"
        description="Curate pet-friendly places surfaced on the Discover map."
        actions={
          <Button
            onClick={() => setFormOpen((v) => !v)}
            className={cn("gap-2", formOpen ? "opacity-80" : undefined)}
          >
            {formOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {formOpen ? "Close" : "New venue"}
          </Button>
        }
      />

      {formOpen ? (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Create venue</h2>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            Image auto-optimises to WebP. Address, city & coordinates lock in from the map.
          </p>
          <form
            className="mt-4 grid gap-3 lg:grid-cols-2"
            onSubmit={handleSubmit((values) => createMutation.mutate(values))}
          >
            <Input placeholder="Venue name" {...register("name")} />

            <Select
              value={categoryValue}
              onValueChange={(v) => setValue("category", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input placeholder="City" {...register("cityLabel")} />
            <div />

            <div className="lg:col-span-2">
              <LocationPicker
                value={location}
                onChange={handleLocationChange}
                markerColor="#6d28d9"
                label="Address"
                placeholder="Address (start typing to search)"
                mapHeight={320}
              />
            </div>

            <div className="lg:col-span-2 space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                Operating hours
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                  <div
                    key={day}
                    className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                  >
                    <span className="w-10 text-xs font-medium text-[var(--muted-foreground)]">
                      {day}
                    </span>
                    <input
                      type="time"
                      className="flex-1 rounded-sm border border-transparent bg-transparent px-1 text-xs focus:outline-none focus:border-[var(--border)]"
                      {...register(`hours_${day}_open` as any)}
                    />
                    <span className="text-[10px] text-[var(--muted-foreground)]">to</span>
                    <input
                      type="time"
                      className="flex-1 rounded-sm border border-transparent bg-transparent px-1 text-xs focus:outline-none focus:border-[var(--border)]"
                      {...register(`hours_${day}_close` as any)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                Venue image
              </label>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-xs text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)]">
                  <Plus className="h-3.5 w-3.5" />
                  {imageFile ? imageFile.name : "Choose image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                </label>
                {imagePreview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={imagePreview}
                    className="h-12 w-12 rounded-md object-cover ring-1 ring-[var(--border)]"
                    alt="Preview"
                  />
                ) : null}
              </div>
              {uploading ? (
                <p className="animate-pulse text-[11px] text-[var(--warning)]">
                  Uploading image…
                </p>
              ) : null}
            </div>

            <div className="lg:col-span-2">
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-1"
                placeholder="Description"
                {...register("description")}
              />
            </div>

            <div className="flex gap-2 lg:col-span-2">
              <Button
                type="submit"
                disabled={createMutation.isPending || uploading}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                {createMutation.isPending || uploading ? "Adding…" : "Add venue"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFormOpen(false);
                  reset({ category: "park" });
                  setImageFile(null);
                  setImagePreview("");
                  setLocation(EMPTY_LOCATION);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(search) => setState({ search, page: 1 })}
        searchPlaceholder="Search venues by name, city, address…"
      />

      <DataTable<ExploreVenue>
        data={paged}
        columns={columns}
        rowId={(v) => v.id}
        total={filtered.length}
        state={state}
        onStateChange={setState}
        loading={isLoading}
        selectable={false}
        onRowClick={(venue) => router.push(`/venues/${venue.id}`)}
        emptyState={
          <EmptyState
            icon={MapPin}
            title={state.search ? "No matching venues" : "No venues yet"}
            description={
              state.search
                ? "Try a different search term."
                : "Add the first pet-friendly spot to seed the Discover map."
            }
            action={
              !state.search ? (
                <Button size="sm" onClick={() => setFormOpen(true)} className="gap-2">
                  <Plus className="h-3.5 w-3.5" />
                  New venue
                </Button>
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}

function VenueThumb({ venue }: { venue: ExploreVenue }) {
  if (venue.imageUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={venue.imageUrl}
        alt=""
        className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-[var(--border)]"
      />
    );
  }
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1 ring-[var(--border)]",
        "bg-[var(--muted)] text-[var(--muted-foreground)]"
      )}
    >
      <MapPin className="h-4 w-4" />
    </div>
  );
}
