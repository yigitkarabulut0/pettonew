"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LocationPicker, type LocationValue } from "@/components/common/LocationPicker";
import { createVenue, deleteVenue, getVenues } from "@/lib/admin-api";
import { uploadImageFile } from "@/lib/media";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-[var(--petto-border)] bg-white px-3 py-2 text-sm";

const CATEGORY_COLORS: Record<string, string> = {
  park: "bg-emerald-100 text-emerald-800",
  cafe: "bg-amber-100 text-amber-800",
  bar: "bg-violet-100 text-violet-800",
  beach: "bg-sky-100 text-sky-800",
  trail: "bg-lime-100 text-lime-800",
  other: "bg-gray-100 text-gray-700"
};

type VenueFormValues = {
  name: string;
  category: string;
  description: string;
  cityLabel: string;
  hours: string;
  imageUrl: string;
};

const EMPTY_LOCATION: LocationValue = {
  address: "",
  latitude: 0,
  longitude: 0,
  cityLabel: ""
};

export default function VenuesPage() {
  const queryClient = useQueryClient();

  const { data: venues = [], isLoading } = useQuery({
    queryKey: ["admin-venues"],
    queryFn: getVenues
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm<VenueFormValues>({
    defaultValues: { category: "park" }
  });

  /* ---- image upload state ---- */
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  /* ---- location state ---- */
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION);

  const handleLocationChange = (next: LocationValue) => {
    setLocation(next);
    // Opportunistically fill the city column from the Mapbox context, unless
    // the curator already typed their own value.
    if (next.cityLabel && !watch("cityLabel")) {
      setValue("cityLabel", next.cityLabel);
    }
  };

  /* ---- hours formatter ---- */
  const formatHours = (values: any) => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const parts = days
      .map((day) => {
        const open = values[`hours_${day}_open`];
        const close = values[`hours_${day}_close`];
        if (open && close) return `${day} ${open}-${close}`;
        return null;
      })
      .filter(Boolean);
    return parts.join(", ");
  };

  /* ---- mutations ---- */
  const createMutation = useMutation({
    mutationFn: async (values: VenueFormValues) => {
      let imageUrl = values.imageUrl;
      if (imageFile) {
        setUploading(true);
        try {
          imageUrl = await uploadImageFile(imageFile, "venues");
        } finally {
          setUploading(false);
        }
      }
      return createVenue({
        ...values,
        address: location.address,
        hours: formatHours(values),
        latitude: location.latitude,
        longitude: location.longitude,
        imageUrl: imageUrl || undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      reset();
      setImageFile(null);
      setImagePreview("");
      setLocation(EMPTY_LOCATION);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (venueId: string) => deleteVenue(venueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    }
  });

  /* ---- render ---- */
  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          Explore venues
        </p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight text-[var(--foreground)]">
          Curate pet-friendly places for the map
        </h1>
      </Card>

      {/* Create Form */}
      <Card>
        <form
          className="grid gap-3 lg:grid-cols-2"
          onSubmit={handleSubmit((values) => createMutation.mutate(values))}
        >
          {/* Name */}
          <Input placeholder="Venue name" {...register("name")} />

          {/* Category */}
          <select className={SELECT_CLASS} {...register("category")}>
            <option value="park">Park</option>
            <option value="cafe">Cafe</option>
            <option value="bar">Bar</option>
            <option value="beach">Beach</option>
            <option value="trail">Trail</option>
            <option value="other">Other</option>
          </select>

          {/* City */}
          <Input placeholder="City" {...register("cityLabel")} />

          {/* Placeholder col so the grid stays 2-wide on lg */}
          <div />

          {/* Location picker — address + map + draggable marker */}
          <div className="lg:col-span-2">
            <LocationPicker
              value={location}
              onChange={handleLocationChange}
              markerColor="#6d28d9"
              label="Address"
              placeholder="Address (start typing to search)"
              mapHeight={360}
            />
          </div>

          {/* Operating Hours */}
          <div className="space-y-2 lg:col-span-2">
            <label className="text-sm font-semibold text-[var(--petto-ink)]">
              Operating Hours
            </label>
            <div className="grid gap-2">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div key={day} className="flex items-center gap-3">
                  <span className="w-10 text-sm font-medium text-[var(--petto-muted)]">
                    {day}
                  </span>
                  <input
                    type="time"
                    className="rounded-lg border border-[var(--petto-border)] bg-white px-3 py-1.5 text-sm"
                    {...register(`hours_${day}_open` as any)}
                  />
                  <span className="text-sm text-[var(--petto-muted)]">to</span>
                  <input
                    type="time"
                    className="rounded-lg border border-[var(--petto-border)] bg-white px-3 py-1.5 text-sm"
                    {...register(`hours_${day}_close` as any)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Image Upload */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--petto-ink)]">Venue Image</label>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer rounded-md border border-dashed border-[var(--petto-border)] px-4 py-3 text-sm text-[var(--petto-muted)] hover:border-[var(--petto-primary)]">
                {imageFile ? imageFile.name : "Choose image..."}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageSelect}
                />
              </label>
              {imagePreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagePreview}
                  className="h-12 w-12 rounded-lg object-cover"
                  alt="Preview"
                />
              )}
            </div>
            {uploading && (
              <p className="text-xs text-amber-600 animate-pulse">Uploading image...</p>
            )}
          </div>

          {/* Description */}
          <div className="lg:col-span-2">
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-[var(--petto-border)] bg-white px-3 py-2 text-sm placeholder:text-[var(--petto-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--petto-primary)] focus-visible:ring-offset-2"
              placeholder="Description"
              {...register("description")}
            />
          </div>

          {/* Submit */}
          <div className="lg:col-span-2">
            <Button type="submit" disabled={createMutation.isPending || uploading}>
              {createMutation.isPending || uploading ? "Adding..." : "Add venue"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--petto-primary)] border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && venues.length === 0 && (
        <div className="rounded-md border border-dashed border-[var(--petto-border)] bg-white/60 px-4 py-12 text-center text-sm text-[var(--petto-muted)]">
          No venues found. Add your first pet-friendly venue above.
        </div>
      )}

      {/* Venue grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {venues.map((venue) => (
          <Card key={venue.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-[var(--petto-ink)]">{venue.name}</p>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      CATEGORY_COLORS[venue.category] ?? CATEGORY_COLORS.other
                    }`}
                  >
                    {venue.category}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--petto-muted)]">{venue.cityLabel}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/venues/${venue.id}`}>
                  <Button
                    variant="ghost"
                    className="text-[var(--petto-primary)] hover:text-[var(--petto-primary)]"
                  >
                    View Details
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  className="shrink-0 text-rose-700 hover:text-rose-800"
                  onClick={() => deleteMutation.mutate(venue.id)}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </Button>
              </div>
            </div>

            {venue.address && (
              <p className="mt-2 text-sm text-[var(--petto-ink)]">{venue.address}</p>
            )}

            {venue.hours && (
              <p className="mt-1 text-xs text-[var(--petto-muted)]">{venue.hours}</p>
            )}

            {venue.description && (
              <p className="mt-3 text-sm leading-7 text-[var(--petto-muted)]">
                {venue.description}
              </p>
            )}

            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--petto-muted)]">
              {venue.currentCheckIns.length} live check-ins
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
