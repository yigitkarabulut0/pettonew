import { Pressable, ScrollView, Text, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react-native";

import { DraggableSheet } from "@/components/draggable-sheet";
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

const ACTIVITY_LABEL_KEYS: Record<number, string> = {
  1: "onboarding.pets.activityVeryCalmShort",
  2: "onboarding.pets.activityRelaxed",
  3: "onboarding.pets.activityBalanced",
  4: "onboarding.pets.activityActive",
  5: "onboarding.pets.activityVeryActive"
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

export { DEFAULT_FILTERS };

export function FilterModal({
  visible,
  filters,
  speciesList,
  goodWithOptions,
  onApply,
  onClose
}: FilterModalProps) {
  const theme = useTheme();
  const { t } = useTranslation();
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
    <DraggableSheet
      visible={visible}
      onClose={onClose}
      initialSnap="large"
      snapPoints={{ medium: 0.65, large: 0.95 }}
    >
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: mobileTheme.spacing.sm,
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
            {t("match.filter.title")}{localCount > 0 ? ` (${localCount})` : ""}
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
            <FilterSection title={t("match.filter.species")}>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: mobileTheme.spacing.sm
                }}
              >
                <FilterChip
                  label={t("common.all")}
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

          <FilterSection title={t("match.filter.distance")}>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: mobileTheme.spacing.sm
              }}
            >
              <FilterChip
                label={t("common.any")}
                active={local.distance === null}
                onPress={() => setLocal((p) => ({ ...p, distance: null }))}
              />
              {(["5", "10", "25", "50"] as const).map((d) => (
                <FilterChip
                  key={d}
                  label={t("match.filter.lessThanKm", { distance: d })}
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

          <FilterSection title={t("match.filter.energyLevel")}>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: mobileTheme.spacing.sm
              }}
            >
              <FilterChip
                label={t("common.any")}
                active={local.activityLevel === null}
                onPress={() => setLocal((p) => ({ ...p, activityLevel: null }))}
              />
              {([1, 2, 3, 4, 5] as const).map((level) => (
                <FilterChip
                  key={level}
                  label={t(ACTIVITY_LABEL_KEYS[level])}
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

          <FilterSection title={t("match.filter.goodWith")}>
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

          <FilterSection title={t("match.filter.neutered")}>
            <View
              style={{
                flexDirection: "row",
                gap: mobileTheme.spacing.sm
              }}
            >
              <FilterChip
                label={t("common.any")}
                active={local.neutered === null}
                onPress={() => setLocal((p) => ({ ...p, neutered: null }))}
              />
              <FilterChip
                label={t("common.yes")}
                active={local.neutered === true}
                onPress={() =>
                  setLocal((p) => ({
                    ...p,
                    neutered: p.neutered === true ? null : true
                  }))
                }
              />
              <FilterChip
                label={t("common.no")}
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
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            gap: mobileTheme.spacing.sm
          }}
        >
          {localCount > 0 && (
            <PrimaryButton
              label={t("match.filter.resetFilters")}
              onPress={reset}
              variant="ghost"
            />
          )}
          <PrimaryButton
            label={
              hasChanges
                ? `${t("common.apply")}${localCount > 0 ? ` (${localCount})` : ""}`
                : t("common.done")
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
    </DraggableSheet>
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
