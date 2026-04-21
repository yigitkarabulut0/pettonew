// Locale-aware formatters for the adopter-facing surface. Used by
// the pet card, pet detail, and shelter profile screens so the same
// rules — age phrasing, km/mi, kg/lbs — are applied consistently.
//
// Distance unit selection mirrors the spec: GB/US → miles, everywhere
// else → km. Weight follows the same split. Locale comes from
// expo-localization.

export type DistanceUnit = "km" | "mi";
export type WeightUnit = "kg" | "lbs";

export function resolveDistanceUnit(locale: string | undefined): DistanceUnit {
  if (!locale) return "km";
  const region = locale.split("-")[1]?.toUpperCase() ?? "";
  return region === "GB" || region === "US" ? "mi" : "km";
}

export function resolveWeightUnit(locale: string | undefined): WeightUnit {
  if (!locale) return "kg";
  const region = locale.split("-")[1]?.toUpperCase() ?? "";
  return region === "GB" || region === "US" ? "lbs" : "kg";
}

/**
 * Human age phrase per spec: "8 weeks", "2 months", "3 years".
 * Returns `null` for undefined/invalid so the UI can skip the row.
 */
export function formatAge(ageMonths: number | null | undefined): string | null {
  if (ageMonths == null || ageMonths < 0 || !Number.isFinite(ageMonths)) return null;
  if (ageMonths === 0) return "Newborn";
  if (ageMonths < 2) {
    const weeks = Math.max(1, Math.round(ageMonths * 4));
    return `${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  if (ageMonths < 24) {
    return `${ageMonths} month${ageMonths === 1 ? "" : "s"}`;
  }
  const years = Math.floor(ageMonths / 12);
  return `${years} year${years === 1 ? "" : "s"}`;
}

/** Distance with adaptive precision — under 10 shows 1 decimal, else rounded. */
export function formatDistance(
  distanceKm: number | null | undefined,
  unit: DistanceUnit
): string | null {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return null;
  if (unit === "mi") {
    const mi = distanceKm * 0.621371;
    if (mi < 1) return "< 1 mi";
    if (mi < 10) return `${mi.toFixed(1)} mi`;
    return `${Math.round(mi)} mi`;
  }
  if (distanceKm < 1) return "< 1 km";
  if (distanceKm < 10) return `${distanceKm.toFixed(1)} km`;
  return `${Math.round(distanceKm)} km`;
}

/** Weight in the user's preferred unit; null if not entered. */
export function formatWeight(kg: number | null | undefined, unit: WeightUnit): string | null {
  if (kg == null || !Number.isFinite(kg) || kg <= 0) return null;
  if (unit === "lbs") {
    const lbs = kg * 2.20462;
    return `${lbs.toFixed(lbs < 10 ? 1 : 0)} lbs`;
  }
  return `${kg.toFixed(kg < 10 ? 1 : 0)} kg`;
}

/**
 * Status badges surfaced on the adopter card per spec. Returns a list
 * the UI renders in order — no priority, multiple can render
 * simultaneously.
 *
 * `publishedAt`: ISO timestamp of the earliest `published` transition
 *   (server-supplied). Within 7 days → "New" badge.
 * `isUrgent`: shelter's manual urgent flag.
 * `specialNeeds`: presence (non-empty) triggers the badge.
 * `microchipId`: presence (non-empty) triggers the badge. Never render
 *   the value itself.
 */
export type AdoptableBadge = "new" | "urgent" | "special_needs" | "microchipped";

export function deriveAdoptableBadges(opts: {
  publishedAt?: string;
  createdAt?: string;
  isUrgent?: boolean;
  specialNeeds?: string;
  microchipPresent?: boolean;
  microchipId?: string;
}): AdoptableBadge[] {
  const out: AdoptableBadge[] = [];
  const publishedTs = opts.publishedAt ?? opts.createdAt;
  if (publishedTs) {
    const ageMs = Date.now() - new Date(publishedTs).getTime();
    const days = ageMs / (1000 * 60 * 60 * 24);
    if (days >= 0 && days < 7) out.push("new");
  }
  if (opts.isUrgent) out.push("urgent");
  if (opts.specialNeeds && opts.specialNeeds.trim() !== "") out.push("special_needs");
  const hasChip =
    opts.microchipPresent === true ||
    (opts.microchipId != null && opts.microchipId.trim() !== "");
  if (hasChip) out.push("microchipped");
  return out;
}

/** Requirements encoded as prefixed characterTags by the wizard. */
export type ParsedRequirements = {
  homeTypes: string[];
  otherPets: string;
  children: string;
  experience: string;
  other: string;
  vaccination: string;
  weightKg: number | null;
};

export function parseRequirements(tags: string[] | undefined | null): ParsedRequirements {
  const out: ParsedRequirements = {
    homeTypes: [],
    otherPets: "",
    children: "",
    experience: "",
    other: "",
    vaccination: "",
    weightKg: null
  };
  if (!tags) return out;
  for (const raw of tags) {
    const [k, ...rest] = raw.split(":");
    const v = rest.join(":");
    if (!k || !v) continue;
    switch (k) {
      case "home":
        out.homeTypes.push(v);
        break;
      case "pets":
        out.otherPets = v;
        break;
      case "children":
        out.children = v;
        break;
      case "xp":
        out.experience = v;
        break;
      case "req":
        out.other = v.replace(/_/g, " ");
        break;
      case "vax":
        out.vaccination = v;
        break;
      case "weight": {
        const n = Number(v);
        if (Number.isFinite(n)) out.weightKg = n;
        break;
      }
    }
  }
  return out;
}

export function humanHome(v: string): string {
  switch (v) {
    case "house_garden":
    case "house_with_garden":
      return "House with garden";
    case "apartment":
      return "Apartment";
    case "either":
      return "House or apartment";
    default:
      return v.replace(/_/g, " ");
  }
}
export function humanOtherPets(v: string): string {
  switch (v) {
    case "dogs":
    case "good_with_dogs":
      return "Good with dogs";
    case "cats":
    case "good_with_cats":
      return "Good with cats";
    case "both":
    case "good_with_both":
      return "Good with dogs and cats";
    case "none":
    case "no_other_pets":
      return "Prefers a pet-free home";
    default:
      return "Unknown";
  }
}
export function humanChildren(v: string): string {
  switch (v) {
    case "good":
    case "good_with_children":
      return "Good with children";
    case "no_young":
    case "no_young_children":
      return "No young children";
    default:
      return "Unknown";
  }
}
export function humanExperience(v: string): string {
  switch (v) {
    case "first_time":
    case "first_time_welcome":
      return "First-time adopters welcome";
    case "experienced_preferred":
      return "Experienced adopter preferred";
    case "experienced_required":
      return "Experienced adopter required";
    default:
      return v.replace(/_/g, " ");
  }
}
export function humanVaccination(v: string): string {
  switch (v) {
    case "up_to_date":
      return "Up to date";
    case "partial":
      return "Partial";
    case "not_vaccinated":
      return "Not vaccinated";
    case "unknown":
    case "":
      return "Unknown";
    default:
      return v.replace(/_/g, " ");
  }
}
export function humanSex(v: string): string {
  if (v === "male") return "Male";
  if (v === "female") return "Female";
  return "Unknown";
}
