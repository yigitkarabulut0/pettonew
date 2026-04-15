import { Pressable, ScrollView, Text, View } from "react-native";
import {
  ArrowUpDown,
  CalendarDays,
  Clock,
  Sparkles
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { mobileTheme, useTheme } from "@/lib/theme";

// v0.11.0 — the "custom" range was never wired up to a picker, so it just
// silently fell back to "all". Dropped the button entirely; users now pick
// between All / Today / This week (the backend also exposes `from`/`to` query
// params if we ever need to bring it back).
export type TimeFilter = "all" | "today" | "week";
export type SortMode = "distance" | "time";

type PlaydateFiltersProps = {
  time: TimeFilter;
  onTimeChange: (next: TimeFilter) => void;
  sort: SortMode;
  onSortToggle: () => void;
};

export function PlaydateFilters({
  time,
  onTimeChange,
  sort,
  onSortToggle
}: PlaydateFiltersProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const timeOptions: Array<{
    key: TimeFilter;
    label: string;
    icon: React.ComponentType<{ size: number; color: string }>;
  }> = [
    { key: "all", label: t("playdates.filterAll") as string, icon: Sparkles },
    { key: "today", label: t("playdates.today") as string, icon: Clock },
    { key: "week", label: t("playdates.thisWeek") as string, icon: CalendarDays }
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: mobileTheme.spacing.xl,
        gap: 8
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 8 }}
      >
        {timeOptions.map(({ key, label, icon: Icon }) => {
          const active = time === key;
          return (
            <Pressable
              key={key}
              onPress={() => onTimeChange(key)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: 13,
                paddingVertical: 9,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: active ? theme.colors.primary : theme.colors.white,
                borderWidth: 1,
                borderColor: active ? theme.colors.primary : theme.colors.border,
                minHeight: 38,
                opacity: pressed ? 0.85 : 1,
                ...(active ? {} : mobileTheme.shadow.sm)
              })}
            >
              <Icon size={13} color={active ? theme.colors.white : theme.colors.muted} />
              <Text
                style={{
                  fontSize: 12,
                  color: active ? theme.colors.white : theme.colors.ink,
                  fontFamily: "Inter_600SemiBold"
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        onPress={onSortToggle}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderRadius: mobileTheme.radius.pill,
          backgroundColor: theme.colors.secondarySoft,
          borderWidth: 1,
          borderColor: theme.colors.secondarySoft,
          minHeight: 38,
          opacity: pressed ? 0.85 : 1
        })}
      >
        <ArrowUpDown size={13} color={theme.colors.secondary} />
        <Text
          style={{
            fontSize: 11,
            color: theme.colors.secondary,
            fontFamily: "Inter_700Bold"
          }}
        >
          {sort === "distance"
            ? (t("playdates.sortByDistance") as string)
            : (t("playdates.sortByTime") as string)}
        </Text>
      </Pressable>
    </View>
  );
}
