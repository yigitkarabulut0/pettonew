"use client";

// Reusable Mapbox location picker.
//
// Wraps the forward/reverse geocoding pattern that previously lived
// duplicated across venues / vet-clinics / pet-sitters admin pages.
// Callers just provide an optional initial value + an onChange handler;
// the component owns the map lifecycle, debounce, and Mapbox network
// calls.

import { useCallback, useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type * as mapboxgl from "mapbox-gl";

import { cn } from "@/lib/utils";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const DEFAULT_LNG = -0.1278;
const DEFAULT_LAT = 51.5074;
const DEBOUNCE_MS = 500;
const GEOCODER_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

export type LocationValue = {
  address: string;
  latitude: number;
  longitude: number;
  cityLabel?: string;
};

type GeocodingFeature = {
  id: string;
  place_name: string;
  center: [number, number];
  context?: Array<{ id: string; text: string }>;
};

type LocationPickerProps = {
  value?: Partial<LocationValue>;
  onChange: (value: LocationValue) => void;
  /** Hex colour for the draggable pin. */
  markerColor?: string;
  /** Lat/lng the map opens at when no initial value is provided. */
  defaultLatitude?: number;
  defaultLongitude?: number;
  /** Hides the address input; map + drag-only. */
  addressless?: boolean;
  label?: string;
  placeholder?: string;
  /** Height of the map element. Default 280. */
  mapHeight?: number;
  className?: string;
  required?: boolean;
  disabled?: boolean;
};

function extractCityFromFeature(feature: GeocodingFeature | null | undefined): string | undefined {
  if (!feature?.context) return undefined;
  // Mapbox returns context entries like `place.123` (city) and `region.456`.
  const place = feature.context.find((c) => c.id.startsWith("place"));
  if (place?.text) return place.text;
  const region = feature.context.find((c) => c.id.startsWith("region"));
  return region?.text;
}

export function LocationPicker({
  value,
  onChange,
  markerColor = "#e6694a",
  defaultLatitude = DEFAULT_LAT,
  defaultLongitude = DEFAULT_LNG,
  addressless = false,
  label = "Address",
  placeholder = "Start typing an address…",
  mapHeight = 280,
  className,
  required,
  disabled
}: LocationPickerProps) {
  const initialLat = value?.latitude && value.latitude !== 0 ? value.latitude : defaultLatitude;
  const initialLng =
    value?.longitude && value.longitude !== 0 ? value.longitude : defaultLongitude;

  const [addressQuery, setAddressQuery] = useState(value?.address ?? "");
  const [suggestions, setSuggestions] = useState<GeocodingFeature[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [lat, setLat] = useState(initialLat);
  const [lng, setLng] = useState(initialLng);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);

  // Keep the latest onChange reference without re-initialising the map.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Sync external value changes (e.g. form reset) into local state.
  useEffect(() => {
    if (value?.address !== undefined && value.address !== addressQuery) {
      setAddressQuery(value.address);
    }
    if (
      value?.latitude !== undefined &&
      value.longitude !== undefined &&
      (value.latitude !== lat || value.longitude !== lng)
    ) {
      setLat(value.latitude || defaultLatitude);
      setLng(value.longitude || defaultLongitude);
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [value.longitude || defaultLongitude, value.latitude || defaultLatitude],
          zoom: 14,
          duration: 600
        });
      }
      if (markerRef.current) {
        markerRef.current.setLngLat([
          value.longitude || defaultLongitude,
          value.latitude || defaultLatitude
        ]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.address, value?.latitude, value?.longitude]);

  /* ── Reverse geocode on marker drag. ─────────────────────────────── */
  const reverseGeocode = useCallback(
    async (lngVal: number, latVal: number) => {
      if (!MAPBOX_TOKEN) {
        onChangeRef.current({ address: addressQuery, latitude: latVal, longitude: lngVal });
        return;
      }
      try {
        const res = await fetch(
          `${GEOCODER_URL}/${lngVal},${latVal}.json?access_token=${MAPBOX_TOKEN}&limit=1`
        );
        const json = (await res.json()) as { features: GeocodingFeature[] };
        const place = json.features?.[0];
        const placeName = place?.place_name ?? "";
        setAddressQuery(placeName);
        onChangeRef.current({
          address: placeName,
          latitude: latVal,
          longitude: lngVal,
          cityLabel: extractCityFromFeature(place)
        });
      } catch {
        onChangeRef.current({ address: addressQuery, latitude: latVal, longitude: lngVal });
      }
    },
    [addressQuery]
  );

  /* ── Initialise the map once. ────────────────────────────────────── */
  useEffect(() => {
    if (!MAPBOX_TOKEN) return;
    let map: mapboxgl.Map | undefined;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      if (!mapContainerRef.current) return;

      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [initialLng, initialLat],
        zoom: initialLat === DEFAULT_LAT && initialLng === DEFAULT_LNG ? 10 : 14
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      const marker = new mapboxgl.Marker({ draggable: !disabled, color: markerColor })
        .setLngLat([initialLng, initialLat])
        .addTo(map);

      marker.on("dragend", () => {
        const ll = marker.getLngLat();
        setLat(ll.lat);
        setLng(ll.lng);
        void reverseGeocode(ll.lng, ll.lat);
      });

      map.on("click", (e) => {
        if (disabled) return;
        marker.setLngLat(e.lngLat);
        setLat(e.lngLat.lat);
        setLng(e.lngLat.lng);
        void reverseGeocode(e.lngLat.lng, e.lngLat.lat);
      });

      mapRef.current = map;
      markerRef.current = marker;
    })();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (map) map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // initial lat/lng resolved on mount — subsequent updates come through
    // the controlled-value sync effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Forward geocode with debounce. ──────────────────────────────── */
  const handleAddressChange = (val: string) => {
    setAddressQuery(val);
    onChangeRef.current({ address: val, latitude: lat, longitude: lng });

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 3 || !MAPBOX_TOKEN) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${GEOCODER_URL}/${encodeURIComponent(val)}.json?access_token=${MAPBOX_TOKEN}&limit=5&language=en`
        );
        const json = (await res.json()) as { features: GeocodingFeature[] };
        setSuggestions(json.features ?? []);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      }
    }, DEBOUNCE_MS);
  };

  const pickSuggestion = (feature: GeocodingFeature) => {
    const [lngPicked, latPicked] = feature.center;
    setLat(latPicked);
    setLng(lngPicked);
    setAddressQuery(feature.place_name);
    setSuggestions([]);
    setShowSuggestions(false);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [lngPicked, latPicked], zoom: 15, duration: 700 });
    }
    if (markerRef.current) {
      markerRef.current.setLngLat([lngPicked, latPicked]);
    }
    onChangeRef.current({
      address: feature.place_name,
      latitude: latPicked,
      longitude: lngPicked,
      cityLabel: extractCityFromFeature(feature)
    });
  };

  if (!MAPBOX_TOKEN) {
    return (
      <div className={cn("rounded-md border border-dashed border-[var(--border)] p-4 text-xs text-[var(--muted-foreground)]", className)}>
        Mapbox token missing. Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> in your env.
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {!addressless ? (
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">
            {label}
            {required ? <span className="ml-0.5 text-[var(--destructive)]">*</span> : null}
          </label>
          <input
            type="text"
            value={addressQuery}
            onChange={(e) => handleAddressChange(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            onBlur={() => {
              // Delay so the onMouseDown on the suggestion list still fires.
              setTimeout(() => setShowSuggestions(false), 120);
            }}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              "flex h-9 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm",
              "placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              "disabled:opacity-60"
            )}
          />
          {showSuggestions && suggestions.length > 0 ? (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-lg border border-[var(--border)] bg-white shadow-lg">
              {suggestions.map((feature) => (
                <li key={feature.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickSuggestion(feature);
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--muted)]"
                  >
                    {feature.place_name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div
        ref={mapContainerRef}
        style={{ height: mapHeight }}
        className="w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]"
      />

      <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--muted-foreground)]">
        <span>Drag the pin or click the map to adjust the exact spot.</span>
        <span className="font-mono">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </span>
      </div>
    </div>
  );
}
