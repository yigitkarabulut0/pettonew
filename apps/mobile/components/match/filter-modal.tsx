import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { PrimaryButton } from "@/components/primary-button";
import { mobileTheme, useTheme } from "@/lib/theme";

interface Filters {
  species: string | null;
  distance: string | null;
  activityLevel: number | null;
  goodWith: string[];
  neutered: boolean | null;
}

const DEFAULT_FILTERS: Filters = {
  species: null,
  distance: null,
  activityLevel: null,
  goodWith: [],
  neutered: null
};

const ACTIVITY_LABELS: Record<number, string> = {
  1: "Very calm",
  2: "Relaxed",
  3: "Balanced",
  4: "Active",
  5: "Very active"
};

interface FilterModalProps {
  visible: boolean;
  filters: Filters;
  speciesList: string[];
  goodWithOptions: string[];
  onApply: (filters: Filters) => void;
  onClose: () => void;
}

export type { Filters };

export { DEFAULT_FILTERS, ACTIVITY_LABELS };

export function FilterModal({
  visible,
  filters,
  speciesList,
  goodWithOptions,
  onApply,
  onClose
}: FilterModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [local, setLocal] = useState<Filters>(filters);

  useEffect(() => {
    if (visible) setLocal(filters);
  }, [visible, filters]);

  const reset = () => setLocal(DEFAULT_FILTERS);

  const toggleGoodWith = (item: string) => {
    setLocal((prev) => ({
      ...prev,
      goodWith: prev.goodWith.includes(item)
        ? prev.goodWith.filter((g) => g !== item)
        : [...prev.goodWith, item]
    }));
  };

  const hasChanges =
    local.species !== filters.species ||
    local.distance !== filters.distance ||
    local.activityLevel !== filters.activityLevel ||
    JSON.stringify(local.goodWith) !== JSON.stringify(filters.goodWith) ||
    local.neutered !== filters.neutered;

  const localCount = useMemo(() => {
    let count = 0;
    if (local.species) count++;
    if (local.distance) count++;
    if (local.activityLevel !== null) count++;
    if (local.goodWith.length > 0) count++;
    if (local.neutered !== null) count++;
    return count;
  }, [local]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: insets.top + mobileTheme.spacing.md,
            paddingBottom: mobileTheme.spacing.md,
            paddingHorizontal: mobileTheme.spacing.xl
          }}
        >
          <Text
            style={{
              fontSize: mobileTheme.typography.heading.fontSize,
              fontWeight: mobileTheme.typography.heading.fontWeight,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            Filters{localCount > 0 ? ` (${localCount})` : ""}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={22} color={theme.colors.ink} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingVertical: mobileTheme.spacing.sm,
            gap: mobileTheme.spacing["2xl"]
          }}
        >
          {speciesList.length > 0 && (
            <FilterSection title="Species">
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: mobileTheme.spacing.sm
                }}
              >
                <FilterChip
                  label="All"
                  active={local.species === null}
                  onPress={() => setLocal((p) => ({ ...p, species: null }))}
                />
                {speciesList.map((s) => (
                  <FilterChip
                    key={s}
                    label={s}
                    active={local.species === s}
                    onPress={() =>
                      setLocal((p) => ({
                        ...p,
                        species: p.species === s ? null : s
                      }))
                    }
                  />
                ))}
              </View>
            </FilterSection>
          )}

          <FilterSection title="Distance">
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: mobileTheme.spacing.sm
              }}
            >
              <FilterChip
                label="Any"
                active={local.distance === null}
                onPress={() => setLocal((p) => ({ ...p, distance: null }))}
              />
              {(["5", "10", "25", "50"] as const).map((d) => (
                <FilterChip
                  key={d}
                  label={`< ${d} km`}
                  active={local.distance === d}
                  onPress={() =>
                    setLocal((p) => ({
                      ...p,
                      distance: p.distance === d ? null : d
                    }))
                  }
                />
              ))}
            </View>
          </FilterSection>

          <FilterSection title="Energy level">
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: mobileTheme.spacing.sm
              }}
            >
              <FilterChip
                label="Any"
                active={local.activityLevel === null}
                onPress={() => setLocal((p) => ({ ...p, activityLevel: null }))}
              />
              {([1, 2, 3, 4, 5] as const).map((level) => (
                <FilterChip
                  key={level}
                  label={ACTIVITY_LABELS[level] ?? String(level)}
                  active={local.activityLevel === level}
                  onPress={() =>
                    setLocal((p) => ({
                      ...p,
                      activityLevel: p.activityLevel === level ? null : level
                    }))
                  }
                />
              ))}
            </View>
          </FilterSection>

          <FilterSection title="Good with">
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: mobileTheme.spacing.sm
              }}
            >
              {goodWithOptions.map((item) => (
                <FilterChip
                  key={item}
                  label={item}
                  active={local.goodWith.includes(item)}
                  onPress={() => toggleGoodWith(item)}
                />
              ))}
            </View>
          </FilterSection>

          <FilterSection title="Neutered">
            <View
              style={{
                flexDirection: "row",
                gap: mobileTheme.spacing.sm
              }}
            >
              <FilterChip
                label="Any"
                active={local.neutered === null}
                onPress={() => setLocal((p) => ({ ...p, neutered: null }))}
              />
              <FilterChip
                label="Yes"
                active={local.neutered === true}
                onPress={() =>
                  setLocal((p) => ({
                    ...p,
                    neutered: p.neutered === true ? null : true
                  }))
                }
              />
              <FilterChip
                label="No"
                active={local.neutered === false}
                onPress={() =>
                  setLocal((p) => ({
                    ...p,
                    neutered: p.neutered === false ? null : false
                  }))
                }
              />
            </View>
          </FilterSection>
        </ScrollView>

        <View
          style={{
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingVertical: mobileTheme.spacing.lg,
            paddingBottom: insets.bottom + mobileTheme.spacing.lg,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            gap: mobileTheme.spacing.sm
          }}
        >
          {localCount > 0 && (
            <PrimaryButton
              label="Reset filters"
              onPress={reset}
              variant="ghost"
            />
          )}
          <PrimaryButton
            label={
              hasChanges
                ? `Apply${localCount > 0 ? ` (${localCount})` : ""}`
                : "Done"
            }
            onPress={() => {
              if (hasChanges) {
                onApply(local);
              } else {
                onClose();
              }
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

function FilterSection({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View>
      <Text
        style={{
          fontSize: mobileTheme.typography.label.fontSize,
          fontWeight: mobileTheme.typography.label.fontWeight,
          color: theme.colors.muted,
          fontFamily: "Inter_700Bold",
          letterSpacing: 0.5,
          textTransform: "uppercase",
          marginBottom: mobileTheme.spacing.md
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: mobileTheme.spacing.lg,
        paddingVertical: mobileTheme.spacing.sm + 2,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: active
          ? theme.colors.primary
          : theme.colors.surface,
        borderWidth: 1.5,
        borderColor: active
          ? theme.colors.primary
          : theme.colors.border,
        opacity: pressed ? 0.7 : 1
      })}
    >
      <Text
        style={{
          fontSize: mobileTheme.typography.caption.fontSize,
          fontWeight: "600",
          fontFamily: "Inter_600SemiBold",
          color: active ? theme.colors.white : theme.colors.ink
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
