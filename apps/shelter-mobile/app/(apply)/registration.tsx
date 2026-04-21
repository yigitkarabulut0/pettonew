import { useState } from "react";
import { TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import {
  WizardChrome,
  FieldLabel,
  FieldError,
  inputStyle
} from "@/components/apply/WizardChrome";
import { CertificatePicker } from "@/components/apply/CertificatePicker";
import { applyStep2Schema } from "@/lib/apply-schema";
import { useApplyStore } from "@/store/apply";

export default function ApplyRegistrationScreen() {
  const router = useRouter();
  const registrationNumber = useApplyStore((s) => s.values.registrationNumber);
  const registrationCertificateUrl = useApplyStore(
    (s) => s.values.registrationCertificateUrl
  );
  const setField = useApplyStore((s) => s.setField);
  const [certFileName, setCertFileName] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const next = () => {
    const parsed = applyStep2Schema.safeParse({
      registrationNumber,
      registrationCertificateUrl
    });
    if (!parsed.success) {
      const acc: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.map(String).join(".") || "_";
        if (!(key in acc)) acc[key] = issue.message;
      }
      setErrors(acc);
      return;
    }
    setErrors({});
    router.push("/(apply)/org-info");
  };

  return (
    <WizardChrome
      stepIndex={1}
      eyebrow="Step 2 of 5"
      title="Show us you're registered"
      description="Your registration number and a copy of the certificate. We only share this document with our review team."
      onBack={() => router.back()}
      onNext={next}
    >
      <View>
        <FieldLabel>Registration number</FieldLabel>
        <TextInput
          value={registrationNumber}
          onChangeText={(v) => setField("registrationNumber", v)}
          placeholder="e.g. 1234567"
          style={inputStyle}
          maxLength={100}
          autoCapitalize="none"
        />
        <FieldError message={errors.registrationNumber} />
      </View>
      <View>
        <FieldLabel>Registration certificate</FieldLabel>
        <CertificatePicker
          value={registrationCertificateUrl}
          fileName={certFileName}
          onChange={(url, name) => {
            setField("registrationCertificateUrl", url);
            setCertFileName(name);
          }}
          error={errors.registrationCertificateUrl}
        />
      </View>
    </WizardChrome>
  );
}
