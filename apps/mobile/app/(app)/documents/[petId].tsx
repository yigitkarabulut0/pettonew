import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  ArrowLeft,
  Calendar,
  Camera,
  FileText,
  Image as ImageIcon,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { LottieLoading } from "@/components/lottie-loading";
import {
  createPetDocument,
  deletePetDocument,
  listPetDocuments,
  uploadMedia
} from "@/lib/api";
import type { PetDocument } from "@petto/contracts";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useLocalRefresh } from "@/lib/use-local-refresh";
import { useSessionStore } from "@/store/session";

const DOC_KINDS: { key: PetDocument["kind"]; labelKey: string; color: string }[] = [
  { key: "vaccine",   labelKey: "documents.kindVaccine",   color: "#3F7D4E" },
  { key: "medical",   labelKey: "documents.kindMedical",   color: "#5B9BD5" },
  { key: "insurance", labelKey: "documents.kindInsurance", color: "#6B4EFF" },
  { key: "microchip", labelKey: "documents.kindMicrochip", color: "#A14632" },
  { key: "other",     labelKey: "documents.kindOther",     color: "#8B6F47" }
];

const FALLBACK_KIND = DOC_KINDS[4]!; // "other"
function kindMeta(kind: PetDocument["kind"]) {
  return DOC_KINDS.find((d) => d.key === kind) ?? FALLBACK_KIND;
}

