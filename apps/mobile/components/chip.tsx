import { Pressable, Text } from "react-native";

import { mobileTheme } from "@/lib/theme";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
}

export function Chip({
  label,
  selected = false,
  onPress,
  onRemove
}: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: mobileTheme.spacing.xs,
        paddingHorizontal: mobileTheme.spacing.md,
        paddingVertical: mobileTheme.spacing.sm,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: selected
          ? mobileTheme.colors.primaryBg
          : mobileTheme.colors.surface,
        borderWidth: 1,
        borderColor: selected
          ? mobileTheme.colors.primary
          : mobileTheme.colors.border
      }}
    >
      <Text
        style={{
          fontSize: mobileTheme.typography.caption.fontSize,
          fontWeight: mobileTheme.typography.caption.fontWeight,
          color: selected ? mobileTheme.colors.primary : mobileTheme.colors.ink,
          fontFamily: "Inter_600SemiBold"
        }}
      >
        {label}
      </Text>
      {onRemove && (
        <Text
          onPress={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            fontSize: 11,
            color: mobileTheme.colors.danger,
            fontWeight: "700"
          }}
        >
          Remove
        </Text>
      )}
    </Pressable>
  );
}
