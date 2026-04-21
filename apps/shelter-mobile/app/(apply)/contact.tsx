import { useState } from "react";
import { TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import {
  WizardChrome,
  FieldLabel,
  FieldError,
  inputStyle
} from "@/components/apply/WizardChrome";
import { applyStep4Schema } from "@/lib/apply-schema";
import { useApplyStore } from "@/store/apply";

export default function ApplyContactScreen() {
  const router = useRouter();
  const values = useApplyStore((s) => s.values);
  const setField = useApplyStore((s) => s.setField);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const next = () => {
    const parsed = applyStep4Schema.safeParse({
      primaryContactName: values.primaryContactName,
      primaryContactEmail: values.primaryContactEmail,
      primaryContactPhone: values.primaryContactPhone || undefined
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
    router.push("/(apply)/review");
  };

  return (
    <WizardChrome
      stepIndex={3}
      eyebrow="Step 4 of 5"
      title="Primary contact"
      description="The person we'll message about your application. This becomes the primary login once approved."
      onBack={() => router.back()}
      onNext={next}
      nextLabel="Review"
    >
      <View>
        <FieldLabel>Full name</FieldLabel>
        <TextInput
          value={values.primaryContactName}
          onChangeText={(v) => setField("primaryContactName", v)}
          style={inputStyle}
          maxLength={100}
        />
        <FieldError message={errors.primaryContactName} />
      </View>
      <View>
        <FieldLabel>Email</FieldLabel>
        <TextInput
          value={values.primaryContactEmail}
          onChangeText={(v) => setField("primaryContactEmail", v)}
          style={inputStyle}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <FieldError message={errors.primaryContactEmail} />
      </View>
      <View>
        <FieldLabel>Phone (optional)</FieldLabel>
        <TextInput
          value={values.primaryContactPhone}
          onChangeText={(v) => setField("primaryContactPhone", v)}
          style={inputStyle}
          keyboardType="phone-pad"
          placeholder="+90 212 555 00 00"
        />
        <FieldError message={errors.primaryContactPhone} />
      </View>
    </WizardChrome>
  );
}
