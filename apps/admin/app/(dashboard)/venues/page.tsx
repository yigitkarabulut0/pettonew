"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import "mapbox-gl/dist/mapbox-gl.css";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminPresignUpload, createVenue, deleteVenue, getVenues } from "@/lib/admin-api";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const DEFAULT_LNG = -0.1278;
const DEFAULT_LAT = 51.5074;

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-[var(--petto-border)] bg-white px-3 py-2 text-sm";

const CATEGORY_COLORS: Record<string, string> = {
  park: "bg-emerald-100 text-emerald-800",
  cafe: "bg-amber-100 text-amber-800",
  bar: "bg-violet-100 text-violet-800",
  beach: "bg-sky-100 text-sky-800",
  trail: "bg-lime-100 text-lime-800",
  other: "bg-gray-100 text-gray-700",
};

interface GeocodingFeature {
  id: string;
  place_name: string;
  center: [number, number];
}

type VenueFormValues = {
  name: string;
  category: string;
  description: string;
  cityLabel: string;
  address: string;
  hours: string;
  imageUrl: string;
};

export default function VenuesPage() {
  const queryClient = useQueryClient();

  const { data: venues = [], isLoading } = useQuery({
    queryKey: ["admin-venues"],
    queryFn: getVenues,
  });

  const { register, handleSubmit, reset, setValue } =
    useForm<VenueFormValues>({
      defaultValues: { category: "park" },
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

  /* ---- map + geocoding state ---- */
  const [addressQuery, setAddressQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodingFeature[]>([]);
  const [selectedLat, setSelectedLat] = useState(DEFAULT_LAT);
  const [selectedLng, setSelectedLng] = useState(DEFAULT_LNG);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- initialise map ---- */
  useEffect(() => {
    let map: mapboxgl.Map | undefined;

    async function initMap() {
      const mapboxgl = (await import("mapbox-gl")).default;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      if (!mapContainerRef.current) return;

      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [selectedLng, selectedLat],
        zoom: 12,
      });

      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      const marker = new mapboxgl.Marker({ draggable: true, color: "#6d28d9" })
        .setLngLat([selectedLng, selectedLat])
        .addTo(map);

      marker.on("dragend", () => {
        const lngLat = marker.getLngLat();
        setSelectedLat(lngLat.lat);
        setSelectedLng(lngLat.lng);
        reverseGeocode(lngLat.lng, lngLat.lat);
      });

      mapRef.current = map;
      markerRef.current = marker;

      map.on("load", () => setMapLoaded(true));
    }

    initMap();

    return () => {
      if (map) {
        map.remove();
      }
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- reverse geocode (for marker drag) ---- */
  const reverseGeocode = useCallback(
    async (lng: number, lat: number) => {
      if (!MAPBOX_TOKEN) return;
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`
        );
        const json = (await res.json()) as { features: GeocodingFeature[] };
        if (json.features.length > 0) {
          const place = json.features[0];
          setValue("address", place.place_name);
          setAddressQuery(place.place_name);
        }
      } catch {
        /* silently ignore network errors */
      }
    },
    [setValue]
  );

  /* ---- forward geocoding with debounce ---- */
  const handleAddressChange = useCallback(
    (value: string) => {
      setAddressQuery(value);
      setValue("address", value);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (value.trim().length < 3) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        if (!MAPBOX_TOKEN) return;
        try {
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json?access_token=${MAPBOX_TOKEN}&limit=5`
          );
          const json = (await res.json()) as { features: GeocodingFeature[] };
          setSuggestions(json.features ?? []);
          setShowSuggestions(true);
        } catch {
          setSuggestions([]);
        }
      }, 500);
    },
    [setValue]
  );

  /* ---- select a geocoding suggestion ---- */
  const selectSuggestion = useCallback(
    (feature: GeocodingFeature) => {
      const [lng, lat] = feature.center;
      setSelectedLng(lng);
      setSelectedLat(lat);
      setAddressQuery(feature.place_name);
      setValue("address", feature.place_name);
      setSuggestions([]);
      setShowSuggestions(false);

      if (mapRef.current) {
        mapRef.current.flyTo({ center: [lng, lat], zoom: 15 });
      }
      if (markerRef.current) {
        markerRef.current.setLngLat([lng, lat]);
      }
    },
    [setValue]
  );

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
          const presign = await adminPresignUpload(imageFile.name, imageFile.type, "venues");
          await fetch(presign.uploadUrl, {
            method: "PUT",
            body: imageFile,
            headers: { "Content-Type": imageFile.type },
          });
          imageUrl = presign.publicUrl;
        } finally {
          setUploading(false);
        }
      }
      return createVenue({
        ...values,
        hours: formatHours(values),
        latitude: selectedLat,
        longitude: selectedLng,
        imageUrl: imageUrl || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      reset();
      setAddressQuery("");
      setSuggestions([]);
      setImageFile(null);
      setImagePreview("");
      setSelectedLat(DEFAULT_LAT);
      setSelectedLng(DEFAULT_LNG);
      if (mapRef.current) {
        mapRef.current.flyTo({ center: [DEFAULT_LNG, DEFAULT_LAT], zoom: 12 });
      }
      if (markerRef.current) {
        markerRef.current.setLngLat([DEFAULT_LNG, DEFAULT_LAT]);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (venueId: string) => deleteVenue(venueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
  });

  /* ---- render ---- */
  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">
          Explore venues
        </p>
        <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">
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

          {/* Address with autocomplete */}
          <div className="relative">
            <Input
              placeholder="Address (start typing to search)"
              value={addressQuery}
              onChange={(e) => handleAddressChange(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onBlur={() => {
                // Delay to allow click on suggestion
                setTimeout(() => setShowSuggestions(false), 200);
              }}
            />
            {/* Hidden field so react-hook-form tracks the value */}
            <input type="hidden" {...register("address")} />

            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-lg border border-[var(--petto-border)] bg-white shadow-lg">
                {suggestions.map((feature) => (
                  <li key={feature.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2.5 text-left text-sm text-[var(--petto-ink)] transition-colors hover:bg-[var(--petto-primary)]/5"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectSuggestion(feature);
                      }}
                    >
                      {feature.place_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Map Preview */}
          <div className="lg:col-span-2">
            <div
              ref={mapContainerRef}
              className="w-full overflow-hidden rounded-xl border border-[var(--petto-border)]"
              style={{ height: 400 }}
            />
            <div className="mt-2 flex items-center gap-4 text-xs text-[var(--petto-muted)]">
              <span>
                Lat: <strong>{selectedLat.toFixed(6)}</strong>
              </span>
              <span>
                Lng: <strong>{selectedLng.toFixed(6)}</strong>
              </span>
              {!mapLoaded && (
                <span className="animate-pulse text-amber-600">
                  Loading map...
                </span>
              )}
              <span className="ml-auto text-[var(--petto-muted)]">
                Drag marker to adjust location
              </span>
            </div>
          </div>

          {/* Operating Hours */}
          <div className="space-y-2 lg:col-span-2">
            <label className="text-sm font-semibold text-[var(--petto-ink)]">Operating Hours</label>
            <div className="grid gap-2">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div key={day} className="flex items-center gap-3">
                  <span className="w-10 text-sm font-medium text-[var(--petto-muted)]">{day}</span>
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
              <label className="cursor-pointer rounded-2xl border border-dashed border-[var(--petto-border)] px-4 py-3 text-sm text-[var(--petto-muted)] hover:border-[var(--petto-primary)]">
                {imageFile ? imageFile.name : "Choose image..."}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              </label>
              {imagePreview && <img src={imagePreview} className="h-12 w-12 rounded-lg object-cover" alt="Preview" />}
            </div>
            {uploading && <p className="text-xs text-amber-600 animate-pulse">Uploading image...</p>}
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
        <div className="rounded-[22px] border border-dashed border-[var(--petto-border)] bg-white/60 px-4 py-12 text-center text-sm text-[var(--petto-muted)]">
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
                  <p className="truncate font-semibold text-[var(--petto-ink)]">
                    {venue.name}
                  </p>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[venue.category] ?? CATEGORY_COLORS.other}`}
                  >
                    {venue.category}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--petto-muted)]">
                  {venue.cityLabel}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/venues/${venue.id}`}>
                  <Button variant="ghost" className="text-[var(--petto-primary)] hover:text-[var(--petto-primary)]">
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
              <p className="mt-2 text-sm text-[var(--petto-ink)]">
                {venue.address}
              </p>
            )}

            {venue.hours && (
              <p className="mt-1 text-xs text-[var(--petto-muted)]">
                {venue.hours}
              </p>
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
