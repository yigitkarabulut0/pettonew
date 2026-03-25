import { Text, TextInput, View } from "react-native";

import { mobileTheme } from "@/lib/theme";

interface InputFieldProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  secureTextEntry?: boolean;
  error?: string;
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words";
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  editable?: boolean;
  onPress?: () => void;
}

export function InputField({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry = false,
  error,
  multiline = false,
  autoCapitalize = "none",
  keyboardType = "default",
  editable = true,
  onPress
}: InputFieldProps) {
  const hasError = Boolean(error);

  return (
    <View style={{ gap: mobileTheme.spacing.xs }}>
      {label ? (
        <Text
          style={{
            fontSize: mobileTheme.typography.label.fontSize,
            fontWeight: mobileTheme.typography.label.fontWeight,
            color: mobileTheme.colors.muted,
            fontFamily: "Inter_700Bold",
            letterSpacing: mobileTheme.typography.label.letterSpacing,
            textTransform: "uppercase"
          }}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={mobileTheme.colors.muted}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        editable={editable && !onPress}
        onPressIn={onPress}
        style={{
          borderRadius: mobileTheme.radius.md,
          backgroundColor: editable
            ? mobileTheme.colors.white
            : mobileTheme.colors.background,
          borderWidth: 1,
          borderColor: hasError
            ? mobileTheme.colors.danger
            : mobileTheme.colors.border,
          paddingHorizontal: mobileTheme.spacing.lg,
          paddingVertical: mobileTheme.spacing.md + 3,
          color: mobileTheme.colors.ink,
          fontSize: mobileTheme.typography.body.fontSize,
          fontFamily: "Inter_400Regular",
          lineHeight: mobileTheme.typography.body.lineHeight,
          minHeight: multiline ? 100 : undefined,
          textAlignVertical: multiline ? "top" : "center"
        }}
      />
      {hasError ? (
        <Text
          style={{
            fontSize: 12,
            fontWeight: "600",
            color: mobileTheme.colors.danger,
            fontFamily: "Inter_600SemiBold"
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
