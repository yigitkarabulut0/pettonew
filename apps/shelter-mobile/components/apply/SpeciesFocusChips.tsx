import { Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";

import type { ApplySpecies } from "@/lib/apply-schema";
import { speciesLabels } from "@/lib/apply-schema";
import { theme } from "@/lib/theme";

const ORDER: ApplySpecies[] = ["dog", "cat", "rabbit", "ferret", "small_mammal"];

type Props = {
  value: ApplySpecies[];
  onChange: (next: ApplySpecies[]) => void;
  error?: string;
};

export function SpeciesFocusChips({ value, onChange, error }: Props) {
  const selected = new Set(value);
  const toggle = (species: ApplySpecies) => {
    const next = new Set(selected);
    if (next.has(species)) next.delete(species);
    else next.add(species);
    onChange(ORDER.filter((s) => next.has(s)));
  };
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {ORDER.map((species) => {
          const active = selected.has(species);
          return (
            <Pressable
              key={species}
              onPress={() => toggle(species)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 14,
                height: 40,
                borderRadius: theme.radius.pill,
                backgroundColor: active
                  ? theme.colors.primary
                  : "#FFFFFF",
                borderWidth: 1,
                borderColor: active
                  ? theme.colors.primary
                  : theme.colors.border,
                opacity: pressed ? 0.85 : 1
              })}
            >
              {active && <Check size={14} color="#FFFFFF" />}
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: active ? "#FFFFFF" : theme.colors.ink
                }}
              >
                {speciesLabels[species]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error && (
        <Text style={{ fontSize: 12, color: theme.colors.danger }}>
          {error}
        </Text>
      )}
    </View>
  );
}
