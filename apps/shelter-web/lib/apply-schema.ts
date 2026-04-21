import { z } from "zod";

// Kept in lockstep with the Go validator (server is authoritative) —
// any time a field gains a new rule, update both sides.

const countryEnum = z.enum([
  "TR",
  "GB",
  "US",
  "DE",
  "FR",
  "IT",
  "ES",
  "NL",
  "IE",
  "other_eu"
]);

const speciesEnum = z.enum(["dog", "cat", "rabbit", "ferret", "small_mammal"]);

export const applyStep1Schema = z.object({
  country: countryEnum,
  entityType: z.string().min(1, "Select an entity type")
});

export const applyStep2Schema = z.object({
  registrationNumber: z
    .string()
    .min(1, "Registration number is required")
    .max(100, "Must be 100 characters or fewer"),
  registrationCertificateUrl: z
    .string()
    .url("Upload a registration certificate to continue")
});

const applyStep3ShapeSchema = z.object({
  orgName: z
    .string()
    .min(1, "Organisation name is required")
    .max(150, "Must be 150 characters or fewer"),
  orgAddress: z.string().max(300, "Must be 300 characters or fewer").optional(),
  operatingRegionCountry: countryEnum,
  operatingRegionCity: z
    .string()
    .min(1, "City is required")
    .max(150, "Must be 150 characters or fewer"),
  speciesFocus: z.array(speciesEnum).min(1, "Pick at least one species"),
  donationUrl: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => !value || /^https?:\/\//i.test(value),
      "Enter a full URL (https://…)"
    )
});

export const applyStep3Schema = applyStep3ShapeSchema.refine(
  (v) =>
    (v.operatingRegionCountry ?? "").length +
      (v.operatingRegionCity ?? "").length <=
    200,
  { path: ["operatingRegionCity"], message: "Region + city must be ≤200 chars" }
);

export const applyStep4Schema = z.object({
  primaryContactName: z
    .string()
    .min(1, "Contact name is required")
    .max(100, "Must be 100 characters or fewer"),
  primaryContactEmail: z.string().email("Enter a valid email"),
  // Phone is optional; we soft-validate for an E.164-ish shape but don't
  // reject. Leaving detailed formatting + country-code UX to a later
  // polish pass.
  primaryContactPhone: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => !value || /^\+?[0-9 ()-]{6,20}$/.test(value),
      "Enter a valid phone number"
    )
});

export const applySubmissionSchema = applyStep1Schema
  .merge(applyStep2Schema)
  .merge(applyStep3ShapeSchema)
  .merge(applyStep4Schema);

export type ApplySubmissionValues = z.infer<typeof applySubmissionSchema>;

export const defaultSubmission: ApplySubmissionValues = {
  country: "TR",
  entityType: "",
  registrationNumber: "",
  registrationCertificateUrl: "",
  orgName: "",
  orgAddress: "",
  operatingRegionCountry: "TR",
  operatingRegionCity: "",
  speciesFocus: [],
  donationUrl: "",
  primaryContactName: "",
  primaryContactEmail: "",
  primaryContactPhone: ""
};

export const countryLabels: Record<z.infer<typeof countryEnum>, string> = {
  TR: "Türkiye",
  GB: "United Kingdom",
  US: "United States",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  NL: "Netherlands",
  IE: "Ireland",
  other_eu: "Other EU country"
};

export const speciesLabels: Record<z.infer<typeof speciesEnum>, string> = {
  dog: "Dogs",
  cat: "Cats",
  rabbit: "Rabbits",
  ferret: "Ferrets",
  small_mammal: "Small mammals"
};

export type ApplyCountry = z.infer<typeof countryEnum>;
export type ApplySpecies = z.infer<typeof speciesEnum>;
