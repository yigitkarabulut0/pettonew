import { Text, View } from "react-native";
import { Calendar } from "lucide-react-native";

import { mobileTheme, useTheme } from "@/lib/theme";

const HUMAN_AGE_FACTORS: Record<string, (petAge: number) => number> = {
  dog: (age) => {
    if (age <= 0) return 0;
    if (age === 1) return 15;
    if (age === 2) return 24;
    return 24 + (age - 2) * 5;
  },
  cat: (age) => {
    if (age <= 0) return 0;
    if (age === 1) return 15;
    if (age === 2) return 24;
    return 24 + (age - 2) * 4;
  },
  rabbit: (age) => age * 8,
  bird: (age) => age * 9,
  other: (age) => age * 6
};

function getHumanAge(petAge: number, species: string): number {
  const speciesLower = species.toLowerCase();
  const calculator = HUMAN_AGE_FACTORS[speciesLower] ?? HUMAN_AGE_FACTORS.other;
  return Math.round(calculator(petAge));
}

interface AgeCalculatorProps {
  petName: string;
  ageYears: number;
  speciesLabel: string;
}

export function AgeCalculator({ petName, ageYears, speciesLabel }: AgeCalculatorProps) {
  const theme = useTheme();
  const humanAge = getHumanAge(ageYears, speciesLabel);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: mobileTheme.spacing.md,
        padding: mobileTheme.spacing.lg,
        borderRadius: mobileTheme.radius.md,
        backgroundColor: theme.colors.primaryBg,
        borderWidth: 1,
        borderColor: theme.colors.border
      }}
    >
      <Calendar size={18} color={theme.colors.primary} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: mobileTheme.typography.caption.fontSize,
            fontFamily: "Inter_600SemiBold",
            color: theme.colors.ink
          }}
        >
          {petName} is {ageYears} {ageYears === 1 ? "year" : "years"} old
        </Text>
        <Text
          style={{
            fontSize: mobileTheme.typography.micro.fontSize,
            fontFamily: "Inter_400Regular",
            color: theme.colors.muted,
            marginTop: 2
          }}
        >
          ~{humanAge} in human years
        </Text>
      </View>
    </View>
  );
}
