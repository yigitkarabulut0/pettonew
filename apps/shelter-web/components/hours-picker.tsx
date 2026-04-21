"use client";

// Structured weekly hours editor. Shelter picks each day as open/closed and
// enters a time range; output is serialised to the backend's canonical
// string format — "Mon 09:00-17:00, Tue 09:00-17:00, Wed closed, …".

import { Label } from "@/components/ui/label";

export type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

const DAYS: Array<{ key: DayKey; label: string }> = [
  { key: "Mon", label: "Monday" },
  { key: "Tue", label: "Tuesday" },
  { key: "Wed", label: "Wednesday" },
  { key: "Thu", label: "Thursday" },
  { key: "Fri", label: "Friday" },
  { key: "Sat", label: "Saturday" },
  { key: "Sun", label: "Sunday" }
];

export type DayState = { open: boolean; from: string; to: string };
export type WeekState = Record<DayKey, DayState>;

const DEFAULT_DAY: DayState = { open: false, from: "09:00", to: "17:00" };

export function emptyWeek(): WeekState {
  return {
    Mon: { ...DEFAULT_DAY },
    Tue: { ...DEFAULT_DAY },
    Wed: { ...DEFAULT_DAY },
    Thu: { ...DEFAULT_DAY },
    Fri: { ...DEFAULT_DAY },
    Sat: { ...DEFAULT_DAY },
    Sun: { ...DEFAULT_DAY }
  };
}

/** Parse the backend's canonical hours string back into UI state. */
export function parseWeeklyHours(raw: string): WeekState {
  const state = emptyWeek();
  if (!raw) return state;
  for (const chunk of raw.split(",")) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const spaceIdx = trimmed.indexOf(" ");
    if (spaceIdx === -1) continue;
    const day = trimmed.slice(0, spaceIdx).trim() as DayKey;
    if (!(day in state)) continue;
    const rest = trimmed.slice(spaceIdx + 1).trim();
    if (rest.toLowerCase() === "closed") {
      state[day] = { open: false, from: DEFAULT_DAY.from, to: DEFAULT_DAY.to };
      continue;
    }
    const m = rest.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
    if (m && m[1] && m[2]) {
      state[day] = { open: true, from: m[1], to: m[2] };
    }
  }
  return state;
}

/** Serialise UI state to the admin-canonical string format. */
export function formatWeeklyHours(state: WeekState): string {
  return DAYS.map(({ key }) => {
    const d = state[key];
    if (!d.open) return `${key} closed`;
    return `${key} ${d.from}-${d.to}`;
  }).join(", ");
}

export function WeekHoursPicker({
  value,
  onChange
}: {
  value: WeekState;
  onChange: (next: WeekState) => void;
}) {
  const patch = (day: DayKey, patch: Partial<DayState>) => {
    onChange({ ...value, [day]: { ...value[day], ...patch } });
  };

  return (
    <div className="space-y-2">
      {DAYS.map(({ key, label }) => {
        const d = value[key];
        return (
          <div
            key={key}
            className="grid grid-cols-[120px_auto_1fr_auto_1fr] items-center gap-3"
          >
            <Label className="text-sm font-medium">{label}</Label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
              <input
                type="checkbox"
                checked={d.open}
                onChange={(e) => patch(key, { open: e.target.checked })}
                className="size-4 accent-[var(--primary)]"
              />
              Open
            </label>
            <input
              type="time"
              value={d.from}
              onChange={(e) => patch(key, { from: e.target.value })}
              disabled={!d.open}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
            />
            <span className="text-xs text-[var(--muted-foreground)]">to</span>
            <input
              type="time"
              value={d.to}
              onChange={(e) => patch(key, { to: e.target.value })}
              disabled={!d.open}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
            />
          </div>
        );
      })}
      <p className="mt-3 text-[11px] text-[var(--muted-foreground)]">
        Closed days are hidden in the app. Times follow your shelter&apos;s local
        timezone.
      </p>
    </div>
  );
}
