// Persistent discovery prefs for the fetcht adopter home. Mirrors
// the AsyncStorage versioned-key pattern from lib/location.ts so we
// can ship a v2 later without migration code. Returns a sane default
// on parse errors or first launch.

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "discovery:prefs:v1";

export type SpeciesTab = "dog" | "cat" | "other";
export type AgeBucket = "puppy" | "young" | "adult" | "senior";
export type SizeBucket = "small" | "medium" | "large" | "xl";
export type SexValue = "male" | "female";
export type DistanceKey = "5" | "10" | "25" | "50" | "any";

export type DiscoveryPrefs = {
  species: SpeciesTab;
  age: AgeBucket[];
  size: SizeBucket[];
  sex: SexValue[];
  distance: DistanceKey;
  specialNeedsOnly: boolean;
};

export const DEFAULT_PREFS: DiscoveryPrefs = {
  species: "dog",
  age: [],
  size: [],
  sex: [],
  distance: "any",
  specialNeedsOnly: false
};

export async function loadDiscoveryPrefs(): Promise<DiscoveryPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<DiscoveryPrefs>;
    return {
      species: parsed.species ?? DEFAULT_PREFS.species,
      age: Array.isArray(parsed.age) ? parsed.age : [],
      size: Array.isArray(parsed.size) ? parsed.size : [],
      sex: Array.isArray(parsed.sex) ? parsed.sex : [],
      distance: parsed.distance ?? DEFAULT_PREFS.distance,
      specialNeedsOnly: !!parsed.specialNeedsOnly
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveDiscoveryPrefs(p: DiscoveryPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* best-effort; if storage is full the next reload falls back to defaults */
  }
}

// Age bucket → min/max months map used when building the API query.
// Returns `null` entries when no lower/upper bound applies.
export function ageBucketsToMonths(
  buckets: AgeBucket[]
): { minAgeMonths: number; maxAgeMonths: number } | null {
  if (buckets.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const b of buckets) {
    const [lo, hi] = ageRange(b);
    if (lo < min) min = lo;
    if (hi > max) max = hi;
  }
  return {
    minAgeMonths: min === Infinity ? 0 : min,
    maxAgeMonths: max === -Infinity ? 0 : max
  };
}

function ageRange(b: AgeBucket): [number, number] {
  // Spec: Puppy/Kitten (< 6 months), Young (6m–2y), Adult (2–7y), Senior (7y+)
  switch (b) {
    case "puppy":
      return [0, 6];
    case "young":
      return [6, 24];
    case "adult":
      return [24, 84];
    case "senior":
      return [84, 600];
  }
}

// Distance select → km value. "any" returns 0 (no cap).
export function distanceKmValue(d: DistanceKey): number {
  switch (d) {
    case "5":
      return 5;
    case "10":
      return 10;
    case "25":
      return 25;
    case "50":
      return 50;
    case "any":
    default:
      return 0;
  }
}

// Species tab → API species filter. "other" is anything except
// dog/cat — expressed as a comma-separated list the backend
// understands (IN clause on the list query).
export function speciesFilterForTab(tab: SpeciesTab): string {
  if (tab === "dog") return "dog";
  if (tab === "cat") return "cat";
  return "rabbit,ferret,small_mammal";
}
