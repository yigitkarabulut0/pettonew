import { pettoTheme } from "@petto/design-tokens";

export const mobileTheme = {
  colors: {
    background: "#FAFAFA",
    surface: "#FFFFFF",
    card: "#FFFFFF",
    primary: pettoTheme.brand.primary,
    primaryLight: "#F28B72",
    primarySoft: pettoTheme.brand.primarySoft,
    primaryDark: "#C95438",
    primaryBg: "rgba(230, 105, 74, 0.08)",
    secondary: pettoTheme.brand.secondary,
    secondaryLight: "#2D5A50",
    secondarySoft: "rgba(33, 67, 60, 0.08)",
    accent: pettoTheme.brand.accent,
    ink: pettoTheme.brand.ink,
    muted: pettoTheme.brand.muted,
    border: "rgba(22, 21, 20, 0.08)",
    borderStrong: "rgba(22, 21, 20, 0.15)",
    success: "#3F7D4E",
    successBg: "rgba(63, 125, 78, 0.08)",
    danger: "#A14632",
    dangerBg: "rgba(161, 70, 50, 0.08)",
    white: "#FFFFFF",
    overlay: "rgba(22, 21, 20, 0.4)",
    chatBg: "#F0ECE8",
    likeGreen: "#3FBA6A",
    likeGreenBg: "rgba(63, 186, 106, 0.12)",
    passRed: "#E74C3C",
    passRedBg: "rgba(231, 76, 60, 0.12)",
    starGold: "#F7B267"
  },
  radius: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 24,
    xl: 32,
    pill: 999
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    "2xl": 24,
    "3xl": 32,
    "4xl": 48
  },
  typography: {
    display: {
      fontSize: 34,
      fontWeight: "800" as const,
      lineHeight: 40,
      letterSpacing: -0.5
    },
    heading: {
      fontSize: 24,
      fontWeight: "700" as const,
      lineHeight: 30,
      letterSpacing: -0.3
    },
    subheading: {
      fontSize: 18,
      fontWeight: "600" as const,
      lineHeight: 24,
      letterSpacing: -0.2
    },
    body: {
      fontSize: 15,
      fontWeight: "400" as const,
      lineHeight: 22
    },
    bodySemiBold: {
      fontSize: 15,
      fontWeight: "600" as const,
      lineHeight: 22
    },
    caption: {
      fontSize: 13,
      fontWeight: "500" as const,
      lineHeight: 18
    },
    label: {
      fontSize: 12,
      fontWeight: "700" as const,
      lineHeight: 16,
      letterSpacing: 0.5
    },
    micro: {
      fontSize: 11,
      fontWeight: "600" as const,
      lineHeight: 14
    }
  },
  shadow: {
    sm: {
      shadowColor: "#161514",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3
    },
    md: {
      shadowColor: "#161514",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 8
    },
    lg: {
      shadowColor: "#161514",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.12,
      shadowRadius: 32,
      elevation: 16
    }
  }
} as const;
