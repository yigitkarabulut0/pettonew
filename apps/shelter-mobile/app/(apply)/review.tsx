import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { WizardChrome } from "@/components/apply/WizardChrome";
import {
  applySubmissionSchema,
  countryLabels,
  speciesLabels,
  type ApplyCountry,
  type ApplySpecies
} from "@/lib/apply-schema";
import { submitApplication } from "@/lib/apply-api";
import { useApplyStore } from "@/store/apply";
import { theme } from "@/lib/theme";

export default function ApplyReviewScreen() {
  const router = useRouter();
  const values = useApplyStore((s) => s.values);
  const storeResult = useApplyStore((s) => s.storeResult);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const parsed = applySubmissionSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please complete all fields");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitApplication({
        entityType: values.entityType,
        country: values.country,
        registrationNumber: values.registrationNumber,
        registrationCertificateUrl: values.registrationCertificateUrl,
        orgName: values.orgName,
        orgAddress: values.orgAddress || undefined,
        operatingRegionCountry: values.operatingRegionCountry,
        operatingRegionCity: values.operatingRegionCity,
        speciesFocus: values.speciesFocus,
        donationUrl: values.donationUrl || undefined,
        primaryContactName: values.primaryContactName,
        primaryContactEmail: values.primaryContactEmail,
        primaryContactPhone: values.primaryContactPhone || undefined
      });
      await storeResult({
        id: result.id,
        accessToken: result.accessToken,
        slaDeadline: result.slaDeadline
      });
      router.replace("/(apply)/confirmation");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WizardChrome
      stepIndex={4}
      eyebrow="Step 5 of 5"
      title="Review your application"
      description="One last look. Tap any section to go back and edit."
      onBack={() => router.back()}
      onNext={submit}
      nextLabel={submitting ? "Submitting…" : "Submit"}
      nextDisabled={submitting}
    >
      <ReviewSection
        title="Entity type"
        onEdit={() => router.push("/(apply)/entity-type")}
        rows={[
          ["Country", countryLabels[values.country as ApplyCountry]],
          ["Entity", values.entityType || "—"]
        ]}
      />
      <ReviewSection
        title="Registration"
        onEdit={() => router.push("/(apply)/registration")}
        rows={[
          ["Registration #", values.registrationNumber],
          [
            "Certificate",
            values.registrationCertificateUrl ? "Uploaded" : "Missing"
          ]
        ]}
      />
      <ReviewSection
        title="Organisation"
        onEdit={() => router.push("/(apply)/org-info")}
        rows={[
          ["Name", values.orgName],
          [
            "Operating region",
            `${countryLabels[values.operatingRegionCountry as ApplyCountry]} · ${values.operatingRegionCity}`
          ],
          [
            "Species focus",
            (values.speciesFocus as ApplySpecies[])
              .map((s) => speciesLabels[s])
              .join(", ") || "—"
          ],
          ["Donation URL", values.donationUrl || "—"]
        ]}
      />
      <ReviewSection
        title="Primary contact"
        onEdit={() => router.push("/(apply)/contact")}
        rows={[
          ["Name", values.primaryContactName],
          ["Email", values.primaryContactEmail],
          ["Phone", values.primaryContactPhone || "—"]
        ]}
      />
      {submitting && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            justifyContent: "center"
          }}
        >
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
            Submitting your application…
          </Text>
        </View>
      )}
      {error && (
        <View
          style={{
            padding: 12,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.dangerBg,
            borderWidth: 1,
            borderColor: theme.colors.danger
          }}
        >
          <Text style={{ color: theme.colors.danger, fontSize: 13 }}>
            {error}
          </Text>
        </View>
      )}
    </WizardChrome>
  );
}

function ReviewSection({
  title,
  rows,
  onEdit
}: {
  title: string;
  rows: [string, string][];
  onEdit: () => void;
}) {
  return (
    <View
      style={{
        borderRadius: theme.radius.xl,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 16
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: theme.colors.muted,
            letterSpacing: 0.8,
            textTransform: "uppercase"
          }}
        >
          {title}
        </Text>
        <Pressable onPress={onEdit}>
          <Text
            style={{ fontSize: 12, fontWeight: "700", color: theme.colors.primary }}
          >
            Edit
          </Text>
        </Pressable>
      </View>
      <View style={{ marginTop: 10, gap: 10 }}>
        {rows.map(([label, value]) => (
          <View key={label}>
            <Text
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                color: theme.colors.muted,
                letterSpacing: 0.5
              }}
            >
              {label}
            </Text>
            <Text
              style={{ marginTop: 2, fontSize: 14, color: theme.colors.ink }}
            >
              {value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
