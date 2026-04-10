import { Component, type PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";

import { mobileTheme } from "@/lib/theme";

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<PropsWithChildren, State> {
  constructor(props: PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: mobileTheme.colors.background,
            alignItems: "center",
            justifyContent: "center",
            padding: mobileTheme.spacing["3xl"],
            gap: mobileTheme.spacing.xl
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: mobileTheme.colors.dangerBg,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <AlertTriangle size={32} color={mobileTheme.colors.danger} />
          </View>
          <Text
            style={{
              fontSize: mobileTheme.typography.subheading.fontSize,
              fontWeight: mobileTheme.typography.subheading.fontWeight,
              color: mobileTheme.colors.ink,
              fontFamily: "Inter_600SemiBold",
              textAlign: "center"
            }}
          >
            Something went wrong
          </Text>
          <Text
            style={{
              fontSize: mobileTheme.typography.body.fontSize,
              color: mobileTheme.colors.muted,
              fontFamily: "Inter_400Regular",
              textAlign: "center",
              maxWidth: 280
            }}
          >
            An unexpected error occurred. Please try again.
          </Text>
          <Pressable
            onPress={() => this.setState({ hasError: false })}
            style={{
              paddingHorizontal: mobileTheme.spacing.xl,
              paddingVertical: mobileTheme.spacing.lg,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: mobileTheme.colors.primary
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontFamily: "Inter_700Bold",
                fontWeight: "700",
                fontSize: mobileTheme.typography.body.fontSize
              }}
            >
              Try Again
            </Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}
