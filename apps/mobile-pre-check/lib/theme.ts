import { pettoTheme } from "@petto/design-tokens";

export const mobileTheme = {
  colors: pettoTheme.brand,
  radius: pettoTheme.radius,
  typography: pettoTheme.typography,
  fontFamily: "Inter"
} as const;
