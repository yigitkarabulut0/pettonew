// Structured weekly hours editor — mobile version (mirrors the shelter-web).
// Emits "Mon 09:00-17:00, Tue closed, …" to match the backend canonical
// string format so the mobile app and the web panel stay interchangeable.

import { Pressable, Text, TextInput, View } from "react-native";

import { theme } from "@/lib/theme";

export type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

const DAYS: Array<{ key: DayKey; label: string }> = [
  { key: "Mon", label: "Mon" },
  { key: "Tue", label: "Tue" },
  { key: "Wed", label: "Wed" },
  { key: "Thu", label: "Thu" },
  { key: "Fri", label: "Fri" },
  { key: "Sat", label: "Sat" },
  { key: "Sun", label: "Sun" }
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
  const patch = (day: DayKey, dayPatch: Partial<DayState>) => {
    onChange({ ...value, [day]: { ...value[day], ...dayPatch } });
  };

  return (
    <View style={{ gap: 6 }}>
      {DAYS.map(({ key, label }) => {
        const d = value[key];
        return (
          <View
            key={key}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 4
            }}
          >
            <Text
              style={{ width: 36, fontSize: 12, fontWeight: "700", color: theme.colors.ink }}
            >
              {label}
            </Text>
            <Pressable
              onPress={() => patch(key, { open: !d.open })}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: theme.radius.pill,
                backgroundColor: d.open ? theme.colors.primaryBg : theme.colors.border
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: d.open ? theme.colors.primary : theme.colors.muted
                }}
              >
                {d.open ? "OPEN" : "CLOSED"}
              </Text>
            </Pressable>
            <TextInput
              value={d.from}
              onChangeText={(v) => patch(key, { from: v })}
              editable={d.open}
              placeholder="09:00"
              placeholderTextColor={theme.colors.muted}
              style={{
                flex: 1,
                height: 34,
                paddingHorizontal: 8,
                borderRadius: theme.radius.sm,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: d.open ? theme.colors.background : theme.colors.border,
                color: theme.colors.ink,
                fontSize: 12,
                textAlign: "center"
              }}
            />
            <Text style={{ fontSize: 10, color: theme.colors.muted }}>–</Text>
            <TextInput
              value={d.to}
              onChangeText={(v) => patch(key, { to: v })}
              editable={d.open}
              placeholder="17:00"
              placeholderTextColor={theme.colors.muted}
              style={{
                flex: 1,
                height: 34,
                paddingHorizontal: 8,
                borderRadius: theme.radius.sm,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: d.open ? theme.colors.background : theme.colors.border,
                color: theme.colors.ink,
                fontSize: 12,
                textAlign: "center"
              }}
            />
          </View>
        );
      })}
    </View>
  );
}
