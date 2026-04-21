import { Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { theme } from "@/lib/theme";

// Mobile stepper — horizontal pills with a connector line that fills in
// as the user progresses. Labels are hidden on very narrow screens to
// keep the header uncluttered.

type Props = {
  steps: string[];
  current: number;
};

export function Stepper({ steps, current }: Props) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {steps.map((label, idx) => {
        const isComplete = idx < current;
        const isActive = idx === current;
        return (
          <View key={label} style={{ flex: 1, alignItems: "center" }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                width: "100%",
                gap: 4
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: theme.radius.pill,
                  backgroundColor: isComplete
                    ? theme.colors.primary
                    : "#FFFFFF",
                  borderWidth: isActive ? 2 : 1,
                  borderColor: isActive
                    ? theme.colors.primary
                    : isComplete
                      ? theme.colors.primary
                      : theme.colors.border,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                {isComplete ? (
                  <Check size={14} color="#FFFFFF" />
                ) : (
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: isActive
                        ? theme.colors.primary
                        : theme.colors.muted
                    }}
                  >
                    {idx + 1}
                  </Text>
                )}
              </View>
              {idx < steps.length - 1 && (
                <View
                  style={{
                    flex: 1,
                    height: 2,
                    borderRadius: 2,
                    backgroundColor: theme.colors.border,
                    overflow: "hidden"
                  }}
                >
                  <View
                    style={{
                      height: "100%",
                      width: idx < current ? "100%" : "0%",
                      backgroundColor: theme.colors.primary
                    }}
                  />
                </View>
              )}
            </View>
            <Text
              numberOfLines={1}
              style={{
                marginTop: 6,
                fontSize: 10,
                letterSpacing: 0.8,
                fontWeight: "700",
                textTransform: "uppercase",
                color: isActive
                  ? theme.colors.primary
                  : isComplete
                    ? theme.colors.ink
                    : theme.colors.muted,
                width: "100%",
                textAlign: "center"
              }}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
