"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import { useQuery } from "@tanstack/react-query";
import { MapPin, Radio, RefreshCw } from "lucide-react";
import * as React from "react";

import { RelativeTime } from "@/components/common/RelativeTime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api/client";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

type LocationPoint = {
  kind: string;
  label: string;
  lat: number;
  lng: number;
  occurAt: string;
  venueId?: string;
  playdateId?: string;
};

type LocationPayload = {
  latest: LocationPoint | null;
  trail: LocationPoint[];
  cityLabel: string;
};

interface Props {
  userID: string;
  className?: string;
}

export function UserLocationMap({ userID, className }: Props) {
  const [isLive, setIsLive] = React.useState(true);

  const { data, isLoading, refetch, isFetching } = useQuery<LocationPayload>({
    queryKey: ["admin-user-location", userID],
    queryFn: () => apiRequest<LocationPayload>(`/users/${userID}/location`),
    // 5-second poll matches the mobile heartbeat cadence so the map pin
    // tracks a user in near-real-time while they're inside the app.
    refetchInterval: isLive ? 5_000 : false,
    enabled: Boolean(userID)
  });

  const mapRef = React.useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = React.useRef<any>(null);
  const markersRef = React.useRef<any[]>([]);

  // Initialize the map once.
  React.useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || !MAPBOX_TOKEN) return;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !mapRef.current) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      mapInstanceRef.current = new mapboxgl.Map({
        container: mapRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: [0, 20],
        zoom: 1.2,
        attributionControl: false
      });
      mapInstanceRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    })();
    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Render markers + line when data changes.
  React.useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !data) return;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      // Clear previous markers.
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const trail = data.trail ?? [];
      if (trail.length === 0) return;

      // Draw each point with a small numbered marker.
      trail.forEach((p, idx) => {
        const isLivePoint = idx === 0 && p.kind === "live" && p.label === "Live now";
        const el = document.createElement("div");
        el.style.width = idx === 0 ? "20px" : "10px";
        el.style.height = idx === 0 ? "20px" : "10px";
        el.style.borderRadius = "9999px";
        el.style.border = idx === 0 ? "2px solid #0f172a" : "2px solid #94a3b8";
        el.style.background = isLivePoint ? "#22c55e" : idx === 0 ? "#2563eb" : "#ffffff";
        el.style.boxShadow = isLivePoint
          ? "0 0 0 6px rgba(34,197,94,0.25), 0 0 0 12px rgba(34,197,94,0.12)"
          : idx === 0
            ? "0 0 0 5px rgba(37,99,235,0.18)"
            : "none";
        if (isLivePoint) {
          el.style.animation = "presence-pulse 1.6s ease-in-out infinite";
        }
        el.title = `${p.kind} · ${p.label}`;
        const popup = new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(
          `<div style="font-size:12px"><strong>${escapeHtml(p.label) || p.kind}</strong><br/><span style='color:#64748b'>${p.kind} · ${new Date(p.occurAt).toLocaleString()}</span></div>`
        );
        const marker = new mapboxgl.Marker(el).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(map);
        markersRef.current.push(marker);
      });

      // Draw path line connecting trail points.
      const lineSourceID = "trail-line";
      const lineLayerID = "trail-line-layer";
      const lineData = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: trail.map((p) => [p.lng, p.lat])
        }
      };
      if (map.getSource(lineSourceID)) {
        (map.getSource(lineSourceID) as any).setData(lineData);
      } else if (map.isStyleLoaded()) {
        map.addSource(lineSourceID, { type: "geojson", data: lineData as any });
        map.addLayer({
          id: lineLayerID,
          type: "line",
          source: lineSourceID,
          paint: { "line-color": "#0f172a", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0.6 }
        });
      } else {
        map.once("load", () => {
          if (map.getSource(lineSourceID)) return;
          map.addSource(lineSourceID, { type: "geojson", data: lineData as any });
          map.addLayer({
            id: lineLayerID,
            type: "line",
            source: lineSourceID,
            paint: { "line-color": "#0f172a", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0.6 }
          });
        });
      }

      // Fit bounds.
      const bounds = new mapboxgl.LngLatBounds();
      trail.forEach((p) => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 40, maxZoom: 13, duration: 500 });
    })();
  }, [data]);

  const latest = data?.latest;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="inline-flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[var(--muted-foreground)]" /> Location
          </CardTitle>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-[var(--muted-foreground)]">
            <span>{data?.cityLabel || "—"}</span>
            {latest ? (
              <>
                <span>· last seen</span>
                <RelativeTime value={latest.occurAt} />
                <span>at</span>
                <strong>{latest.label || latest.kind}</strong>
              </>
            ) : (
              <span>· no recent geolocated activity</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={isLive ? "success" : "neutral"} className="uppercase">
            <Radio className="h-3 w-3" /> {isLive ? "live" : "paused"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsLive((v) => !v);
              if (isLive) refetch();
            }}
          >
            {isLive ? "Pause" : "Resume"}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!MAPBOX_TOKEN ? (
          <div className="flex h-[320px] items-center justify-center rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)] text-xs text-[var(--muted-foreground)]">
            NEXT_PUBLIC_MAPBOX_TOKEN missing
          </div>
        ) : (
          <div
            ref={mapRef}
            className="h-[320px] w-full overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]"
          />
        )}
        {isLoading ? (
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">Loading location data…</p>
        ) : (data?.trail ?? []).length === 0 ? (
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            No geolocated activity found. Add a venue check-in or playdate join on the mobile app to see this user on the map.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
