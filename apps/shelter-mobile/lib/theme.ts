// Shelter mobile theme. Brand tokens come from @petto/design-tokens
// so shelter-mobile stays in lockstep with the fetcht adopter app
// (apps/mobile) and the shelter-web dashboard. The legacy flat
// `theme` export is preserved for backward compatibility — every
// existing screen reading `theme.colors.primary` keeps working —
// while new screens can opt into dark mode via the useTheme() hook.

import { useColorScheme } from "react-native";
import { pettoTheme } from "@petto/design-tokens";

const light = {
  background: "#FFFBF6",
  surface: "#FFFFFF",
  card: "#FFFFFF",
  ink: pettoTheme.brand.ink,
  muted: pettoTheme.brand.muted,
  border: "rgba(22, 21, 20, 0.08)",
  borderStrong: "rgba(22, 21, 20, 0.16)",
  primary: pettoTheme.brand.primary,
  primarySoft: pettoTheme.brand.primarySoft,
  primaryBg: "rgba(230, 105, 74, 0.10)",
  secondary: pettoTheme.brand.secondary,
  accent: pettoTheme.brand.accent,
  success: "#3F7D4E",
  successBg: "rgba(63, 125, 78, 0.10)",
  warning: "#C77F1F",
  warningBg: "rgba(199, 127, 31, 0.10)",
  danger: "#A14632",
  dangerBg: "rgba(161, 70, 50, 0.10)",
  white: "#FFFFFF"
} as const;

const dark = {
  background: "#121212",
  surface: "#1E1E1E",
  card: "#1E1E1E",
  ink: "#EAEAEA",
  muted: "#9E9A95",
  border: "rgba(255, 255, 255, 0.10)",
  borderStrong: "rgba(255, 255, 255, 0.18)",
  primary: "#E6694A",
  primarySoft: "#3D2520",
  primaryBg: "rgba(230, 105, 74, 0.15)",
  secondary: "#5BA89A",
  accent: "#F7B267",
  success: "#5CB870",
  successBg: "rgba(92, 184, 112, 0.12)",
  warning: "#E0A65C",
  warningBg: "rgba(224, 166, 92, 0.12)",
  danger: "#E05A47",
  dangerBg: "rgba(224, 90, 71, 0.12)",
  white: "#1E1E1E"
} as const;

const base = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    "2xl": 28
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    pill: 999
  },
  shadow: {
    sm: {
      shadowColor: "#000",
      shadowOpacity: 0.04,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1 as const
    },
    md: {
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3 as const
    }
  }
} as const;

// Legacy static export. 25+ existing screens read from this directly
// with `import { theme } from "@/lib/theme"`. Keeping it stable and
// pointing at the light palette means those screens pick up the new
// brand-token sourcing without any rewriting.
export const theme = {
  colors: light,
  ...base
} as const;

export type Theme = typeof theme;

/**
 * useTheme returns a light or dark theme based on the device's color
 * scheme. New screens should call this hook; it mirrors the API used
 * by apps/mobile (the fetcht adopter app) so the two apps share a
 * single mental model.
 */
export function useTheme() {
  const scheme = useColorScheme();
  return {
    colors: scheme === "dark" ? dark : light,
    ...base,
    isDark: scheme === "dark"
  };
}
