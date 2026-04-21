import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ImagePlus,
  Loader2,
  LogOut,
  Trash2
} from "lucide-react-native";
import { useRouter } from "expo-router";

import {
  changePassword,
  getMyShelter,
  updateMyShelter,
  uploadImageUriToR2
} from "@/lib/api";
import {
  WeekHoursPicker,
  emptyWeek,
  formatWeeklyHours,
  parseWeeklyHours,
  type WeekState
} from "@/components/hours-picker";
import { useSession } from "@/store/session";
import { theme } from "@/lib/theme";

const MAX_IMAGE_MB = 3;

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const clearSession = useSession((s) => s.clearSession);
  const setShelter = useSession((s) => s.setShelter);

  const { data: shelter } = useQuery({
    queryKey: ["shelter-me"],
    queryFn: getMyShelter
  });

  const [about, setAbout] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [cityLabel, setCityLabel] = useState("");
  const [adoptionProcess, setAdoptionProcess] = useState("");
  const [donationUrl, setDonationUrl] = useState("");
  const [showRecentlyAdopted, setShowRecentlyAdopted] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [heroUrl, setHeroUrl] = useState<string | undefined>(undefined);
  const [hoursState, setHoursState] = useState<WeekState>(emptyWeek());
  const [uploading, setUploading] = useState<"logo" | "hero" | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!shelter) return;
    setAbout(shelter.about);
    setPhone(shelter.phone);
    setWebsite(shelter.website);
    setAddress(shelter.address);
    setCityLabel(shelter.cityLabel);
    setAdoptionProcess(shelter.adoptionProcess ?? "");
    setDonationUrl(shelter.donationUrl ?? "");
    setShowRecentlyAdopted(!!shelter.showRecentlyAdopted);
    setLogoUrl(shelter.logoUrl ?? undefined);
    setHeroUrl(shelter.heroUrl ?? undefined);
    setHoursState(parseWeeklyHours(shelter.hours ?? ""));
    setDirty(false);
  }, [shelter]);

  async function onPickImage(kind: "logo" | "hero") {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Photo library access is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: kind === "logo" ? [1, 1] : [21, 9],
      quality: 0.9
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_MB * 1024 * 1024) {
      Alert.alert("Too large", `Image must be under ${MAX_IMAGE_MB} MB.`);
      return;
    }
    setUploading(kind);
    try {
      const url = await uploadImageUriToR2({
        uri: asset.uri,
        fileName: asset.fileName ?? `${kind}-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? "image/jpeg",
        folder: `shelters/${kind}`
      });
      if (kind === "logo") setLogoUrl(url);
      else setHeroUrl(url);
      setDirty(true);
    } catch (err) {
      Alert.alert("Upload failed", err instanceof Error ? err.message : "Try again.");
    } finally {
      setUploading(null);
    }
  }

  const updateMut = useMutation({
    mutationFn: () => {
      // Inline validation matching shelter-web: donation URL must be
      // well-formed, mission + process bodies are ≤ 1000 chars.
      if (donationUrl.trim() && !/^https?:\/\//i.test(donationUrl.trim())) {
        throw new Error("Donation URL must start with http:// or https://");
      }
      if (about.length > 1000) throw new Error("About is limited to 1000 characters.");
      if (adoptionProcess.length > 1000)
        throw new Error("Adoption process is limited to 1000 characters.");
      return updateMyShelter({
        ...shelter!,
        about,
        phone,
        website,
        address,
        cityLabel,
        adoptionProcess,
        donationUrl: donationUrl.trim(),
        showRecentlyAdopted,
        logoUrl,
        heroUrl,
        hours: formatWeeklyHours(hoursState)
      });
    },
    onSuccess: async (updated) => {
      await setShelter(updated);
      queryClient.invalidateQueries({ queryKey: ["shelter-me"] });
      setDirty(false);
      Alert.alert("Profile saved");
    },
    onError: (err: Error) => Alert.alert("Could not save", err.message)
  });

  const [curr, setCurr] = useState("");
  const [next, setNext] = useState("");
  const [conf, setConf] = useState("");
  const pwdMut = useMutation({
    mutationFn: () => changePassword(curr, next),
    onSuccess: () => {
      Alert.alert("Password updated");
      setCurr("");
      setNext("");
      setConf("");
    },
    onError: (err: Error) => Alert.alert("Could not update password", err.message)
  });

  async function onLogout() {
    await clearSession();
    router.replace("/(auth)/login");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            padding: theme.spacing.xl,
            gap: theme.spacing.xl,
            paddingBottom: 80
          }}
        >
          {/* Identity */}
          <View style={{ alignItems: "center", gap: theme.spacing.md }}>
            {logoUrl ? (
              <Image
                source={{ uri: logoUrl }}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 20,
                  backgroundColor: theme.colors.border
                }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 20,
                  backgroundColor: theme.colors.primaryBg,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Building2 size={32} color={theme.colors.primary} />
              </View>
            )}
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.ink }}>
                {shelter?.name}
              </Text>
              <Text style={{ marginTop: 2, fontSize: 12, color: theme.colors.muted }}>
                {shelter?.email}
              </Text>
            </View>
          </View>

          {/* Branding */}
          <Section title="Branding">
            <Text style={{ fontSize: 11, color: theme.colors.muted }}>
              Logo shows as your avatar. Hero is the banner on your profile. Both
              under {MAX_IMAGE_MB} MB.
            </Text>
            <ImagePickerRow
              label="Logo (square, 256×256+)"
              url={logoUrl}
              uploading={uploading === "logo"}
              onPick={() => onPickImage("logo")}
              onClear={() => {
                setLogoUrl(undefined);
                setDirty(true);
              }}
              aspectSquare
            />
            <ImagePickerRow
              label="Hero banner (wide, 1600×720+)"
              url={heroUrl}
              uploading={uploading === "hero"}
              onPick={() => onPickImage("hero")}
              onClear={() => {
                setHeroUrl(undefined);
                setDirty(true);
              }}
            />
          </Section>

          {/* Profile fields */}
          <Section title="Profile">
            <Field label="About">
              <TextInput
                value={about}
                onChangeText={(v) => {
                  setAbout(v);
                  setDirty(true);
                }}
                multiline
                placeholder="Share what makes your shelter special"
                placeholderTextColor={theme.colors.muted}
                style={[inputStyle, { minHeight: 80, textAlignVertical: "top" }]}
              />
            </Field>
            <Field label="Phone">
              <TextInput
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  setDirty(true);
                }}
                placeholder="+90 212…"
                placeholderTextColor={theme.colors.muted}
                style={inputStyle}
              />
            </Field>
            <Field label="Website">
              <TextInput
                value={website}
                onChangeText={(v) => {
                  setWebsite(v);
                  setDirty(true);
                }}
                placeholder="https://"
                autoCapitalize="none"
                placeholderTextColor={theme.colors.muted}
                style={inputStyle}
              />
            </Field>
            <Field label="Address">
              <TextInput
                value={address}
                onChangeText={(v) => {
                  setAddress(v);
                  setDirty(true);
                }}
                placeholderTextColor={theme.colors.muted}
                style={inputStyle}
              />
            </Field>
            <Field label="City">
              <TextInput
                value={cityLabel}
                onChangeText={(v) => {
                  setCityLabel(v);
                  setDirty(true);
                }}
                placeholderTextColor={theme.colors.muted}
                style={inputStyle}
              />
            </Field>
          </Section>

          {/* Public profile — mission, adoption process, donation URL, recently adopted toggle */}
          <Section title="Public profile">
            <Text style={{ fontSize: 11, color: theme.colors.muted, marginBottom: 6 }}>
              This is what adopters see on your shelter page. Only live once your
              account is verified.
            </Text>
            <Field label={`Adoption process (${adoptionProcess.length} / 1000)`}>
              <TextInput
                value={adoptionProcess}
                onChangeText={(v) => {
                  setAdoptionProcess(v);
                  setDirty(true);
                }}
                multiline
                maxLength={1000}
                placeholder="Walk adopters through how you rehome — application, home check, fee, follow-up…"
                placeholderTextColor={theme.colors.muted}
                style={[inputStyle, { minHeight: 90, textAlignVertical: "top" }]}
              />
            </Field>
            <Field label="Donation URL (optional)">
              <TextInput
                value={donationUrl}
                onChangeText={(v) => {
                  setDonationUrl(v);
                  setDirty(true);
                }}
                placeholder="https://yourshelter.org/donate"
                autoCapitalize="none"
                keyboardType="url"
                placeholderTextColor={theme.colors.muted}
                style={inputStyle}
              />
            </Field>
            <Pressable
              onPress={() => {
                setShowRecentlyAdopted((v) => !v);
                setDirty(true);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                opacity: pressed ? 0.85 : 1
              })}
            >
              <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.ink }}>
                  Show "Recently adopted" section
                </Text>
                <Text style={{ marginTop: 2, fontSize: 11, color: theme.colors.muted }}>
                  Displays your last 10 adopted animals on the public profile. Off by default.
                </Text>
              </View>
              <View
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: showRecentlyAdopted ? theme.colors.primary : theme.colors.border,
                  padding: 2,
                  justifyContent: "center"
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: "#FFFFFF",
                    marginLeft: showRecentlyAdopted ? 20 : 0
                  }}
                />
              </View>
            </Pressable>
          </Section>

          {/* Hours */}
          <Section title="Opening hours">
            <WeekHoursPicker
              value={hoursState}
              onChange={(next) => {
                setHoursState(next);
                setDirty(true);
              }}
            />
          </Section>

          {dirty ? (
            <Pressable
              onPress={() => updateMut.mutate()}
              disabled={updateMut.isPending || Boolean(uploading)}
              style={({ pressed }) => ({
                paddingVertical: 14,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.primary,
                alignItems: "center",
                opacity: pressed ? 0.9 : updateMut.isPending ? 0.6 : 1
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                {updateMut.isPending ? "Saving…" : "Save profile"}
              </Text>
            </Pressable>
          ) : null}

          {/* Password */}
          <Section title="Change password">
            <Field label="Current">
              <TextInput
                value={curr}
                onChangeText={setCurr}
                secureTextEntry
                style={inputStyle}
              />
            </Field>
            <Field label="New (min 8 chars)">
              <TextInput value={next} onChangeText={setNext} secureTextEntry style={inputStyle} />
            </Field>
            <Field label="Confirm">
              <TextInput value={conf} onChangeText={setConf} secureTextEntry style={inputStyle} />
            </Field>
            <Pressable
              onPress={() => {
                if (next.length < 8) return Alert.alert("Password must be at least 8 characters");
                if (next !== conf) return Alert.alert("Passwords do not match");
                pwdMut.mutate();
              }}
              style={({ pressed }) => ({
                paddingVertical: 12,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.ink,
                alignItems: "center",
                opacity: pressed ? 0.9 : 1
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Update password</Text>
            </Pressable>
          </Section>

          {/* v0.15 — Team management entry. Visible to everyone
              (even viewers can see the roster); write actions inside
              the screen are gated by role. */}
          <Pressable
            onPress={() => router.push("/(app)/team")}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 12,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "#FFFFFF",
              marginBottom: theme.spacing.md,
              opacity: pressed ? 0.9 : 1
            })}
          >
            <Text style={{ color: theme.colors.ink, fontWeight: "700" }}>
              Team management →
            </Text>
          </Pressable>

          <Pressable
            onPress={onLogout}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 12,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: theme.colors.border,
              opacity: pressed ? 0.7 : 1
            })}
          >
            <LogOut size={14} color={theme.colors.danger} />
            <Text style={{ color: theme.colors.danger, fontWeight: "700" }}>Sign out</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text
        style={{ fontSize: 11, fontWeight: "700", color: theme.colors.muted, letterSpacing: 0.5 }}
      >
        {title.toUpperCase()}
      </Text>
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          gap: theme.spacing.md
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.muted }}>{label}</Text>
      {children}
    </View>
  );
}

function ImagePickerRow({
  label,
  url,
  uploading,
  onPick,
  onClear,
  aspectSquare
}: {
  label: string;
  url?: string;
  uploading: boolean;
  onPick: () => void;
  onClear: () => void;
  aspectSquare?: boolean;
}) {
  const previewStyle = aspectSquare
    ? { width: 72, height: 72 }
    : { width: "100%" as const, aspectRatio: 21 / 9 };
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.muted }}>{label}</Text>
      <View
        style={[
          {
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.background,
            borderWidth: 1,
            borderColor: theme.colors.border,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center"
          },
          previewStyle
        ]}
      >
        {uploading ? (
          <Loader2 size={22} color={theme.colors.primary} />
        ) : url ? (
          <Image
            source={{ uri: url }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        ) : (
          <ImagePlus size={22} color={theme.colors.muted} />
        )}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={onPick}
          disabled={uploading}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 10,
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            borderColor: theme.colors.primary,
            alignItems: "center",
            opacity: pressed ? 0.7 : 1
          })}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: "700", fontSize: 12 }}>
            {url ? "Replace" : "Upload"}
          </Text>
        </Pressable>
        {url ? (
          <Pressable
            onPress={onClear}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: theme.colors.border,
              opacity: pressed ? 0.7 : 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 4
            })}
          >
            <Trash2 size={12} color={theme.colors.danger} />
            <Text style={{ color: theme.colors.danger, fontSize: 12, fontWeight: "700" }}>
              Remove
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const inputStyle = {
  height: 42,
  paddingHorizontal: 12,
  borderRadius: theme.radius.md,
  borderWidth: 1,
  borderColor: theme.colors.border,
  backgroundColor: theme.colors.background,
  color: theme.colors.ink,
  fontSize: 14
};
