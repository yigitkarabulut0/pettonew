export const pettoTheme = {
  brand: {
    primary: "#E6694A",
    primarySoft: "#F7C9BC",
    secondary: "#21433C",
    accent: "#F7B267",
    ink: "#161514",
    muted: "#6E6A65",
    card: "#FFF8F1",
    canvas: "#F5EDE3",
    surface: "#FFFCF8",
    border: "rgba(22, 21, 20, 0.12)"
  },
  radius: {
    sm: 12,
    md: 20,
    lg: 28,
    pill: 999
  },
  shadow: {
    soft: "0 16px 50px rgba(22, 21, 20, 0.10)",
    medium: "0 24px 80px rgba(22, 21, 20, 0.14)"
  }
} as const;

export const pettoWebCssVariables = `
:root {
  --petto-primary: ${pettoTheme.brand.primary};
  --petto-primary-soft: ${pettoTheme.brand.primarySoft};
  --petto-secondary: ${pettoTheme.brand.secondary};
  --petto-accent: ${pettoTheme.brand.accent};
  --petto-ink: ${pettoTheme.brand.ink};
  --petto-muted: ${pettoTheme.brand.muted};
  --petto-card: ${pettoTheme.brand.card};
  --petto-canvas: ${pettoTheme.brand.canvas};
  --petto-surface: ${pettoTheme.brand.surface};
  --petto-border: ${pettoTheme.brand.border};
}
`;
