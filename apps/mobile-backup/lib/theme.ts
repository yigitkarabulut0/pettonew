import { pettoTheme } from "@petto/design-tokens";

export const mobileTheme = {
  colors: {
    background: pettoTheme.brand.canvas,
    surface: pettoTheme.brand.surface,
    card: pettoTheme.brand.card,
    primary: pettoTheme.brand.primary,
    primarySoft: pettoTheme.brand.primarySoft,
    secondary: pettoTheme.brand.secondary,
    accent: pettoTheme.brand.accent,
    ink: pettoTheme.brand.ink,
    muted: pettoTheme.brand.muted,
    border: pettoTheme.brand.border,
    success: "#3F7D4E",
    danger: "#A14632"
  },
  radius: pettoTheme.radius
} as const;

