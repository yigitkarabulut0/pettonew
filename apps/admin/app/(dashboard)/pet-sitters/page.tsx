"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import "mapbox-gl/dist/mapbox-gl.css";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getAdminPetSitters } from "@/lib/admin-api";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const cookieName = "petto_admin_session";
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const DEFAULT_LNG = -0.1278;
const DEFAULT_LAT = 51.5074;

interface GeocodingFeature {
  id: string;
  place_name: string;
  center: [number, number];
}

function getToken() {
  if (typeof document === "undefined") return "";
  const cookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${cookieName}=`));
  return cookie?.split("=")[1] ?? "";
}

async function createAdminPetSitter(sitter: {
  name: string;
  bio: string;
  hourlyRate: number;
  cityLabel: string;
  services: string[];
  phone?: string;
  currency?: string;
  latitude?: number;
  longitude?: number;
}) {
  const res = await fetch(`${apiBaseUrl}/v1/admin/pet-sitters`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(sitter)
  });
  if (!res.ok) throw new Error("Failed to create pet sitter");
  return res.json();
}

export default function PetSittersPage() {
  const queryClient = useQueryClient();
  const { data: rawSitters, isLoading } = useQuery({
    queryKey: ["admin-pet-sitters"],
    queryFn: getAdminPetSitters
  });
  const sitters = rawSitters ?? [];

  const { register, handleSubmit, reset, setValue } = useForm<{
    name: string;
    bio: string;
    hourlyRate: string;
    cityLabel: string;
    servicesText: string;
    phone: string;
    currency: string;
    address: string;
  }>({
    defaultValues: {
      currency: "USD"
    }
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
        color: "#6d28d9"
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

  const createMutation = useMutation({
    mutationFn: (values: {
      name: string;
      bio: string;
      hourlyRate: string;
      cityLabel: string;
      servicesText: string;
      phone: string;
      currency: string;
    }) =>
      createAdminPetSitter({
        name: values.name.trim(),
        bio: values.bio.trim(),
        hourlyRate: parseFloat(values.hourlyRate) || 0,
        cityLabel: values.cityLabel.trim(),
        services: values.servicesText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        phone: values.phone?.trim() || undefined,
        currency: values.currency || undefined,
        latitude: selectedLat,
        longitude: selectedLng
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pet-sitters"] });
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

  return (
    <div className="space-y-5">
      <Card className="bg-[linear-gradient(135deg,rgba(255,252,248,0.98),rgba(245,229,216,0.92))]">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">
          Pet Sitters
        </p>
        <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">
          Manage pet sitter profiles
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--petto-muted)]">
          Add and manage trusted pet sitters available to users in different
          cities.
        </p>
      </Card>

      <Card>
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">
          Add Pet Sitter
        </p>
        <form
          className="grid gap-3"
          onSubmit={handleSubmit((v) => createMutation.mutate(v))}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Input
              placeholder="Name"
              {...register("name", { required: true })}
            />
            <Input
              placeholder="City"
              {...register("cityLabel", { required: true })}
            />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Input
              placeholder="Hourly rate (e.g. 25)"
              type="number"
              step="0.01"
              {...register("hourlyRate", { required: true })}
            />
            <Input
              placeholder="Services (comma separated: walking, sitting, grooming)"
              {...register("servicesText")}
            />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Input placeholder="Phone number" {...register("phone")} />
            <select
              className="flex h-10 w-full rounded-2xl border border-[var(--petto-border)] bg-white px-3 py-2 text-sm text-[var(--petto-ink)] outline-none focus:ring-2 focus:ring-[var(--petto-primary)]/20"
              {...register("currency")}
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (&euro;)</option>
              <option value="GBP">GBP (&pound;)</option>
              <option value="TRY">TRY (&#8378;)</option>
              <option value="CAD">CAD (C$)</option>
              <option value="AUD">AUD (A$)</option>
              <option value="JPY">JPY (&yen;)</option>
              <option value="CHF">CHF (Fr)</option>
            </select>
          </div>

          {/* Area / Address with autocomplete */}
          <div className="relative">
            <Input
              placeholder="Area / Address (start typing to search)"
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

          {/* Map Preview */}
          <div>
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
                Drag marker to set sitter area
              </span>
            </div>
          </div>

          <textarea
            className="flex min-h-[80px] w-full rounded-2xl border border-[var(--petto-border)] bg-white px-4 py-3 text-sm text-[var(--petto-ink)] outline-none placeholder:text-[var(--petto-muted)] focus:ring-2 focus:ring-[var(--petto-primary)]/20"
            placeholder="Bio / description"
            {...register("bio", { required: true })}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding..." : "Add Pet Sitter"}
            </Button>
          </div>
        </form>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--petto-primary)] border-t-transparent" />
        </div>
      )}
      {!isLoading && sitters.length === 0 && (
        <div className="rounded-[22px] border border-dashed border-[var(--petto-border)] bg-white/60 px-4 py-12 text-center text-sm text-[var(--petto-muted)]">
          No pet sitters yet. Add the first one above.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {sitters.map((sitter: any) => (
          <Card key={sitter.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-[var(--petto-ink)]">
                  {sitter.name}
                </p>
                <p className="text-sm text-[var(--petto-muted)]">
                  {sitter.cityLabel}
                </p>
                {sitter.phone && (
                  <p className="text-sm text-[var(--petto-muted)]">
                    {sitter.phone}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-lg font-semibold text-[var(--petto-primary)]">
                {sitter.currency === "EUR"
                  ? "\u20AC"
                  : sitter.currency === "GBP"
                    ? "\u00A3"
                    : sitter.currency === "TRY"
                      ? "\u20BA"
                      : sitter.currency === "JPY"
                        ? "\u00A5"
                        : sitter.currency === "CHF"
                          ? "Fr"
                          : sitter.currency === "CAD"
                            ? "C$"
                            : sitter.currency === "AUD"
                              ? "A$"
                              : "$"}
                {sitter.hourlyRate}/hr
              </span>
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--petto-muted)]">
              {sitter.bio}
            </p>
            {sitter.services && sitter.services.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {sitter.services.map((service: string) => (
                  <Badge key={service} tone="neutral">
                    {service}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
