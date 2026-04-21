// Mobile wizard schema. Same rules as the web version to keep the two
// surfaces interchangeable — the server validates either way.

import { z } from "zod";

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
    .max(100, "Max 100 characters"),
  registrationCertificateUrl: z
    .string()
    .url("Upload a certificate to continue")
});

const applyStep3ShapeSchema = z.object({
  orgName: z
    .string()
    .min(1, "Organisation name is required")
    .max(150, "Max 150 characters"),
  orgAddress: z.string().max(300, "Max 300 characters").optional(),
  operatingRegionCountry: countryEnum,
  operatingRegionCity: z.string().min(1, "City is required").max(150),
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
  {
    path: ["operatingRegionCity"],
    message: "Region + city must be ≤200 characters"
  }
);

export const applyStep4Schema = z.object({
  primaryContactName: z
    .string()
    .min(1, "Name is required")
    .max(100, "Max 100 characters"),
  primaryContactEmail: z.string().email("Enter a valid email"),
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

export type ApplyCountry = z.infer<typeof countryEnum>;
export type ApplySpecies = z.infer<typeof speciesEnum>;

export const countryLabels: Record<ApplyCountry, string> = {
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

export const speciesLabels: Record<ApplySpecies, string> = {
  dog: "Dogs",
  cat: "Cats",
  rabbit: "Rabbits",
  ferret: "Ferrets",
  small_mammal: "Small mammals"
};
