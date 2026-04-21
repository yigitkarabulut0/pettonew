// Parses the admin-produced venue hours string and derives an "open now"
// status label for cards and the detail page.
//
// Expected input format (produced by the admin form):
//   "Mon 09:00-17:00, Tue 09:00-17:00, Wed closed, Thu 09:00-22:00, ..."
//
// Missing days are treated as unknown rather than closed.

export type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export type DayHours = { open: string; close: string } | "closed" | null;

export type ParsedHours = Record<DayKey, DayHours>;

const DAY_ORDER: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const JS_DAY_TO_KEY: Record<number, DayKey> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat"
};

function normalizeDay(raw: string): DayKey | null {
  const s = raw.trim().slice(0, 3).toLowerCase();
  switch (s) {
    case "mon":
      return "Mon";
    case "tue":
      return "Tue";
    case "wed":
      return "Wed";
    case "thu":
      return "Thu";
    case "fri":
      return "Fri";
    case "sat":
      return "Sat";
    case "sun":
      return "Sun";
    default:
      return null;
  }
}

function parseRange(raw: string): { open: string; close: string } | null {
  const m = raw.match(/^\s*(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\s*$/);
  if (!m || !m[1] || !m[2] || !m[3] || !m[4]) return null;
  const open = `${m[1].padStart(2, "0")}:${m[2]}`;
  const close = `${m[3].padStart(2, "0")}:${m[4]}`;
  return { open, close };
}

export function parseHours(raw: string | undefined | null): ParsedHours {
  const result: ParsedHours = {
    Mon: null,
    Tue: null,
    Wed: null,
    Thu: null,
    Fri: null,
    Sat: null,
    Sun: null
  };
  if (!raw) return result;

  for (const chunk of raw.split(",")) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const spaceIdx = trimmed.indexOf(" ");
    if (spaceIdx === -1) continue;
    const day = normalizeDay(trimmed.slice(0, spaceIdx));
    if (!day) continue;
    const rest = trimmed.slice(spaceIdx + 1).trim();
    if (rest.toLowerCase() === "closed") {
      result[day] = "closed";
      continue;
    }
    const range = parseRange(rest);
    if (range) result[day] = range;
  }

  return result;
}

function minutesSinceMidnight(hhmm: string): number {
  const parts = hhmm.split(":").map((n) => parseInt(n, 10));
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  return h * 60 + m;
}

export type TodayStatus = {
  open: boolean;
  label: string;
};

/**
 * Returns the current open/closed state for a venue.
 * Labels are short enough for a chip: "Open · closes 17:00".
 */
export function getTodayStatus(
  raw: string | undefined | null,
  now: Date = new Date()
): TodayStatus {
  const hours = parseHours(raw);
  const todayKey = JS_DAY_TO_KEY[now.getDay()] ?? "Mon";
  const today = hours[todayKey];

  const nowMins = now.getHours() * 60 + now.getMinutes();

  if (today && today !== "closed") {
    const openMins = minutesSinceMidnight(today.open);
    const closeMins = minutesSinceMidnight(today.close);
    // Overnight ranges (e.g. 18:00-02:00) close past midnight.
    const isOpen =
      closeMins > openMins
        ? nowMins >= openMins && nowMins < closeMins
        : nowMins >= openMins || nowMins < closeMins;
    if (isOpen) {
      return { open: true, label: `Open · closes ${today.close}` };
    }
    // Closed today but opens again today.
    if (nowMins < openMins) {
      return { open: false, label: `Closed · opens ${today.open}` };
    }
  }

  // Find the next open day in the week ahead.
  const startIdx = DAY_ORDER.indexOf(todayKey);
  for (let i = 1; i <= 7; i += 1) {
    const nextKey = DAY_ORDER[(startIdx + i) % 7] ?? "Mon";
    const next = hours[nextKey];
    if (next && next !== "closed") {
      return { open: false, label: `Closed · opens ${nextKey} ${next.open}` };
    }
  }

  return { open: false, label: "Hours unavailable" };
}
