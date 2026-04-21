// Pets list — shelter's own listings with filter tabs, status
// badges, and a multi-select mode that pops a BulkActionBar for
// batch pause / mark-adopted / archive / delete. Matches shelter-web.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlatList, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Check, CheckSquare, PawPrint, Plus, Square } from "lucide-react-native";

import { listShelterPets } from "@/lib/api";
import { theme, useTheme } from "@/lib/theme";
import { BulkActionBar } from "@/components/listing-actions";

const FILTERS = ["all", "available", "reserved", "adopted", "hidden"] as const;

export default function PetsScreen() {
  const router = useRouter();
  const t = useTheme();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("all");

  // Multi-select state. Entering select mode swaps the row tap handler
  // from "open pet" to "toggle select". Exit resets selection.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const { data: pets = [] } = useQuery({
    queryKey: ["shelter-pets", status],
    queryFn: () => listShelterPets(status === "all" ? undefined : status)
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: t.colors.background }}
      edges={["top"]}
    >
      <View
        style={{
          paddingHorizontal: theme.spacing.xl,
          paddingVertical: theme.spacing.md,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: "700", color: t.colors.ink }}>
          Pets
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
          <Pressable
            onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            hitSlop={6}
            style={({ pressed }) => ({
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: selectMode ? t.colors.primary : t.colors.border,
              backgroundColor: selectMode ? t.colors.primaryBg : "transparent",
              opacity: pressed ? 0.7 : 1
            })}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: selectMode ? t.colors.primary : t.colors.muted
              }}
            >
              {selectMode ? "Done" : "Select"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(app)/pets/new" as any)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: theme.radius.pill,
              backgroundColor: t.colors.primary
            }}
          >
            <Plus size={14} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>
              Add
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Status filter row — hidden in select mode to keep the UI calm. */}
      {!selectMode && (
        <View
          style={{
            paddingHorizontal: theme.spacing.xl,
            paddingBottom: theme.spacing.sm,
            flexDirection: "row",
            gap: 4
          }}
        >
          {FILTERS.map((f) => {
            const on = status === f;
            return (
              <Pressable
                key={f}
                onPress={() => setStatus(f)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: theme.radius.pill,
                  backgroundColor: on ? t.colors.primary : t.colors.surface,
                  borderWidth: 1,
                  borderColor: on ? t.colors.primary : t.colors.border
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: on ? "#FFFFFF" : t.colors.ink,
                    textTransform: "capitalize"
                  }}
                >
                  {f}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <FlatList
        data={pets}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{
          padding: theme.spacing.xl,
          paddingBottom: selectMode ? 120 : theme.spacing.xl,
          gap: theme.spacing.md
        }}
        renderItem={({ item }) => {
          const isSelected = selected.has(item.id);
          return (
            <Pressable
              onPress={() => {
                if (selectMode) toggleSelect(item.id);
                else router.push(`/(app)/pets/${item.id}` as any);
              }}
              onLongPress={() => {
                if (!selectMode) {
                  setSelectMode(true);
                  toggleSelect(item.id);
                }
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                gap: theme.spacing.md,
                padding: theme.spacing.md,
                borderRadius: theme.radius.lg,
                backgroundColor: t.colors.surface,
                borderWidth: 1,
                borderColor: isSelected ? t.colors.primary : t.colors.border,
                opacity: pressed ? 0.85 : 1
              })}
            >
              {selectMode ? (
                <View
                  style={{
                    width: 24,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {isSelected ? (
                    <CheckSquare size={20} color={t.colors.primary} />
                  ) : (
                    <Square size={20} color={t.colors.muted} />
                  )}
                </View>
              ) : null}
              {item.photos?.[0] ? (
                <Image
                  source={{ uri: item.photos[0] }}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: theme.radius.md,
                    backgroundColor: t.colors.border
                  }}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: theme.radius.md,
                    backgroundColor: t.colors.border,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <PawPrint size={22} color={t.colors.muted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text
                    style={{ fontSize: 15, fontWeight: "700", color: t.colors.ink }}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <StateBadge state={item.listingState} theme={t} />
                </View>
                <Text
                  style={{ marginTop: 2, fontSize: 11, color: t.colors.muted }}
                  numberOfLines={1}
                >
                  {[item.breed, item.sex].filter(Boolean).join(" · ")}
                </Text>
                {item.isUrgent ? (
                  <Text
                    style={{ marginTop: 4, fontSize: 10, color: t.colors.danger, fontWeight: "700" }}
                  >
                    ⚠ Urgent
                  </Text>
                ) : null}
                {item.specialNeeds ? (
                  <Text
                    style={{ marginTop: 4, fontSize: 10, color: t.colors.warning }}
                    numberOfLines={1}
                  >
                    ⚠ {item.specialNeeds}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 48, gap: 8 }}>
            <PawPrint size={32} color={t.colors.muted} />
            <Text style={{ fontSize: 13, color: t.colors.muted }}>
              No pets in this filter
            </Text>
          </View>
        }
      />

      {/* Floating bulk action bar — only when something's selected. */}
      {selectMode && (
        <BulkActionBar
          selectedIds={selectedIds}
          allPets={pets}
          onClear={exitSelectMode}
          onDone={exitSelectMode}
        />
      )}
    </SafeAreaView>
  );
}

// Listing-state badge (distinct from the older availability-status
// badge). Shows the moderation lifecycle state — matches shelter-web.
function StateBadge({
  state,
  theme: t
}: {
  state: string;
  theme: ReturnType<typeof useTheme>;
}) {
  const palette: Record<string, { bg: string; fg: string }> = {
    draft: { bg: t.colors.border, fg: t.colors.muted },
    pending_review: { bg: t.colors.warningBg, fg: t.colors.warning },
    published: { bg: t.colors.successBg, fg: t.colors.success },
    paused: { bg: "rgba(71, 85, 105, 0.1)", fg: "#475569" },
    adopted: { bg: "rgba(13, 148, 136, 0.1)", fg: "#0F766E" },
    archived: { bg: t.colors.border, fg: t.colors.muted },
    rejected: { bg: t.colors.dangerBg, fg: t.colors.danger }
  };
  const p = palette[state] ?? palette.draft!;
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: theme.radius.pill,
        backgroundColor: p.bg
      }}
    >
      <Text
        style={{
          fontSize: 9,
          fontWeight: "700",
          color: p.fg,
          letterSpacing: 0.3,
          textTransform: "uppercase"
        }}
      >
        {(state ?? "").replace(/_/g, " ")}
      </Text>
    </View>
  );
}
