import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { Image } from "expo-image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import {
  Bird,
  Camera,
  Cat,
  CheckCircle2,
  Compass,
  Dog,
  GraduationCap,
  Globe,
  Hash,
  Heart,
  ListChecks,
  Lock,
  MapPin,
  PawPrint,
  Plus,
  Rabbit,
  Share2,
  Users2,
  X
} from "lucide-react-native";

import { createGroup, listTaxonomies, uploadMedia } from "@/lib/api";
import { UploadProgressOverlay } from "@/components/media/upload-progress-overlay";
import { getCurrentLanguage } from "@/lib/i18n";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const SPECIES_ICON_MAP: Record<string, typeof PawPrint> = {
  dog: Dog,
  cat: Cat,
  bird: Bird,
  rabbit: Rabbit
};

const CATEGORIES = [
  { key: "breed", icon: PawPrint },
  { key: "training", icon: GraduationCap },
  { key: "social", icon: Users2 },
  { key: "adventure", icon: Compass },
  { key: "rescue", icon: Heart }
];

interface CreateGroupModalProps {
  visible: boolean;
  onClose: () => void;
}

export function CreateGroupModal({ visible, onClose }: CreateGroupModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const token = session?.tokens.accessToken ?? "";

  // Form state
  const [avatarAsset, setAvatarAsset] = useState<{ uri: string; mimeType?: string | null } | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [petType, setPetType] = useState("");
  const [category, setCategory] = useState("");
  const [cityLabel, setCityLabel] = useState("");
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);
  const [isPrivate, setIsPrivate] = useState(false);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [rules, setRules] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [successPopup, setSuccessPopup] = useState<{ code: string; conversationId: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | undefined>(
    undefined
  );

  // Reset on close
  useEffect(() => {
    if (!visible) {
      setAvatarAsset(null);
      setName("");
      setDescription("");
      setPetType("");
      setCategory("");
      setCityLabel("");
      setLatitude(0);
      setLongitude(0);
      setIsPrivate(false);
      setHashtags([]);
      setHashtagInput("");
      setRules([]);
      setErrorMessage(null);
      setLocating(false);
    }
  }, [visible]);

  // Species query
  const speciesQuery = useQuery({
    queryKey: ["taxonomy", "species", getCurrentLanguage()],
    queryFn: () => listTaxonomies(token, "species", getCurrentLanguage()),
    enabled: Boolean(token && visible)
  });

  // Mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      let imageUrl: string | undefined;
      if (avatarAsset) {
        setUploading(true);
        setUploadProgress(0);
        try {
          const uploaded = await uploadMedia(
            token,
            avatarAsset.uri,
            `group-${Date.now()}.jpg`,
            avatarAsset.mimeType ?? undefined,
            { onProgress: (ratio) => setUploadProgress(ratio) }
          );
          imageUrl = uploaded.url;
        } finally {
          setUploading(false);
          setUploadProgress(undefined);
        }
      }
      return createGroup(token, {
        name: name.trim(),
        description: description.trim(),
        petType,
        category: category || undefined,
        cityLabel: cityLabel.trim(),
        latitude,
        longitude,
        isPrivate,
        imageUrl,
        hashtags,
        rules
      });
    },
    onSuccess: (group) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      // Show in-app code popup for private groups; otherwise navigate immediately
      if (group.isPrivate && group.code) {
        setSuccessPopup({
          code: group.code,
          conversationId: group.conversationId ?? "",
          name: group.name
        });
      } else {
        onClose();
        if (group.conversationId) {
          router.push(`/(app)/conversation/${group.conversationId}` as any);
        }
      }
    },
    onError: (err: any) => {
      setErrorMessage(err?.message ?? t("groups.createError"));
    }
  });

  const isValid = useMemo(() => {
    return Boolean(
      name.trim().length >= 2 &&
        petType &&
        category &&
        cityLabel.trim().length >= 2
    );
  }, [name, petType, category, cityLabel]);

  // Helpers
  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1]
    });
    if (result.canceled) return;
    const [asset] = result.assets;
    if (asset) {
      setAvatarAsset({ uri: asset.uri, mimeType: asset.mimeType });
    }
  };

  const useMyLocation = async () => {
    try {
      setLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("common.error"), t("groups.locationPermissionDenied"));
        setLocating(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLatitude(loc.coords.latitude);
      setLongitude(loc.coords.longitude);
      try {
        const reverse = await Location.reverseGeocodeAsync(loc.coords);
        const first = reverse[0];
        if (first) {
          const label = [first.city ?? first.subregion, first.country].filter(Boolean).join(", ");
          if (label) setCityLabel(label);
        }
      } catch {}
    } catch {
      Alert.alert(t("common.error"), t("groups.locationError"));
    } finally {
      setLocating(false);
    }
  };

  const addHashtag = () => {
    const tag = hashtagInput.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "_");
    if (!tag || tag.length > 20) return;
    if (hashtags.includes(tag)) return;
    if (hashtags.length >= 10) return;
    setHashtags([...hashtags, tag]);
    setHashtagInput("");
  };

  const removeHashtag = (tag: string) => {
    setHashtags(hashtags.filter((h) => h !== tag));
  };

  const addRule = () => {
    if (rules.length >= 10) return;
    setRules([...rules, ""]);
  };

  const updateRule = (index: number, value: string) => {
    const next = [...rules];
    next[index] = value;
    setRules(next);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const speciesList = speciesQuery.data ?? [];

  return (
    <>
    <Modal
      visible={visible && !successPopup}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* ── Header ── */}
        <View
          style={{
            paddingTop: mobileTheme.spacing.md,
            paddingBottom: mobileTheme.spacing.md,
            paddingHorizontal: mobileTheme.spacing.xl,
            backgroundColor: theme.colors.white,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border
          }}
        >
          {/* Drag handle */}
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.border,
              alignSelf: "center",
              marginBottom: mobileTheme.spacing.md
            }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ width: 44 }} />
            <Text
              style={{
                fontSize: mobileTheme.typography.subheading.fontSize,
                fontWeight: "700",
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold"
              }}
            >
              {t("groups.createGroupTitle")}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: theme.colors.background,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <X size={20} color={theme.colors.ink} />
            </Pressable>
          </View>
        </View>

        {/* ── Scroll Content ── */}
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingTop: mobileTheme.spacing.xl,
            paddingBottom: 120 + insets.bottom
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar Uploader */}
          <View style={{ alignItems: "center", marginBottom: mobileTheme.spacing.xl }}>
            <Pressable onPress={pickAvatar}>
              <View
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  borderWidth: 3,
                  borderColor: theme.colors.primary,
                  backgroundColor: theme.colors.primaryBg,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden"
                }}
              >
                {avatarAsset ? (
                  <Image
                    source={{ uri: avatarAsset.uri }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                  />
                ) : (
                  <Camera size={32} color={theme.colors.primary} />
                )}
              </View>
              <View
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 3,
                  borderColor: theme.colors.background
                }}
              >
                <Camera size={14} color={theme.colors.white} />
              </View>
            </Pressable>
            <Text
              style={{
                marginTop: 8,
                fontSize: mobileTheme.typography.caption.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium"
              }}
            >
              {avatarAsset ? t("groups.changePhoto") : t("groups.addPhoto")}
            </Text>
          </View>

          {/* Group Name */}
          <FieldLabel text={`${t("groups.groupName")} *`} />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t("groups.groupNamePlaceholder")}
            placeholderTextColor={theme.colors.muted}
            maxLength={60}
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.md,
              paddingHorizontal: mobileTheme.spacing.lg,
              paddingVertical: mobileTheme.spacing.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
              fontSize: mobileTheme.typography.body.fontSize,
              color: theme.colors.ink,
              fontFamily: "Inter_400Regular",
              minHeight: 48
            }}
          />

          {/* Pet Type */}
          <FieldLabel text={`${t("groups.forWhichPet")} *`} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: mobileTheme.spacing.xl }}
          >
            {speciesList.map((s) => {
              const Icon = SPECIES_ICON_MAP[s.slug] ?? PawPrint;
              const active = petType === s.slug;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setPetType(s.slug)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: mobileTheme.radius.pill,
                    backgroundColor: active ? theme.colors.primary : theme.colors.white,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                    minHeight: 44,
                    opacity: pressed ? 0.8 : 1
                  })}
                >
                  <Icon size={16} color={active ? theme.colors.white : theme.colors.muted} />
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.caption.fontSize,
                      fontWeight: "600",
                      color: active ? theme.colors.white : theme.colors.ink,
                      fontFamily: "Inter_600SemiBold",
                      textTransform: "capitalize"
                    }}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Category */}
          <FieldLabel text={`${t("groups.groupCategory")} *`} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: mobileTheme.spacing.xl }}
          >
            {CATEGORIES.map(({ key, icon: Icon }) => {
              const active = category === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setCategory(key)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: mobileTheme.radius.pill,
                    backgroundColor: active ? theme.colors.primary : theme.colors.white,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                    minHeight: 44,
                    opacity: pressed ? 0.8 : 1
                  })}
                >
                  <Icon size={16} color={active ? theme.colors.white : theme.colors.muted} />
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.caption.fontSize,
                      fontWeight: "600",
                      color: active ? theme.colors.white : theme.colors.ink,
                      fontFamily: "Inter_600SemiBold"
                    }}
                  >
                    {t(`groups.category${key.charAt(0).toUpperCase() + key.slice(1)}`)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Location */}
          <FieldLabel text={`${t("groups.locationLabel")} *`} />
          <View
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: mobileTheme.spacing.md,
              gap: mobileTheme.spacing.sm
            }}
          >
            <Pressable
              onPress={useMyLocation}
              disabled={locating}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: mobileTheme.radius.md,
                backgroundColor: theme.colors.primaryBg,
                opacity: pressed || locating ? 0.7 : 1,
                minHeight: 44
              })}
            >
              <MapPin size={16} color={theme.colors.primary} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  fontWeight: "600",
                  color: theme.colors.primary,
                  fontFamily: "Inter_600SemiBold"
                }}
              >
                {locating ? t("common.loading") : t("groups.useMyLocation")}
              </Text>
            </Pressable>
            <TextInput
              value={cityLabel}
              onChangeText={setCityLabel}
              placeholder={t("groups.cityNamePlaceholder")}
              placeholderTextColor={theme.colors.muted}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink,
                fontFamily: "Inter_400Regular",
                minHeight: 44
              }}
            />
            {latitude !== 0 && longitude !== 0 ? (
              <Text
                style={{
                  fontSize: mobileTheme.typography.micro.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_400Regular",
                  paddingHorizontal: 12
                }}
              >
                {latitude.toFixed(4)}, {longitude.toFixed(4)}
              </Text>
            ) : null}
          </View>

          {/* Description */}
          <FieldLabel text={t("groups.description")} />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t("groups.descriptionPlaceholder")}
            placeholderTextColor={theme.colors.muted}
            multiline
            maxLength={500}
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.md,
              paddingHorizontal: mobileTheme.spacing.lg,
              paddingVertical: mobileTheme.spacing.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
              fontSize: mobileTheme.typography.body.fontSize,
              color: theme.colors.ink,
              fontFamily: "Inter_400Regular",
              minHeight: 80,
              textAlignVertical: "top"
            }}
          />
          <Text
            style={{
              fontSize: 11,
              color: theme.colors.muted,
              textAlign: "right",
              marginTop: 4,
              fontFamily: "Inter_400Regular"
            }}
          >
            {description.length}/500
          </Text>

          {/* Hashtags */}
          <FieldLabel text={t("groups.hashtags")} />
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput
              value={hashtagInput}
              onChangeText={setHashtagInput}
              placeholder={t("groups.hashtagsPlaceholder")}
              placeholderTextColor={theme.colors.muted}
              maxLength={20}
              autoCapitalize="none"
              onSubmitEditing={addHashtag}
              style={{
                flex: 1,
                backgroundColor: theme.colors.white,
                borderRadius: mobileTheme.radius.md,
                paddingHorizontal: mobileTheme.spacing.lg,
                paddingVertical: mobileTheme.spacing.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink,
                fontFamily: "Inter_400Regular",
                minHeight: 48
              }}
            />
            <Pressable
              onPress={addHashtag}
              disabled={!hashtagInput.trim()}
              style={({ pressed }) => ({
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: mobileTheme.radius.md,
                backgroundColor: hashtagInput.trim() ? theme.colors.primary : theme.colors.border,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 48,
                opacity: pressed ? 0.8 : 1
              })}
            >
              <Text style={{ color: theme.colors.white, fontWeight: "600", fontFamily: "Inter_600SemiBold" }}>
                {t("groups.addHashtag")}
              </Text>
            </Pressable>
          </View>
          {hashtags.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {hashtags.map((tag) => (
                <View
                  key={tag}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    backgroundColor: theme.colors.primaryBg,
                    paddingLeft: 10,
                    paddingRight: 6,
                    paddingVertical: 6,
                    borderRadius: mobileTheme.radius.pill
                  }}
                >
                  <Hash size={11} color={theme.colors.primary} />
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.micro.fontSize,
                      color: theme.colors.primary,
                      fontWeight: "600",
                      fontFamily: "Inter_600SemiBold"
                    }}
                  >
                    {tag}
                  </Text>
                  <Pressable onPress={() => removeHashtag(tag)} hitSlop={6}>
                    <X size={12} color={theme.colors.primary} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Rules */}
          <FieldLabel text={t("groups.rules")} />
          {rules.map((rule, i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 8
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: theme.colors.primaryBg,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: theme.colors.primary,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {i + 1}
                </Text>
              </View>
              <TextInput
                value={rule}
                onChangeText={(v) => updateRule(i, v)}
                placeholder={t("groups.rulePlaceholder")}
                placeholderTextColor={theme.colors.muted}
                maxLength={120}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.white,
                  borderRadius: mobileTheme.radius.md,
                  paddingHorizontal: mobileTheme.spacing.md,
                  paddingVertical: mobileTheme.spacing.sm,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.ink,
                  fontFamily: "Inter_400Regular",
                  minHeight: 40
                }}
              />
              <Pressable onPress={() => removeRule(i)} hitSlop={8}>
                <X size={18} color={theme.colors.muted} />
              </Pressable>
            </View>
          ))}
          {rules.length < 10 && (
            <Pressable
              onPress={addRule}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: mobileTheme.radius.md,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.white,
                alignSelf: "flex-start",
                opacity: pressed ? 0.7 : 1
              })}
            >
              <ListChecks size={14} color={theme.colors.primary} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  fontWeight: "600",
                  color: theme.colors.primary,
                  fontFamily: "Inter_600SemiBold"
                }}
              >
                {t("groups.addRule")}
              </Text>
            </Pressable>
          )}

          {/* Privacy */}
          <FieldLabel text={t("groups.privacy")} />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: mobileTheme.spacing.md,
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
              gap: mobileTheme.spacing.md
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: isPrivate ? theme.colors.primaryBg : theme.colors.secondarySoft,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {isPrivate ? (
                <Lock size={18} color={theme.colors.primary} />
              ) : (
                <Globe size={18} color={theme.colors.secondary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                  fontWeight: "600",
                  color: theme.colors.ink,
                  fontFamily: "Inter_600SemiBold"
                }}
              >
                {isPrivate ? t("groups.private") : t("groups.public")}
              </Text>
              <Text
                style={{
                  fontSize: mobileTheme.typography.micro.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_400Regular",
                  marginTop: 2
                }}
              >
                {isPrivate ? t("groups.privateDescription") : t("groups.publicDescription")}
              </Text>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={setIsPrivate}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
          {isPrivate && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 6,
                paddingHorizontal: 4
              }}
            >
              <Lock size={11} color={theme.colors.muted} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.micro.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_400Regular",
                  flex: 1
                }}
              >
                {t("groups.codeGeneratedNote")}
              </Text>
            </View>
          )}

          {/* Error */}
          {errorMessage && (
            <View
              style={{
                marginTop: mobileTheme.spacing.lg,
                padding: mobileTheme.spacing.md,
                backgroundColor: theme.colors.dangerBg,
                borderRadius: mobileTheme.radius.md
              }}
            >
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.danger,
                  fontFamily: "Inter_500Medium"
                }}
              >
                {errorMessage}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* ── Sticky CTA ── */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingTop: mobileTheme.spacing.md,
            paddingBottom: insets.bottom + mobileTheme.spacing.md,
            backgroundColor: theme.colors.white,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            ...mobileTheme.shadow.lg
          }}
        >
          <Pressable
            onPress={() => createMutation.mutate()}
            disabled={!isValid || createMutation.isPending}
            style={({ pressed }) => ({
              backgroundColor: isValid ? theme.colors.primary : theme.colors.border,
              borderRadius: mobileTheme.radius.pill,
              paddingVertical: 16,
              alignItems: "center",
              justifyContent: "center",
              minHeight: 56,
              opacity: pressed ? 0.85 : 1
            })}
          >
            <Text
              style={{
                color: isValid ? theme.colors.white : theme.colors.muted,
                fontWeight: "700",
                fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                fontFamily: "Inter_700Bold"
              }}
            >
              {createMutation.isPending ? t("groups.creating") : t("groups.createGroup")}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <UploadProgressOverlay
        visible={uploading}
        progress={uploadProgress}
        label={t("groups.uploading", { defaultValue: "Grup görseli yükleniyor…" })}
      />
    </Modal>

    {/* ── Success Popup with Group Code (in-app style) ── */}
    <Modal visible={Boolean(successPopup)} animationType="fade" transparent>
      <Pressable
        onPress={() => {
          const conversationId = successPopup?.conversationId;
          setSuccessPopup(null);
          onClose();
          if (conversationId) {
            router.push(`/(app)/conversation/${conversationId}` as any);
          }
        }}
        style={{
          flex: 1,
          backgroundColor: theme.colors.overlay,
          justifyContent: "center",
          paddingHorizontal: mobileTheme.spacing.xl
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: theme.colors.white,
            borderRadius: mobileTheme.radius.xl,
            padding: mobileTheme.spacing["2xl"],
            gap: mobileTheme.spacing.lg,
            ...mobileTheme.shadow.lg
          }}
        >
          {/* Success icon */}
          <View style={{ alignItems: "center", gap: mobileTheme.spacing.md }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: theme.colors.successBg ?? theme.colors.primaryBg,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <CheckCircle2 size={32} color={theme.colors.success ?? theme.colors.primary} />
            </View>
            <Text
              style={{
                fontSize: mobileTheme.typography.heading.fontSize,
                fontWeight: "700",
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold",
                textAlign: "center"
              }}
            >
              {t("groups.groupCreatedSuccess")}
            </Text>
            <Text
              style={{
                fontSize: mobileTheme.typography.caption.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_400Regular",
                textAlign: "center"
              }}
            >
              {t("groups.shareCode")}
            </Text>
          </View>

          {/* Code display */}
          <View
            style={{
              backgroundColor: theme.colors.primaryBg,
              borderRadius: mobileTheme.radius.lg,
              borderWidth: 2,
              borderColor: theme.colors.primary,
              borderStyle: "dashed",
              paddingVertical: mobileTheme.spacing.xl,
              paddingHorizontal: mobileTheme.spacing.lg,
              alignItems: "center"
            }}
          >
            <Text
              style={{
                fontSize: 32,
                fontWeight: "800",
                color: theme.colors.primary,
                fontFamily: "Inter_700Bold",
                letterSpacing: 6
              }}
              selectable
            >
              {successPopup?.code}
            </Text>
          </View>

          {/* Buttons: Share + Continue */}
          <View style={{ flexDirection: "row", gap: mobileTheme.spacing.md }}>
            <Pressable
              onPress={() => {
                if (!successPopup) return;
                Share.share({
                  message: `${t("groups.shareCodeMessage", { name: successPopup.name, code: successPopup.code })}`
                });
              }}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 14,
                borderRadius: mobileTheme.radius.lg,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 48,
                flexDirection: "row",
                gap: 6,
                opacity: pressed ? 0.7 : 1
              })}
            >
              <Share2 size={16} color={theme.colors.ink} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                  fontWeight: "600",
                  color: theme.colors.ink,
                  fontFamily: "Inter_600SemiBold"
                }}
              >
                {t("common.share") ?? "Share"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const conversationId = successPopup?.conversationId;
                setSuccessPopup(null);
                onClose();
                if (conversationId) {
                  router.push(`/(app)/conversation/${conversationId}` as any);
                }
              }}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 14,
                borderRadius: mobileTheme.radius.lg,
                backgroundColor: theme.colors.primary,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 48,
                opacity: pressed ? 0.85 : 1
              })}
            >
              <Text
                style={{
                  fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                  fontWeight: "700",
                  color: theme.colors.white,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {t("groups.openGroup") ?? "Open"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}

function FieldLabel({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        fontSize: mobileTheme.typography.caption.fontSize,
        fontWeight: "700",
        color: theme.colors.ink,
        fontFamily: "Inter_700Bold",
        marginTop: mobileTheme.spacing.lg,
        marginBottom: mobileTheme.spacing.sm,
        textTransform: "uppercase",
        letterSpacing: 0.5
      }}
    >
      {text}
    </Text>
  );
}