export default function DocumentsPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const token = session?.tokens.accessToken ?? "";

  const [composerOpen, setComposerOpen] = useState(false);
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedMime, setPickedMime] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<PetDocument["kind"]>("vaccine");
  const [expiresDate, setExpiresDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<PetDocument | null>(null);

  // Format the picked Date back to the YYYY-MM-DD shape the server stores —
  // keeps the API contract simple and avoids timezone drift on round-trips.
  const expiresAtISO = expiresDate
    ? `${expiresDate.getFullYear()}-${String(expiresDate.getMonth() + 1).padStart(2, "0")}-${String(expiresDate.getDate()).padStart(2, "0")}`
    : "";

  const docsQuery = useQuery({
    queryKey: ["documents", petId],
    queryFn: () => listPetDocuments(token, petId!),
    enabled: Boolean(token && petId)
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!pickedUri) throw new Error("no_file");
      setUploading(true);
      try {
        const asset = await uploadMedia(
          token,
          pickedUri,
          `pet-doc-${Date.now()}.jpg`,
          pickedMime,
          { folder: "pet-documents" }
        );
        return createPetDocument(token, petId!, {
          kind,
          title: title.trim(),
          fileUrl: asset.url,
          fileKind: "image",
          expiresAt: expiresAtISO || undefined,
          notes: notes.trim() || undefined
        });
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["documents", petId] });
      setPickedUri(null);
      setPickedMime(undefined);
      setTitle("");
      setExpiresDate(null);
      setNotes("");
      setKind("vaccine");
      setComposerOpen(false);
    },
    onError: () => {
      setUploading(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => deletePetDocument(token, petId!, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", petId] });
    }
  });

  const { refreshing, handleRefresh } = useLocalRefresh(
    useCallback(() => docsQuery.refetch(), [docsQuery])
  );

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8
    });
    if (result.canceled) return;
    const a = result.assets[0];
    if (!a) return;
    setPickedUri(a.uri);
    setPickedMime(a.mimeType);
  };

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8
    });
    if (result.canceled) return;
    const a = result.assets[0];
    if (!a) return;
    setPickedUri(a.uri);
    setPickedMime(a.mimeType);
  };

  const confirmDelete = (doc: PetDocument) => {
    Alert.alert(
      t("documents.deleteConfirmTitle"),
      t("documents.deleteConfirmBody", { title: doc.title }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deleteMutation.mutate(doc.id)
        }
      ]
    );
  };

  const canSave = pickedUri && title.trim().length > 0 && !uploading;
  const docs = docsQuery.data ?? [];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.lg,
          paddingHorizontal: mobileTheme.spacing.xl,
          backgroundColor: theme.colors.white,
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.colors.background,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <ArrowLeft size={18} color={theme.colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: mobileTheme.typography.subheading.fontSize,
              fontWeight: mobileTheme.typography.subheading.fontWeight,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            {t("documents.title")}
          </Text>
        </View>
        <Pressable
          onPress={() => setComposerOpen(!composerOpen)}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.colors.primaryBg,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Plus size={18} color={theme.colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingTop: mobileTheme.spacing.xl,
          paddingBottom: insets.bottom + 24
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {composerOpen && (
          <View
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.lg,
              padding: mobileTheme.spacing.xl,
              marginBottom: mobileTheme.spacing.xl,
              gap: mobileTheme.spacing.lg,
              ...mobileTheme.shadow.sm
            }}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                color: theme.colors.ink,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              {t("documents.newDocument")}
            </Text>

            {/* File picker — preview + change */}
            <View style={{ gap: mobileTheme.spacing.sm }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium"
                }}
              >
                {t("documents.file")}
              </Text>
              {pickedUri ? (
                <View
                  style={{
                    borderRadius: mobileTheme.radius.md,
                    overflow: "hidden",
                    backgroundColor: theme.colors.background,
                    borderWidth: 1,
                    borderColor: theme.colors.border
                  }}
                >
                  <Image
                    source={{ uri: pickedUri }}
                    style={{ width: "100%", height: 180 }}
                    contentFit="cover"
                    transition={200}
                  />
                  <Pressable
                    onPress={() => {
                      setPickedUri(null);
                      setPickedMime(undefined);
                    }}
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: "rgba(0,0,0,0.55)",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <X size={14} color="#FFFFFF" />
                  </Pressable>
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: mobileTheme.spacing.sm }}>
                  <PickerButton
                    label={t("documents.takePhoto")}
                    icon={<Camera size={18} color={theme.colors.primary} />}
                    onPress={pickFromCamera}
                    theme={theme}
                  />
                  <PickerButton
                    label={t("documents.fromLibrary")}
                    icon={<ImageIcon size={18} color={theme.colors.primary} />}
                    onPress={pickFromLibrary}
                    theme={theme}
                  />
                </View>
              )}
            </View>

            {/* Kind chips */}
            <View style={{ gap: mobileTheme.spacing.sm }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium"
                }}
              >
                {t("documents.kind")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {DOC_KINDS.map((k) => {
                  const sel = kind === k.key;
                  return (
                    <Pressable
                      key={k.key}
                      onPress={() => {
                        setKind(k.key);
                        Haptics.selectionAsync();
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: mobileTheme.radius.pill,
                        backgroundColor: sel ? k.color + "22" : theme.colors.background,
                        borderWidth: 1,
                        borderColor: sel ? k.color : theme.colors.border
                      }}
                    >
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.caption.fontSize,
                          fontWeight: sel ? "700" : "500",
                          color: sel ? k.color : theme.colors.muted,
                          fontFamily: sel ? "Inter_700Bold" : "Inter_500Medium"
                        }}
                      >
                        {t(k.labelKey)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Field label={t("documents.titleField")} theme={theme}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t("documents.titlePlaceholder")}
                placeholderTextColor={theme.colors.muted}
                style={inputStyle(theme)}
              />
            </Field>

            <Field label={t("documents.expiresAt")} theme={theme}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: mobileTheme.spacing.sm }}>
                <Pressable
                  onPress={() => setShowDatePicker(true)}
                  style={{
                    ...inputStyle(theme),
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8
                  }}
                >
                  <Calendar size={16} color={theme.colors.primary} />
                  <Text
                    style={{
                      flex: 1,
                      fontSize: mobileTheme.typography.body.fontSize,
                      color: expiresDate ? theme.colors.ink : theme.colors.muted,
                      fontFamily: expiresDate ? "Inter_500Medium" : "Inter_400Regular"
                    }}
                  >
                    {expiresDate
                      ? expiresDate.toLocaleDateString()
                      : t("documents.pickDate")}
                  </Text>
                </Pressable>
                {expiresDate ? (
                  <Pressable
                    onPress={() => setExpiresDate(null)}
                    hitSlop={8}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: mobileTheme.radius.md,
                      backgroundColor: theme.colors.background,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <X size={14} color={theme.colors.muted} />
                  </Pressable>
                ) : null}
              </View>
              {showDatePicker && (
                <DateTimePicker
                  value={expiresDate ?? new Date()}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  minimumDate={new Date()}
                  onChange={(_, d) => {
                    if (Platform.OS !== "ios") setShowDatePicker(false);
                    if (d) setExpiresDate(d);
                  }}
                />
              )}
              {Platform.OS === "ios" && showDatePicker && (
                <Pressable
                  onPress={() => setShowDatePicker(false)}
                  style={{
                    alignSelf: "flex-end",
                    paddingVertical: 6,
                    paddingHorizontal: 12
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.primary,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: mobileTheme.typography.caption.fontSize
                    }}
                  >
                    {t("common.done")}
                  </Text>
                </Pressable>
              )}
            </Field>

            <Field label={t("documents.notes")} theme={theme}>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder={t("documents.notesPlaceholder")}
                placeholderTextColor={theme.colors.muted}
                multiline
                style={{ ...inputStyle(theme), minHeight: 64, textAlignVertical: "top" }}
              />
            </Field>

            <Pressable
              onPress={() => createMutation.mutate()}
              disabled={!canSave || createMutation.isPending}
              style={{
                backgroundColor: canSave ? theme.colors.primary : theme.colors.border,
                borderRadius: mobileTheme.radius.md,
                paddingVertical: mobileTheme.spacing.md,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: mobileTheme.spacing.sm
              }}
            >
              {createMutation.isPending || uploading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Send size={16} color="#FFFFFF" />
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontWeight: "600",
                      fontSize: mobileTheme.typography.body.fontSize,
                      fontFamily: "Inter_600SemiBold"
                    }}
                  >
                    {t("documents.save")}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {docsQuery.isLoading ? (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center" }}>
            <LottieLoading size={70} />
          </View>
        ) : docs.length === 0 ? (
          <View
            style={{
              paddingVertical: mobileTheme.spacing["4xl"],
              alignItems: "center",
              gap: mobileTheme.spacing.lg
            }}
          >
            <ShieldCheck size={48} color={theme.colors.muted} />
            <Text
              style={{
                fontSize: mobileTheme.typography.subheading.fontSize,
                fontWeight: mobileTheme.typography.subheading.fontWeight,
                color: theme.colors.ink,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              {t("documents.empty")}
            </Text>
            <Text
              style={{
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_400Regular",
                textAlign: "center",
                paddingHorizontal: mobileTheme.spacing["3xl"]
              }}
            >
              {t("documents.emptyDescription")}
            </Text>
          </View>
        ) : (
          <View style={{ gap: mobileTheme.spacing.md }}>
            {docs.map((doc) => {
              const meta = kindMeta(doc.kind);
              return (
                <Pressable
                  key={doc.id}
                  onPress={() => setPreviewDoc(doc)}
                  style={{
                    flexDirection: "row",
                    backgroundColor: theme.colors.white,
                    borderRadius: mobileTheme.radius.lg,
                    overflow: "hidden",
                    ...mobileTheme.shadow.sm
                  }}
                >
                  <View
                    style={{
                      width: 72,
                      height: 72,
                      backgroundColor: theme.colors.background,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    {doc.fileKind === "image" ? (
                      <Image
                        source={{ uri: doc.fileUrl }}
                        style={{ width: 72, height: 72 }}
                        contentFit="cover"
                        transition={200}
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <FileText size={28} color={meta.color} />
                    )}
                  </View>
                  <View style={{ flex: 1, padding: mobileTheme.spacing.md, gap: 4 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6
                      }}
                    >
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: mobileTheme.radius.pill,
                          backgroundColor: meta.color + "22"
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "700",
                            color: meta.color,
                            fontFamily: "Inter_700Bold",
                            textTransform: "uppercase",
                            letterSpacing: 0.5
                          }}
                        >
                          {t(meta.labelKey)}
                        </Text>
                      </View>
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: mobileTheme.typography.body.fontSize,
                        fontWeight: "700",
                        color: theme.colors.ink,
                        fontFamily: "Inter_700Bold"
                      }}
                    >
                      {doc.title}
                    </Text>
                    {doc.expiresAt ? (
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.caption.fontSize,
                          color: theme.colors.muted,
                          fontFamily: "Inter_500Medium"
                        }}
                      >
                        {t("documents.expires")} · {doc.expiresAt}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => confirmDelete(doc)}
                    hitSlop={8}
                    style={{
                      paddingHorizontal: mobileTheme.spacing.lg,
                      justifyContent: "center"
                    }}
                  >
                    <Trash2 size={16} color={theme.colors.muted} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Preview modal — full-screen image viewer */}
      <Modal
        visible={Boolean(previewDoc)}
        animationType="fade"
        transparent
        onRequestClose={() => setPreviewDoc(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.95)",
            paddingTop: insets.top,
            paddingBottom: insets.bottom
          }}
        >
          <Pressable
            onPress={() => setPreviewDoc(null)}
            style={{
              position: "absolute",
              top: insets.top + 12,
              right: 16,
              zIndex: 2,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.18)",
              alignItems: "center",
              justifyContent: "center"
            }}
            hitSlop={12}
          >
            <X size={18} color="#FFFFFF" />
          </Pressable>
          {previewDoc?.fileKind === "image" ? (
            <Image
              source={{ uri: previewDoc.fileUrl }}
              style={{ flex: 1 }}
              contentFit="contain"
              transition={250}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <FileText size={64} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", marginTop: 12, fontFamily: "Inter_500Medium" }}>
                {previewDoc?.title}
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function inputStyle(theme: ReturnType<typeof useTheme>) {
  return {
    backgroundColor: theme.colors.background,
    borderRadius: mobileTheme.radius.md,
    paddingHorizontal: mobileTheme.spacing.lg,
    paddingVertical: 12,
    fontSize: mobileTheme.typography.body.fontSize,
    color: theme.colors.ink,
    fontFamily: "Inter_400Regular"
  };
}

function Field({
  label,
  children,
  theme
}: {
  label: string;
  children: React.ReactNode;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ gap: mobileTheme.spacing.sm }}>
      <Text
        style={{
          fontSize: mobileTheme.typography.caption.fontSize,
          color: theme.colors.muted,
          fontFamily: "Inter_500Medium"
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function PickerButton({
  label,
  icon,
  onPress,
  theme
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 14,
        borderRadius: mobileTheme.radius.md,
        backgroundColor: pressed ? theme.colors.primaryBg : theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.primary + "33",
        borderStyle: "dashed"
      })}
    >
      {icon}
      <Text
        style={{
          fontSize: mobileTheme.typography.caption.fontSize,
          fontWeight: "700",
          color: theme.colors.primary,
          fontFamily: "Inter_700Bold"
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
