import DateTimePicker, {
  type DateTimePickerEvent
} from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { useMutation } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/avatar";
import { PrimaryButton } from "@/components/primary-button";
import { updateProfile, uploadMedia } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const schema = z.object({
  firstName: z.string().min(2).max(30),
  lastName: z.string().min(2).max(30),
  birthDate: z.string().min(10),
  bio: z.string().max(1000).optional(),
  gender: z.enum(["woman", "man", "non-binary", "prefer-not-to-say"])
});

type ProfileValues = z.infer<typeof schema>;

export default function ProfileOnboardingPage() {
  const theme = useTheme();
  const session = useSessionStore((state) => state.session);
  const setSession = useSessionStore((state) => state.setSession);
  const insets = useSafeAreaInsets();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [avatarAsset, setAvatarAsset] = useState<{
    uri: string;
    mimeType?: string | null;
  } | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const { control, handleSubmit, setValue, watch } = useForm<ProfileValues>({
    defaultValues: {
      firstName: session?.user.firstName ?? "",
      lastName: session?.user.lastName ?? "",
      birthDate:
        session?.user.birthDate ?? formatDateValue(new Date(2000, 0, 1)),
      bio: session?.user.bio ?? "",
      gender:
        (session?.user.gender as ProfileValues["gender"]) || "prefer-not-to-say"
    },
    resolver: zodResolver(schema)
  });
  const birthDateValue = watch("birthDate");

  const isEditing = Boolean(session?.user.firstName && session?.user.lastName);

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
      if (isEditing) {
        router.back();
      } else {
        router.replace("/");
      }
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save profile."
      );
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

  const currentAvatarUri =
    avatarAsset?.uri ??
    (removeAvatar ? null : (session?.user.avatarUrl ?? null));

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
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View
          style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.md,
          paddingHorizontal: mobileTheme.spacing.xl
        }}
      >
        <Pressable
          onPress={() => (isEditing ? router.back() : undefined)}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.colors.surface,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          {isEditing ? <X size={20} color={theme.colors.ink} /> : null}
        </Pressable>
        <Text
          style={{
            fontSize: mobileTheme.typography.heading.fontSize,
            fontWeight: mobileTheme.typography.heading.fontWeight,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          {isEditing ? "Edit Profile" : "Your Profile"}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingVertical: mobileTheme.spacing.sm,
          gap: mobileTheme.spacing.xl,
          paddingBottom: insets.bottom + mobileTheme.spacing["2xl"]
        }}
      >
        {!isEditing && (
          <Text
            style={{
              color: theme.colors.muted,
              fontSize: mobileTheme.typography.body.fontSize,
              fontFamily: "Inter_400Regular",
              lineHeight: mobileTheme.typography.body.lineHeight,
              textAlign: "center",
              marginBottom: mobileTheme.spacing.sm
            }}
          >
            Birth date stays private and is used only for age verification.
          </Text>
        )}

        <View
          style={{
            alignItems: "center",
            gap: mobileTheme.spacing.lg
          }}
        >
          <Pressable
            onPress={() => void pickAvatar()}
            style={({ pressed }) => ({
              width: 120,
              height: 120,
              borderRadius: mobileTheme.radius.xl,
              overflow: "hidden",
              backgroundColor: theme.colors.surface,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.85 : 1,
              borderWidth: 2,
              borderColor: theme.colors.border
            })}
          >
            {currentAvatarUri ? (
              <Image
                source={{ uri: currentAvatarUri }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            ) : (
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: theme.colors.primaryBg,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Camera size={22} color={theme.colors.primary} />
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              if (currentAvatarUri) {
                setAvatarAsset(null);
                setRemoveAvatar(true);
              } else {
                void pickAvatar();
              }
            }}
          >
            <Text
              style={{
                color: theme.colors.primary,
                fontSize: mobileTheme.typography.caption.fontSize,
                fontFamily: "Inter_600SemiBold",
                fontWeight: "600"
              }}
            >
              {currentAvatarUri ? "Change photo" : "Add photo"}
            </Text>
          </Pressable>
        </View>

        {(["firstName", "lastName", "bio"] as const).map((field) => (
          <View key={field}>
            {field !== "bio" ? (
              <Text
                style={{
                  fontSize: mobileTheme.typography.label.fontSize,
                  fontWeight: mobileTheme.typography.label.fontWeight,
                  color: theme.colors.muted,
                  fontFamily: "Inter_700Bold",
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  marginBottom: mobileTheme.spacing.sm
                }}
              >
                {field === "firstName" ? "First Name" : "Last Name"}
              </Text>
            ) : null}
            <Controller
              control={control}
              name={field}
              render={({ field: { onChange, value } }) => (
                <TextInput
                  placeholder={
                    field === "bio"
                      ? "Write a short bio..."
                      : field === "firstName"
                        ? "First name"
                        : "Last name"
                  }
                  placeholderTextColor={theme.colors.muted}
                  multiline={field === "bio"}
                  autoCapitalize={field === "bio" ? "sentences" : "words"}
                  maxLength={field === "bio" ? 1000 : 30}
                  value={value}
                  onChangeText={onChange}
                  style={{
                    borderRadius: mobileTheme.radius.md,
                    backgroundColor: theme.colors.white,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    paddingHorizontal: mobileTheme.spacing.lg,
                    paddingVertical:
                      field === "bio"
                        ? mobileTheme.spacing.lg
                        : mobileTheme.spacing.md + 2,
                    minHeight: field === "bio" ? 100 : undefined,
                    fontSize: mobileTheme.typography.body.fontSize,
                    color: theme.colors.ink,
                    fontFamily: "Inter_400Regular",
                    lineHeight: mobileTheme.typography.body.lineHeight,
                    textAlignVertical: field === "bio" ? "top" : "center"
                  }}
                />
              )}
            />
          </View>
        ))}

        <View>
          <Text
            style={{
              fontSize: mobileTheme.typography.label.fontSize,
              fontWeight: mobileTheme.typography.label.fontWeight,
              color: theme.colors.muted,
              fontFamily: "Inter_700Bold",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              marginBottom: mobileTheme.spacing.sm
            }}
          >
            Birth Date
          </Text>
          <Pressable
            onPress={() => setShowDatePicker(true)}
            style={{
              borderRadius: mobileTheme.radius.md,
              backgroundColor: theme.colors.white,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: mobileTheme.spacing.lg,
              paddingVertical: mobileTheme.spacing.md
            }}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink,
                fontFamily: "Inter_400Regular"
              }}
            >
              {formatDateLabel(birthDateValue)}
            </Text>
          </Pressable>
          {showDatePicker ? (
            <View
              style={{
                borderRadius: mobileTheme.radius.md,
                backgroundColor: theme.colors.white,
                borderWidth: 1,
                borderColor: theme.colors.border,
                overflow: "hidden"
              }}
            >
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                maximumDate={new Date()}
                onChange={handleDateChange}
              />
              {Platform.OS === "ios" && (
                <Pressable
                  onPress={() => setShowDatePicker(false)}
                  style={{
                    alignItems: "center",
                    paddingVertical: mobileTheme.spacing.md,
                    borderTopWidth: 1,
                    borderTopColor: theme.colors.border
                  }}
                >
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.body.fontSize,
                      fontWeight: "600",
                      color: theme.colors.primary,
                      fontFamily: "Inter_600SemiBold"
                    }}
                  >
                    Done
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </View>

        <View>
          <Text
            style={{
              fontSize: mobileTheme.typography.label.fontSize,
              fontWeight: mobileTheme.typography.label.fontWeight,
              color: theme.colors.muted,
              fontFamily: "Inter_700Bold",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              marginBottom: mobileTheme.spacing.sm
            }}
          >
            Gender
          </Text>
          <View
            style={{
              borderRadius: mobileTheme.radius.md,
              backgroundColor: theme.colors.white,
              borderWidth: 1,
              borderColor: theme.colors.border,
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
                  <Picker.Item
                    label="Prefer not to say"
                    value="prefer-not-to-say"
                  />
                </Picker>
              )}
            />
          </View>
        </View>

        {errorMessage ? (
          <Text
            style={{
              color: theme.colors.danger,
              fontSize: mobileTheme.typography.body.fontSize,
              fontFamily: "Inter_400Regular",
              textAlign: "center"
            }}
          >
            {errorMessage}
          </Text>
        ) : null}

        <PrimaryButton
          label={mutation.isPending ? "Saving..." : "Save"}
          onPress={handleSubmit((values) => mutation.mutate(values))}
        />
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
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
