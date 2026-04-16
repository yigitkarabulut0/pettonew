"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import "mapbox-gl/dist/mapbox-gl.css";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getAdminVetClinics,
  createAdminVetClinic,
  deleteAdminVetClinic
} from "@/lib/admin-api";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const DEFAULT_LNG = -0.1278;
const DEFAULT_LAT = 51.5074;

interface GeocodingFeature {
  id: string;
  place_name: string;
  center: [number, number];
}

type ClinicFormValues = {
  name: string;
  phone: string;
  address: string;
  city: string;
  website: string;
  isEmergency: boolean;
};

export default function VetClinicsPage() {
  const queryClient = useQueryClient();

  const { data: clinics = [], isLoading } = useQuery({
    queryKey: ["admin-vet-clinics"],
    queryFn: getAdminVetClinics
  });

  const { register, handleSubmit, reset, setValue } =
    useForm<ClinicFormValues>({
      defaultValues: { isEmergency: false }
    });

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
        zoom: 12
      });

      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      const marker = new mapboxgl.Marker({
        draggable: true,
        color: "#A14632"
      })
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
        const place = json.features?.[0];
        if (place) {
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
          const json = (await res.json()) as {
            features: GeocodingFeature[];
          };
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
    mutationFn: (values: ClinicFormValues) =>
      createAdminVetClinic({
        name: values.name,
        phone: values.phone,
        address: values.address,
        city: values.city,
        isEmergency: values.isEmergency,
        website: values.website || undefined,
        hours: formatHours(values) || undefined,
        latitude: selectedLat,
        longitude: selectedLng
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-vet-clinics"] });
      reset();
      setAddressQuery("");
      setSuggestions([]);
      setSelectedLat(DEFAULT_LAT);
      setSelectedLng(DEFAULT_LNG);
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [DEFAULT_LNG, DEFAULT_LAT],
          zoom: 12
        });
      }
      if (markerRef.current) {
        markerRef.current.setLngLat([DEFAULT_LNG, DEFAULT_LAT]);
      }
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (clinicId: string) => deleteAdminVetClinic(clinicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-vet-clinics"] });
    }
  });

  /* ---- render ---- */
  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          Vet Clinics
        </p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight text-[var(--foreground)]">
          Manage veterinary clinic listings
        </h1>
      </Card>

      {/* Create Form */}
      <Card>
        <form
          className="grid gap-3 lg:grid-cols-2"
          onSubmit={handleSubmit((values) => createMutation.mutate(values))}
        >
          {/* Name */}
          <Input placeholder="Clinic name" {...register("name")} />

          {/* Phone */}
          <Input placeholder="Phone number" {...register("phone")} />

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
                setTimeout(() => setShowSuggestions(false), 200);
              }}
            />
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

          {/* City */}
          <Input placeholder="City" {...register("city")} />

          {/* Website */}
          <Input
            placeholder="Website (optional)"
            {...register("website")}
          />

          {/* Empty cell to keep grid aligned */}
          <div />

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
            <label className="text-sm font-semibold text-[var(--petto-ink)]">
              Operating Hours
            </label>
            <div className="grid gap-2">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                (day) => (
                  <div key={day} className="flex items-center gap-3">
                    <span className="w-10 text-sm font-medium text-[var(--petto-muted)]">
                      {day}
                    </span>
                    <input
                      type="time"
                      className="rounded-lg border border-[var(--petto-border)] bg-white px-3 py-1.5 text-sm"
                      {...register(`hours_${day}_open` as any)}
                    />
                    <span className="text-sm text-[var(--petto-muted)]">
                      to
                    </span>
                    <input
                      type="time"
                      className="rounded-lg border border-[var(--petto-border)] bg-white px-3 py-1.5 text-sm"
                      {...register(`hours_${day}_close` as any)}
                    />
                  </div>
                )
              )}
            </div>
          </div>

          {/* Emergency checkbox */}
          <div className="flex items-center gap-3 lg:col-span-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                {...register("isEmergency")}
                className="h-4 w-4 rounded border-[var(--petto-border)]"
              />
              <span className="text-sm font-medium text-[var(--petto-ink)]">
                Emergency Clinic
              </span>
            </label>
          </div>

          {/* Submit */}
          <div className="lg:col-span-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding..." : "Add clinic"}
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
      {!isLoading && clinics.length === 0 && (
        <div className="rounded-md border border-dashed border-[var(--petto-border)] bg-white/60 px-4 py-12 text-center text-sm text-[var(--petto-muted)]">
          No vet clinics found. Add your first clinic above.
        </div>
      )}

      {/* Clinic grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {clinics.map((clinic) => (
          <Card key={clinic.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-[var(--petto-ink)]">
                    {clinic.name}
                  </p>
                  {clinic.isEmergency && (
                    <Badge tone="warning">Emergency</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-[var(--petto-muted)]">
                  {clinic.address}
                </p>
                <p className="text-sm text-[var(--petto-muted)]">
                  {clinic.city}
                </p>
                {clinic.phone && (
                  <p className="mt-1 text-sm text-[var(--petto-ink)]">
                    {clinic.phone}
                  </p>
                )}
                {clinic.hours && (
                  <p className="mt-1 text-xs text-[var(--petto-muted)]">
                    {clinic.hours}
                  </p>
                )}
                {clinic.website && (
                  <a
                    href={clinic.website}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-xs text-[var(--petto-primary)] underline"
                  >
                    {clinic.website}
                  </a>
                )}
              </div>
              <Button
                variant="ghost"
                className="shrink-0 text-rose-700 hover:text-rose-800"
                onClick={() => deleteMutation.mutate(clinic.id)}
                disabled={deleteMutation.isPending}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
