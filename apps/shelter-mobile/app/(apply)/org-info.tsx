import { useState } from "react";
import { TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import {
  WizardChrome,
  FieldLabel,
  FieldError,
  inputStyle
} from "@/components/apply/WizardChrome";
import { CountryPills } from "@/components/apply/CountryPills";
import { SpeciesFocusChips } from "@/components/apply/SpeciesFocusChips";
import {
  applyStep3Schema,
  type ApplyCountry,
  type ApplySpecies
} from "@/lib/apply-schema";
import { useApplyStore } from "@/store/apply";

export default function ApplyOrgInfoScreen() {
  const router = useRouter();
  const values = useApplyStore((s) => s.values);
  const setField = useApplyStore((s) => s.setField);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const next = () => {
    const parsed = applyStep3Schema.safeParse({
      orgName: values.orgName,
      orgAddress: values.orgAddress || undefined,
      operatingRegionCountry: values.operatingRegionCountry,
      operatingRegionCity: values.operatingRegionCity,
      speciesFocus: values.speciesFocus,
      donationUrl: values.donationUrl || undefined
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
    router.push("/(apply)/contact");
  };

  return (
    <WizardChrome
      stepIndex={2}
      eyebrow="Step 3 of 5"
      title="Your organisation"
      description="Where you operate and which animals you care for."
      onBack={() => router.back()}
      onNext={next}
    >
      <View>
        <FieldLabel>Organisation name</FieldLabel>
        <TextInput
          value={values.orgName}
          onChangeText={(v) => setField("orgName", v)}
          placeholder="e.g. Istanbul Street Paws Association"
          style={inputStyle}
          maxLength={150}
        />
        <FieldError message={errors.orgName} />
      </View>
      <View>
        <FieldLabel>Address (optional)</FieldLabel>
        <TextInput
          value={values.orgAddress}
          onChangeText={(v) => setField("orgAddress", v)}
          placeholder="Street, building, district"
          style={inputStyle}
        />
      </View>
      <View>
        <FieldLabel>Operating country</FieldLabel>
        <CountryPills
          value={values.operatingRegionCountry as ApplyCountry}
          onChange={(c) => setField("operatingRegionCountry", c)}
        />
      </View>
      <View>
        <FieldLabel>Operating city</FieldLabel>
        <TextInput
          value={values.operatingRegionCity}
          onChangeText={(v) => setField("operatingRegionCity", v)}
          placeholder="e.g. Istanbul"
          style={inputStyle}
        />
        <FieldError message={errors.operatingRegionCity} />
      </View>
      <View>
        <FieldLabel>Species focus</FieldLabel>
        <SpeciesFocusChips
          value={values.speciesFocus as ApplySpecies[]}
          onChange={(v) => setField("speciesFocus", v)}
          error={errors.speciesFocus}
        />
      </View>
      <View>
        <FieldLabel>Donation link (optional)</FieldLabel>
        <TextInput
          value={values.donationUrl}
          onChangeText={(v) => setField("donationUrl", v)}
          placeholder="https://…"
          style={inputStyle}
          autoCapitalize="none"
          keyboardType="url"
        />
        <FieldError message={errors.donationUrl} />
      </View>
    </WizardChrome>
  );
}
