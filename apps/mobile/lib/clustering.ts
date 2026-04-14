// Grid-based JS map clustering — zero dependency.
// Groups nearby points into a single "super marker" so the map stays
// readable even at world zoom levels. The bucket size scales with the
// map's latitudeDelta so clustering relaxes as the user zooms in.

export type ClusterPoint = {
  id: string;
  latitude: number;
  longitude: number;
};

export type Cluster<T extends ClusterPoint> =
  | { kind: "single"; point: T }
  | {
      kind: "group";
      id: string;
      latitude: number;
      longitude: number;
      count: number;
      samples: T[];
    };

/**
 * Clusters points by bucketing them into a latLng grid. The grid's
 * cell size is proportional to the current map zoom (latitudeDelta):
 * zoomed out → large cells → aggressive grouping. Zoomed in →
 * tiny cells → almost every point stays a single marker.
 */
export function clusterPoints<T extends ClusterPoint>(
  points: T[],
  latitudeDelta: number
): Array<Cluster<T>> {
  if (!points || points.length === 0) return [];

  // 8 cells across the visible area feels natural on iOS Maps.
  const cellSize = Math.max(latitudeDelta / 8, 0.001);

  const buckets = new Map<string, T[]>();
  for (const p of points) {
    const lat = p.latitude;
    const lng = p.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat === 0 && lng === 0) continue;
    const key =
      Math.round(lat / cellSize) + "," + Math.round(lng / cellSize);
    const existing = buckets.get(key);
    if (existing) {
      existing.push(p);
    } else {
      buckets.set(key, [p]);
    }
  }

  const out: Array<Cluster<T>> = [];
  for (const [key, list] of buckets.entries()) {
    if (list.length === 1 && list[0]) {
      out.push({ kind: "single", point: list[0] });
      continue;
    }
    // Compute centroid and keep the first 3 samples as a preview.
    let latSum = 0;
    let lngSum = 0;
    for (const p of list) {
      latSum += p.latitude;
      lngSum += p.longitude;
    }
    out.push({
      kind: "group",
      id: "cluster-" + key,
      latitude: latSum / list.length,
      longitude: lngSum / list.length,
      count: list.length,
      samples: list.slice(0, 3)
    });
  }
  return out;
}
