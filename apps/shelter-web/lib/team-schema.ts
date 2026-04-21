import { z } from "zod";

// Mirrors the server-side allowed roles; keeping these in lockstep
// means the UI can surface role-specific copy without a round-trip.

export const roleEnum = z.enum(["admin", "editor", "viewer"]);

export const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: roleEnum
});
export type InviteFormValues = z.infer<typeof inviteSchema>;

export const acceptSchema = z
  .object({
    name: z
      .string()
      .min(1, "Your name is required")
      .max(80, "Max 80 characters"),
    password: z
      .string()
      .min(8, "At least 8 characters")
      .max(128, "Max 128 characters"),
    confirmPassword: z.string()
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match"
  });
export type AcceptFormValues = z.infer<typeof acceptSchema>;

export const roleLabels: Record<z.infer<typeof roleEnum>, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer"
};

export const roleDescriptions: Record<z.infer<typeof roleEnum>, string> = {
  admin: "Full access — manage team, listings, applications, and profile.",
  editor: "Create and edit listings, manage applications. No team or profile edits.",
  viewer: "Read-only — can see listings and applications."
};

export type ApplyRole = z.infer<typeof roleEnum>;
