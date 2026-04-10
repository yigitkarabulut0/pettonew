import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { LottieLoading } from "@/components/lottie-loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, MapPin, Plus, Search } from "lucide-react-native";

import { listLostPets, createLostPetAlert, listMyPets } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function LostPetsPage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();

  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [description, setDescription] = useState("");
  const [lastSeenLocation, setLastSeenLocation] = useState("");
  const [lastSeenDate, setLastSeenDate] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const token = session?.tokens.accessToken ?? "";

  const alertsQuery = useQuery({
    queryKey: ["lost-pets"],
    queryFn: () => listLostPets(token),
    enabled: Boolean(token)
  });

  const petsQuery = useQuery({
    queryKey: ["my-pets"],
    queryFn: () => listMyPets(token),
    enabled: Boolean(token)
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createLostPetAlert(token, {
        petId: selectedPetId,
        description: description.trim(),
        lastSeenLocation: lastSeenLocation.trim(),
        lastSeenDate: lastSeenDate.trim() || new Date().toISOString(),
        contactPhone: contactPhone.trim(),
        imageUrl: undefined
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lost-pets"] });
      setSelectedPetId("");
      setDescription("");
      setLastSeenLocation("");
      setLastSeenDate("");
      setContactPhone("");
      setComposerOpen(false);
    }
  });

  const onRefresh = useCallback(() => {
    alertsQuery.refetch();
  }, [alertsQuery]);

  const alerts = alertsQuery.data ?? [];
  const myPets = petsQuery.data ?? [];

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
              color: theme.colors.ink
            }}
          >
            Lost Pet Alerts
          </Text>
        </View>
        <Pressable
          onPress={() => setComposerOpen(!composerOpen)}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.colors.dangerBg,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Plus size={18} color={theme.colors.danger} />
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
            refreshing={alertsQuery.isRefetching}
            onRefresh={onRefresh}
            tintColor="#F48C28"
          />
        }
      >
        {/* Composer */}
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
                color: theme.colors.ink
              }}
            >
              Report Lost Pet
            </Text>

            {/* Pet Selector */}
            <View style={{ gap: mobileTheme.spacing.sm }}>
              <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.muted }}>Select Pet</Text>
              <View style={{ flexDirection: "row", gap: mobileTheme.spacing.sm, flexWrap: "wrap" }}>
                {myPets.map((pet) => (
                  <Pressable
                    key={pet.id}
                    onPress={() => setSelectedPetId(pet.id)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: mobileTheme.radius.pill,
                      backgroundColor: selectedPetId === pet.id ? theme.colors.primaryBg : theme.colors.background,
                      borderWidth: 1,
                      borderColor: selectedPetId === pet.id ? theme.colors.primary : theme.colors.border
                    }}
                  >
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.caption.fontSize,
                        fontWeight: selectedPetId === pet.id ? "600" : "400",
                        color: selectedPetId === pet.id ? theme.colors.primary : theme.colors.ink
                      }}
                    >
                      {pet.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description (breed, color, size...)"
              placeholderTextColor={theme.colors.muted}
              multiline
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                minHeight: 80,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink,
                textAlignVertical: "top"
              }}
            />

            <TextInput
              value={lastSeenLocation}
              onChangeText={setLastSeenLocation}
              placeholder="Last Seen Location"
              placeholderTextColor={theme.colors.muted}
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink
              }}
            />

            <TextInput
              value={lastSeenDate}
              onChangeText={setLastSeenDate}
              placeholder="Last Seen Date (YYYY-MM-DD)"
              placeholderTextColor={theme.colors.muted}
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink
              }}
            />

            <TextInput
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="Contact Phone"
              placeholderTextColor={theme.colors.muted}
              keyboardType="phone-pad"
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink
              }}
            />

            <Pressable
              onPress={() => createMutation.mutate()}
              disabled={!selectedPetId || !description.trim() || !contactPhone.trim() || createMutation.isPending}
              style={{
                backgroundColor: selectedPetId && description.trim() && contactPhone.trim() ? theme.colors.danger : theme.colors.border,
                borderRadius: mobileTheme.radius.md,
                paddingVertical: mobileTheme.spacing.md,
                alignItems: "center"
              }}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: mobileTheme.typography.body.fontSize }}>
                  Create Alert
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Loading */}
        {alertsQuery.isLoading && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center" }}>
            <LottieLoading size={70} />
          </View>
        )}

        {/* Empty */}
        {!alertsQuery.isLoading && alerts.length === 0 && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center", gap: mobileTheme.spacing.lg }}>
            <Search size={48} color={theme.colors.muted} />
            <Text style={{ fontSize: mobileTheme.typography.subheading.fontSize, fontWeight: mobileTheme.typography.subheading.fontWeight, color: theme.colors.ink }}>
              No lost pet alerts
            </Text>
            <Text style={{ fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.muted, textAlign: "center", paddingHorizontal: mobileTheme.spacing["3xl"] }}>
              Thankfully no pets are reported lost in your area.
            </Text>
          </View>
        )}

        {/* Alerts */}
        {alerts.map((alert) => (
          <View
            key={alert.id}
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.lg,
              overflow: "hidden",
              marginBottom: mobileTheme.spacing.md,
              ...mobileTheme.shadow.sm
            }}
          >
            {alert.imageUrl && (
              <Image
                source={{ uri: alert.imageUrl }}
                style={{ width: "100%", height: 160 }}
                resizeMode="cover"
              />
            )}
            <View style={{ padding: mobileTheme.spacing.xl, gap: mobileTheme.spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.muted }}>
                  {new Date(alert.lastSeenDate).toLocaleDateString()}
                </Text>
                <View
                  style={{
                    backgroundColor: alert.status === "active" ? theme.colors.dangerBg : theme.colors.successBg,
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                    borderRadius: mobileTheme.radius.pill
                  }}
                >
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.micro.fontSize,
                      fontWeight: "600",
                      color: alert.status === "active" ? theme.colors.danger : theme.colors.success,
                      textTransform: "capitalize"
                    }}
                  >
                    {alert.status}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.ink, lineHeight: mobileTheme.typography.body.lineHeight }}>
                {alert.description}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <MapPin size={14} color={theme.colors.muted} />
                <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.muted }}>
                  {alert.lastSeenLocation}
                </Text>
              </View>
              <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.primary, marginTop: 4 }}>
                Contact: {alert.contactPhone}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
