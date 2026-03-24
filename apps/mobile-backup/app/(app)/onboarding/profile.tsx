import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { useMutation } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Image, Platform, Pressable, Text, TextInput, View } from "react-native";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { PrimaryButton } from "@/components/primary-button";
import { ScreenShell } from "@/components/screen-shell";
import { updateProfile, uploadMedia } from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const schema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  birthDate: z.string().min(10),
  bio: z.string().max(240).optional(),
  gender: z.enum(["woman", "man", "non-binary", "prefer-not-to-say"])
});

type ProfileValues = z.infer<typeof schema>;

export default function ProfileOnboardingPage() {
  const session = useSessionStore((state) => state.session);
  const setSession = useSessionStore((state) => state.setSession);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [avatarAsset, setAvatarAsset] = useState<{ uri: string; mimeType?: string | null } | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const { control, handleSubmit, setValue, watch } = useForm<ProfileValues>({
    defaultValues: {
      firstName: session?.user.firstName ?? "",
      lastName: session?.user.lastName ?? "",
      birthDate: session?.user.birthDate ?? formatDateValue(new Date(2000, 0, 1)),
      bio: session?.user.bio ?? "",
      gender: (session?.user.gender as ProfileValues["gender"]) || "prefer-not-to-say"
    },
    resolver: zodResolver(schema)
  });
  const birthDateValue = watch("birthDate");

  const selectedDate = useMemo(() => {
    const parsed = new Date(birthDateValue);
    return Number.isNaN(parsed.getTime()) ? new Date(2000, 0, 1) : parsed;
  }, [birthDateValue]);

  const mutation = useMutation({
    mutationFn: async (values: ProfileValues) => {
      if (!session) {
        throw new Error("No session found.");
      }

      let avatarUrl = removeAvatar ? undefined : session.user.avatarUrl;
      if (avatarAsset) {
        const uploaded = await uploadMedia(
          session.tokens.accessToken,
          avatarAsset.uri,
          "profile-avatar.jpg",
          avatarAsset.mimeType ?? "image/jpeg"
        );
        avatarUrl = uploaded.url;
      }

      return updateProfile(session.tokens.accessToken, {
        ...session.user,
        ...values,
        avatarUrl
      });
    },
    onSuccess: (user) => {
      if (!session) {
        return;
      }

      setSession({
        ...session,
        user
      });
      router.replace("/");
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save profile.");
    }
  });

  const handleDateChange = (event: DateTimePickerEvent, nextDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }

    if (event.type === "dismissed" || !nextDate) {
      return;
    }

    setValue("birthDate", formatDateValue(nextDate));
  };

  const currentAvatarUri = avatarAsset?.uri ?? (removeAvatar ? null : session?.user.avatarUrl ?? null);

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.85
    });

    if (result.canceled) {
      return;
    }

    const [asset] = result.assets;
    if (!asset) {
      return;
    }

    setAvatarAsset({
      uri: asset.uri,
      mimeType: asset.mimeType
    });
    setRemoveAvatar(false);
  };

  return (
    <ScreenShell
      eyebrow="Onboarding"
      title="Tell us about the human behind the pet."
      subtitle="Birth date stays private and is used only for age verification."
    >
      <View style={{ gap: 14, padding: 18, borderRadius: 28, backgroundColor: mobileTheme.colors.surface }}>
        <View style={{ gap: 12 }}>
          <Text selectable style={{ color: mobileTheme.colors.secondary, fontWeight: "700" }}>
            Profile photo
          </Text>
          <View
            style={{
              borderRadius: mobileTheme.radius.lg,
              borderWidth: 1,
              borderColor: mobileTheme.colors.border,
              backgroundColor: "#FFFFFF",
              padding: 18,
              alignItems: "center",
              gap: 14
            }}
          >
            <View
              style={{
                width: 116,
                height: 116,
                borderRadius: 999,
                overflow: "hidden",
                backgroundColor: mobileTheme.colors.surface,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {currentAvatarUri ? (
                <Image source={{ uri: currentAvatarUri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
              ) : (
                <Text selectable style={{ color: mobileTheme.colors.muted, fontWeight: "700" }}>
                  No photo
                </Text>
              )}
            </View>
            <View style={{ width: "100%", gap: 10 }}>
              <PrimaryButton
                label={currentAvatarUri ? "Change profile photo" : "Add profile photo"}
                variant="secondary"
                onPress={() => {
                  void pickAvatar();
                }}
              />
              {currentAvatarUri ? (
                <PrimaryButton
                  label="Remove photo"
                  variant="ghost"
                  onPress={() => {
                    setAvatarAsset(null);
                    setRemoveAvatar(true);
                  }}
                />
              ) : null}
            </View>
          </View>
        </View>

        {(["firstName", "lastName", "bio"] as const).map((field) => (
          <Controller
            key={field}
            control={control}
            name={field}
            render={({ field: { onChange, value } }) => (
              <TextInput
                placeholder={
                  field === "bio" ? "Short bio" : field === "firstName" ? "First name" : "Last name"
                }
                placeholderTextColor={mobileTheme.colors.muted}
                multiline={field === "bio"}
                value={value}
                onChangeText={onChange}
                style={{
                  borderRadius: mobileTheme.radius.md,
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: mobileTheme.colors.border,
                  paddingHorizontal: 16,
                  paddingVertical: field === "bio" ? 18 : 15,
                  minHeight: field === "bio" ? 110 : undefined,
                  color: mobileTheme.colors.ink,
                  textAlignVertical: field === "bio" ? "top" : "auto"
                }}
              />
            )}
          />
        ))}

        <View style={{ gap: 10 }}>
          <Text selectable style={{ color: mobileTheme.colors.secondary, fontWeight: "700" }}>
            Birth date
          </Text>
          <Pressable
            onPress={() => setShowDatePicker(true)}
            style={{
              borderRadius: mobileTheme.radius.md,
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: mobileTheme.colors.border,
              paddingHorizontal: 16,
              paddingVertical: 15
            }}
          >
            <Text selectable style={{ color: mobileTheme.colors.ink, fontSize: 16 }}>
              {formatDateLabel(birthDateValue)}
            </Text>
          </Pressable>
          {showDatePicker ? (
            <View
              style={{
                borderRadius: mobileTheme.radius.md,
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor: mobileTheme.colors.border,
                overflow: "hidden"
              }}
            >
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                maximumDate={new Date()}
                onChange={handleDateChange}
              />
            </View>
          ) : null}
        </View>

        <View style={{ gap: 10 }}>
          <Text selectable style={{ color: mobileTheme.colors.secondary, fontWeight: "700" }}>
            Gender
          </Text>
          <View
            style={{
              borderRadius: mobileTheme.radius.md,
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: mobileTheme.colors.border,
              overflow: "hidden"
            }}
          >
            <Controller
              control={control}
              name="gender"
              render={({ field: { onChange, value } }) => (
                <Picker selectedValue={value} onValueChange={onChange}>
                  <Picker.Item label="Woman" value="woman" />
                  <Picker.Item label="Man" value="man" />
                  <Picker.Item label="Non-binary" value="non-binary" />
                  <Picker.Item label="Prefer not to say" value="prefer-not-to-say" />
                </Picker>
              )}
            />
          </View>
        </View>

        {errorMessage ? (
          <Text selectable style={{ color: mobileTheme.colors.danger }}>
            {errorMessage}
          </Text>
        ) : null}

        <PrimaryButton
          label={mutation.isPending ? "Saving..." : "Save profile"}
          onPress={handleSubmit((values) => mutation.mutate(values))}
        />
      </View>
    </ScreenShell>
  );
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Select your birth date";
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}
