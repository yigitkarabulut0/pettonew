import { View } from "react-native";

import { mobileTheme } from "@/lib/theme";

interface DividerProps {
  marginVertical?: number;
}

export function Divider({
  marginVertical = mobileTheme.spacing.lg
}: DividerProps) {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: mobileTheme.colors.border,
        marginVertical
      }}
    />
  );
}
