import { StyleSheet } from "react-native";

import { mobileTheme } from "./theme";

const f = mobileTheme.fontFamily;
const c = mobileTheme.colors;
const r = mobileTheme.radius;

export const styles = StyleSheet.create({
  card: {
    borderRadius: r.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border
  },
  cardNoBorder: {
    borderRadius: r.lg,
    backgroundColor: c.surface
  },
  input: {
    borderRadius: r.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: c.ink,
    fontSize: 16,
    fontFamily: f
  },
  inputError: {
    borderColor: c.danger
  },
  fieldLabel: {
    color: c.secondary,
    fontWeight: "600" as const,
    fontSize: 13,
    fontFamily: f
  },
  errorText: {
    color: c.danger,
    fontSize: 13,
    fontWeight: "500" as const,
    fontFamily: f
  },
  sectionTitle: {
    color: c.secondary,
    fontWeight: "600" as const,
    fontSize: 15,
    fontFamily: f
  },
  text: {
    color: c.ink,
    fontFamily: f
  },
  textMuted: {
    color: c.muted,
    fontFamily: f
  },
  textSecondary: {
    color: c.secondary,
    fontFamily: f
  },
  textSmall: {
    color: c.muted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: f
  }
});
