import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import type { ShelterEntityType } from "@petto/contracts";

import { WizardChrome, FieldLabel, FieldError } from "@/components/apply/WizardChrome";
import { CountryPills } from "@/components/apply/CountryPills";
import { fetchEntityTypes } from "@/lib/apply-api";
import { applyStep1Schema, type ApplyCountry } from "@/lib/apply-schema";
import { useApplyStore } from "@/store/apply";
import { theme } from "@/lib/theme";

export default function ApplyEntityTypeScreen() {
  const router = useRouter();
  const country = useApplyStore((s) => s.values.country);
  const entityType = useApplyStore((s) => s.values.entityType);
  const opRegionCountry = useApplyStore((s) => s.values.operatingRegionCountry);
  const setField = useApplyStore((s) => s.setField);

  const [types, setTypes] = useState<ShelterEntityType[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchEntityTypes(country)
      .then((list) => {
        if (cancelled) return;
        setTypes(list);
        if (entityType && !list.some((e) => e.slug === entityType)) {
          setField("entityType", "");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Could not load options"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  const next = () => {
    const parsed = applyStep1Schema.safeParse({ country, entityType });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Complete this step");
      return;
    }
    setFormError(null);
    router.push("/(apply)/registration");
  };

  return (
    <WizardChrome
      stepIndex={0}
      eyebrow="Step 1 of 5"
      title="Your organisation's home"
      description="We tailor document checks to your country. Pick the country where your shelter is officially registered."
      onNext={next}
      hideBack
    >
      <View style={{ gap: 8 }}>
        <FieldLabel>Country of registration</FieldLabel>
        <CountryPills
          value={country}
          onChange={(c) => {
            // When applicants change country we also reset their entity
            // type — the previous pick won't belong to the new country.
            setField("country", c);
            setField("entityType", "");
            // Convenience: if operating region is still the default, follow
            // along so step 3 is pre-filled.
            if (opRegionCountry === "TR" || !opRegionCountry) {
              setField("operatingRegionCountry", c);
            }
          }}
        />
      </View>

      <View style={{ gap: 8 }}>
        <FieldLabel>Entity type</FieldLabel>
        {loading ? (
          <View
            style={{
              paddingVertical: 24,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : loadError ? (
          <Text style={{ fontSize: 12, color: theme.colors.danger }}>
            {loadError}
          </Text>
        ) : (
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              overflow: "hidden"
            }}
          >
            {types.map((t, idx) => {
              const active = t.slug === entityType;
              return (
                <Pressable
                  key={t.slug}
                  onPress={() => setField("entityType", t.slug)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    gap: 12,
                    backgroundColor: pressed
                      ? theme.colors.primaryBg
                      : "#FFFFFF",
                    borderBottomWidth: idx < types.length - 1 ? 1 : 0,
                    borderBottomColor: theme.colors.border
                  })}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: active ? 6 : 1.5,
                      borderColor: active
                        ? theme.colors.primary
                        : theme.colors.border
                    }}
                  />
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 14,
                      color: theme.colors.ink,
                      fontWeight: active ? "600" : "400"
                    }}
                  >
                    {t.label}
                  </Text>
                  {active && (
                    <Check size={16} color={theme.colors.primary} />
                  )}
                </Pressable>
              );
            })}
            {types.length === 0 && (
              <View style={{ padding: 16 }}>
                <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
                  No entity types available for this country.
                </Text>
              </View>
            )}
          </View>
        )}
        <FieldError message={formError ?? undefined} />
      </View>
    </WizardChrome>
  );
}
