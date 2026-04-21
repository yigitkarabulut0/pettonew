import { Pressable, ScrollView, Text, View } from "react-native";

import {
  countryLabels,
  type ApplyCountry
} from "@/lib/apply-schema";
import { theme } from "@/lib/theme";

const ORDER: ApplyCountry[] = [
  "TR",
  "GB",
  "US",
  "DE",
  "FR",
  "IT",
  "ES",
  "NL",
  "IE",
  "other_eu"
];

type Props = {
  value: ApplyCountry;
  onChange: (c: ApplyCountry) => void;
};

export function CountryPills({ value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingRight: 4 }}
    >
      {ORDER.map((c) => {
        const active = value === c;
        return (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              height: 36,
              borderRadius: theme.radius.pill,
              backgroundColor: active
                ? theme.colors.primary
                : "#FFFFFF",
              borderWidth: 1,
              borderColor: active
                ? theme.colors.primary
                : theme.colors.border,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.85 : 1
            })}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: active ? "#FFFFFF" : theme.colors.ink
              }}
            >
              {countryLabels[c]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function CountryLabel({ country }: { country: ApplyCountry }) {
  return (
    <Text style={{ fontSize: 14, color: theme.colors.ink }}>
      {countryLabels[country]}
    </Text>
  );
}

export { ORDER as COUNTRY_ORDER };
