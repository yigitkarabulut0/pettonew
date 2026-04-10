import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Image,
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
import { LottieLoading } from "@/components/lottie-loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router as expoRouter } from "expo-router";
import {
  AlertTriangle,
  Edit3,
  Flag,
  Heart,
  ImageIcon,
  MapPin,
  PawPrint,
  Users,
  Calendar,
  X
} from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import { PetDetailModal } from "@/components/pet-card";
import { ReportModal } from "@/components/report-modal";
import { WeatherWidget } from "@/components/weather-widget";
import {
  createHomePost,
  listExploreVenues,
  listHomeFeed,
  listMyPets,
  toggleHomePostLike,
  uploadMedia
} from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import type { Pet } from "@petto/contracts";

export default function HomePage() {
  const theme = useTheme();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [composerOpen, setComposerOpen] = useState(false);
  const [petPickerOpen, setPetPickerOpen] = useState(false);
  const [body, setBody] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imageAsset, setImageAsset] = useState<{
    uri: string;
    mimeType?: string | null;
  } | null>(null);
  const [taggedPetIds, setTaggedPetIds] = useState<string[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: "chat" | "pet" | "post";
    id: string;
    label: string;
  } | null>(null);
  const [venuePickerOpen, setVenuePickerOpen] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [selectedVenueName, setSelectedVenueName] = useState<string | null>(null);

  const { data: posts = [], isLoading: postsLoading, refetch: refetchPosts, isRefetching: postsRefetching } = useQuery({
    queryKey: ["home-feed", session?.tokens.accessToken],
    queryFn: () => listHomeFeed(session!.tokens.accessToken),
    enabled: Boolean(session)
  });
  const { data: pets = [] } = useQuery({
    queryKey: ["home-my-pets", session?.tokens.accessToken],
    queryFn: () => listMyPets(session!.tokens.accessToken),
    enabled: Boolean(session)
  });
  const { data: venues = [] } = useQuery({
    queryKey: ["home-venues", session?.tokens.accessToken],
    queryFn: () => listExploreVenues(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  const selectedPet =
    posts
      .flatMap((post) => post.taggedPets)
      .find((pet) => pet.id === selectedPetId) ?? null;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("No session found.");

      let imageUrl: string | undefined;
      if (imageAsset) {
        const uploaded = await uploadMedia(
          session.tokens.accessToken,
          imageAsset.uri,
          "home-post.jpg",
          imageAsset.mimeType ?? "image/jpeg"
        );
        imageUrl = uploaded.url;
      }

      return createHomePost(session.tokens.accessToken, {
        body: body.trim(),
        imageUrl,
        taggedPetIds,
        venueId: selectedVenueId ?? undefined
      });
    },
    onSuccess: () => {
      setBody("");
      setImageAsset(null);
      setTaggedPetIds([]);
      setSelectedVenueId(null);
      setSelectedVenueName(null);
      setVenuePickerOpen(false);
      setErrorMessage(null);
      setComposerOpen(false);
      setPetPickerOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["home-feed", session?.tokens.accessToken]
      });
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to publish your post."
      );
    }
  });

  const likeMutation = useMutation({
    mutationFn: (postId: string) =>
      toggleHomePostLike(session!.tokens.accessToken, postId),
    onSuccess: (updatedPost) => {
      queryClient.setQueryData(
        ["home-feed", session?.tokens.accessToken],
        (old: any[] | undefined) =>
          old?.map((p) =>
            p.id === updatedPost.id
              ? { ...p, likeCount: updatedPost.likeCount, likedByMe: updatedPost.likedByMe }
              : p
          ) ?? []
      );
    }
  });

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.8
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setImageAsset({ uri: asset.uri, mimeType: asset.mimeType });
  };

  const openComposer = () => {
    setBody("");
    setImageAsset(null);
    setTaggedPetIds([]);
    setSelectedVenueId(null);
    setSelectedVenueName(null);
    setVenuePickerOpen(false);
    setPetPickerOpen(false);
    setErrorMessage(null);
    setComposerOpen(true);
  };

  const canPost = body.trim().length > 0 || imageAsset !== null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
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
        <Avatar
          uri={session?.user.avatarUrl}
          name={session?.user.firstName}
          size="md"
        />
        <Text
          style={{
            fontSize: mobileTheme.typography.heading.fontSize,
            fontWeight: mobileTheme.typography.heading.fontWeight,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          Petto
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <Pressable
        onPress={openComposer}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md,
          marginHorizontal: mobileTheme.spacing.xl,
          marginBottom: mobileTheme.spacing.lg,
          padding: mobileTheme.spacing.md + 4,
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: theme.colors.white,
          borderWidth: 1,
          borderColor: theme.colors.border,
          ...mobileTheme.shadow.sm
        }}
      >
        <Edit3 size={18} color={theme.colors.muted} />
        <Text
          style={{
            color: theme.colors.muted,
            fontSize: mobileTheme.typography.body.fontSize,
            fontFamily: "Inter_400Regular",
            flex: 1
          }}
        >
          Write something...
        </Text>
      </Pressable>

      {postsLoading && posts.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 }}>
          <LottieLoading size={70} />
        </View>
      ) : (
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={postsRefetching}
            onRefresh={refetchPosts}
            tintColor={theme.colors.primary}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingBottom: 100 + insets.bottom,
          gap: mobileTheme.spacing.lg
        }}
      >
        <WeatherWidget />

        <View style={{ flexDirection: "row", gap: mobileTheme.spacing.sm }}>
          {[
            { label: "Groups", icon: Users, route: "/(app)/groups", color: theme.colors.secondary },
            { label: "Playdates", icon: Calendar, route: "/(app)/playdates", color: theme.colors.primary },
            { label: "Lost & Found", icon: AlertTriangle, route: "/(app)/lost-pets", color: theme.colors.danger }
          ].map((item) => (
            <Pressable
              key={item.label}
              onPress={() => expoRouter.push(item.route as any)}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: "center",
                gap: mobileTheme.spacing.xs,
                paddingVertical: mobileTheme.spacing.md,
                borderRadius: mobileTheme.radius.lg,
                backgroundColor: theme.colors.white,
                ...mobileTheme.shadow.sm,
                opacity: pressed ? 0.85 : 1
              })}
            >
              <item.icon size={20} color={item.color} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.micro.fontSize,
                  fontFamily: "Inter_600SemiBold",
                  color: theme.colors.ink
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {posts.length ? (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onLike={() => likeMutation.mutate(post.id)}
              onPetPress={(petId) => setSelectedPetId(petId)}
              onReport={() => {
                setReportTarget({
                  type: "post",
                  id: post.id,
                  label: post.author.firstName
                });
                setReportOpen(true);
              }}
            />
          ))
        ) : (
          <View
            style={{
              padding: mobileTheme.spacing["3xl"],
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: theme.colors.white,
              alignItems: "center",
              gap: mobileTheme.spacing.md,
              ...mobileTheme.shadow.sm
            }}
          >
            <Edit3 size={40} color={theme.colors.muted} />
            <Text
              style={{
                fontSize: mobileTheme.typography.subheading.fontSize,
                fontWeight: mobileTheme.typography.subheading.fontWeight,
                color: theme.colors.ink,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              No posts yet
            </Text>
            <Text
              style={{
                color: theme.colors.muted,
                lineHeight: mobileTheme.typography.body.lineHeight,
                textAlign: "center",
                fontSize: mobileTheme.typography.body.fontSize,
                fontFamily: "Inter_400Regular"
              }}
            >
              Share the first post from your pet world and it will appear here.
            </Text>
          </View>
        )}
      </ScrollView>
      )}

      <Modal visible={composerOpen} animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={{ flex: 1, backgroundColor: theme.colors.white }}>
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
                onPress={() => setComposerOpen(false)}
                hitSlop={12}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <X size={22} color={theme.colors.ink} />
              </Pressable>
              <Pressable
                onPress={() => createMutation.mutate()}
                disabled={!canPost || createMutation.isPending}
                style={{
                  paddingHorizontal: mobileTheme.spacing.lg,
                  paddingVertical: mobileTheme.spacing.sm + 2,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: canPost
                    ? theme.colors.primary
                    : theme.colors.border,
                  opacity: createMutation.isPending ? 0.5 : 1
                }}
              >
                <Text
                  style={{
                    color: theme.colors.white,
                    fontWeight: "700",
                    fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {createMutation.isPending ? "Posting..." : "Post"}
                </Text>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                flex: 1,
                paddingHorizontal: mobileTheme.spacing.xl
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: mobileTheme.spacing.md,
                  paddingTop: mobileTheme.spacing.sm
                }}
              >
                <Avatar
                  uri={session?.user.avatarUrl}
                  name={session?.user.firstName}
                  size="md"
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: theme.colors.ink,
                      fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                      fontWeight:
                        mobileTheme.typography.bodySemiBold.fontWeight,
                      fontFamily: "Inter_700Bold",
                      marginBottom: mobileTheme.spacing.sm
                    }}
                  >
                    {session?.user.firstName} {session?.user.lastName}
                  </Text>

                  <TextInput
                    value={body}
                    onChangeText={(value) => {
                      setBody(value);
                      setErrorMessage(null);
                    }}
                    placeholder="What's happening?"
                    placeholderTextColor={theme.colors.muted}
                    multiline
                    autoFocus
                    style={{
                      minHeight: 120,
                      fontSize: mobileTheme.typography.body.fontSize,
                      color: theme.colors.ink,
                      fontFamily: "Inter_400Regular",
                      lineHeight: mobileTheme.typography.body.lineHeight,
                      textAlignVertical: "top"
                    }}
                  />

                  {imageAsset ? (
                    <View
                      style={{
                        marginTop: mobileTheme.spacing.md,
                        position: "relative"
                      }}
                    >
                      <Image
                        source={{ uri: imageAsset.uri }}
                        style={{
                          width: "100%",
                          height: 200,
                          borderRadius: mobileTheme.radius.md
                        }}
                        resizeMode="cover"
                      />
                      <Pressable
                        onPress={() => setImageAsset(null)}
                        style={{
                          position: "absolute",
                          top: mobileTheme.spacing.sm,
                          right: mobileTheme.spacing.sm,
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: "rgba(0,0,0,0.5)",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                      >
                        <X size={14} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ) : null}

                  {errorMessage ? (
                    <Text
                      style={{
                        color: theme.colors.danger,
                        fontWeight: "600",
                        fontSize: mobileTheme.typography.caption.fontSize,
                        fontFamily: "Inter_600SemiBold",
                        marginTop: mobileTheme.spacing.md
                      }}
                    >
                      {errorMessage}
                    </Text>
                  ) : null}
                </View>
              </View>
            </ScrollView>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: mobileTheme.spacing.xl,
                paddingHorizontal: mobileTheme.spacing.xl,
                paddingVertical: mobileTheme.spacing.md,
                paddingBottom: insets.bottom + mobileTheme.spacing.md,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border
              }}
            >
              <Pressable onPress={() => void pickImage()} hitSlop={8}>
                <ImageIcon
                  size={22}
                  color={
                    imageAsset
                      ? theme.colors.primary
                      : theme.colors.ink
                  }
                />
              </Pressable>
              <Pressable
                onPress={() => setPetPickerOpen((prev) => !prev)}
                hitSlop={8}
              >
                <PawPrint
                  size={22}
                  color={
                    taggedPetIds.length > 0
                      ? theme.colors.primary
                      : theme.colors.ink
                  }
                  fill={
                    taggedPetIds.length > 0
                      ? theme.colors.primarySoft
                      : "transparent"
                  }
                />
              </Pressable>
              <Pressable
                onPress={() => setVenuePickerOpen((prev) => !prev)}
                hitSlop={8}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <MapPin
                  size={22}
                  color={
                    selectedVenueId
                      ? theme.colors.primary
                      : theme.colors.ink
                  }
                />
              </Pressable>
              {selectedVenueName && (
                <Pressable
                  onPress={() => {
                    setSelectedVenueId(null);
                    setSelectedVenueName(null);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    backgroundColor: theme.colors.primaryBg,
                    borderRadius: mobileTheme.radius.pill,
                    paddingHorizontal: 8,
                    paddingVertical: 4
                  }}
                >
                  <MapPin size={12} color={theme.colors.primary} />
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.micro.fontSize,
                      color: theme.colors.primary,
                      fontFamily: "Inter_600SemiBold",
                      fontWeight: "600"
                    }}
                    numberOfLines={1}
                  >
                    {selectedVenueName}
                  </Text>
                  <X size={12} color={theme.colors.primary} />
                </Pressable>
              )}
              <View style={{ flex: 1 }} />
              {(body.trim().length > 0 || imageAsset !== null) && (
                <Text
                  style={{
                    color: theme.colors.muted,
                    fontSize: mobileTheme.typography.micro.fontSize,
                    fontFamily: "Inter_400Regular"
                  }}
                >
                  {body.trim().length}/280
                </Text>
              )}
            </View>

            {venuePickerOpen && (
              <View
                style={{
                  position: "absolute",
                  bottom: insets.bottom + mobileTheme.spacing["3xl"] + 44,
                  left: mobileTheme.spacing.xl,
                  right: mobileTheme.spacing.xl,
                  maxHeight: 280,
                  borderRadius: mobileTheme.radius.lg,
                  backgroundColor: theme.colors.white,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  ...mobileTheme.shadow.lg,
                  overflow: "hidden"
                }}
              >
                <View
                  style={{
                    paddingHorizontal: mobileTheme.spacing.lg,
                    paddingVertical: mobileTheme.spacing.md,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border
                  }}
                >
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.caption.fontSize,
                      fontWeight: "700",
                      color: theme.colors.muted,
                      fontFamily: "Inter_700Bold",
                      textTransform: "uppercase",
                      letterSpacing: mobileTheme.typography.label.letterSpacing
                    }}
                  >
                    Tag a location
                  </Text>
                </View>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ padding: mobileTheme.spacing.sm }}
                >
                  {venues.map((venue) => {
                    const selected = selectedVenueId === venue.id;
                    return (
                      <Pressable
                        key={venue.id}
                        onPress={() => {
                          if (selected) {
                            setSelectedVenueId(null);
                            setSelectedVenueName(null);
                          } else {
                            setSelectedVenueId(venue.id);
                            setSelectedVenueName(venue.name);
                          }
                          setVenuePickerOpen(false);
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: mobileTheme.spacing.md,
                          padding: mobileTheme.spacing.md,
                          borderRadius: mobileTheme.radius.md,
                          backgroundColor: selected
                            ? theme.colors.primaryBg
                            : "transparent"
                        }}
                      >
                        <MapPin size={16} color={selected ? theme.colors.primary : theme.colors.muted} />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: theme.colors.ink,
                              fontSize: mobileTheme.typography.body.fontSize,
                              fontWeight: "600",
                              fontFamily: "Inter_600SemiBold"
                            }}
                          >
                            {venue.name}
                          </Text>
                          {venue.address ? (
                            <Text
                              style={{
                                color: theme.colors.muted,
                                fontSize: mobileTheme.typography.micro.fontSize,
                                fontFamily: "Inter_400Regular"
                              }}
                              numberOfLines={1}
                            >
                              {venue.address}
                            </Text>
                          ) : null}
                        </View>
                        {selected && (
                          <View
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              backgroundColor: theme.colors.primary,
                              alignItems: "center",
                              justifyContent: "center"
                            }}
                          >
                            <Text
                              style={{
                                color: theme.colors.white,
                                fontSize: 12,
                                fontWeight: "700"
                              }}
                            >
                              {"\u2713"}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {petPickerOpen && (
              <View
                style={{
                  position: "absolute",
                  bottom: insets.bottom + mobileTheme.spacing["3xl"] + 44,
                  left: mobileTheme.spacing.xl,
                  right: mobileTheme.spacing.xl,
                  maxHeight: 280,
                  borderRadius: mobileTheme.radius.lg,
                  backgroundColor: theme.colors.white,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  ...mobileTheme.shadow.lg,
                  overflow: "hidden"
                }}
              >
                <View
                  style={{
                    paddingHorizontal: mobileTheme.spacing.lg,
                    paddingVertical: mobileTheme.spacing.md,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border
                  }}
                >
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.caption.fontSize,
                      fontWeight: "700",
                      color: theme.colors.muted,
                      fontFamily: "Inter_700Bold",
                      textTransform: "uppercase",
                      letterSpacing: mobileTheme.typography.label.letterSpacing
                    }}
                  >
                    Tag a pet
                  </Text>
                </View>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ padding: mobileTheme.spacing.sm }}
                >
                  {pets.map((pet) => {
                    const selected = taggedPetIds.includes(pet.id);
                    return (
                      <Pressable
                        key={pet.id}
                        onPress={() =>
                          setTaggedPetIds((current) =>
                            current.includes(pet.id)
                              ? current.filter((id) => id !== pet.id)
                              : [...current, pet.id]
                          )
                        }
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: mobileTheme.spacing.md,
                          padding: mobileTheme.spacing.md,
                          borderRadius: mobileTheme.radius.md,
                          backgroundColor: selected
                            ? theme.colors.primaryBg
                            : "transparent"
                        }}
                      >
                        <PetAvatar uri={pet.photos[0]?.url} name={pet.name} />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: theme.colors.ink,
                              fontSize: mobileTheme.typography.body.fontSize,
                              fontWeight: "600",
                              fontFamily: "Inter_600SemiBold"
                            }}
                          >
                            {pet.name}
                          </Text>
                          <Text
                            style={{
                              color: theme.colors.muted,
                              fontSize: mobileTheme.typography.micro.fontSize,
                              fontFamily: "Inter_400Regular"
                            }}
                          >
                            {pet.speciesLabel} &middot; {pet.breedLabel}
                          </Text>
                        </View>
                        {selected && (
                          <View
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              backgroundColor: theme.colors.primary,
                              alignItems: "center",
                              justifyContent: "center"
                            }}
                          >
                            <Text
                              style={{
                                color: theme.colors.white,
                                fontSize: 12,
                                fontWeight: "700"
                              }}
                            >
                              ✓
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <PetDetailModal
        pet={selectedPet}
        visible={Boolean(selectedPet)}
        onClose={() => setSelectedPetId(null)}
      />

      <ReportModal
        visible={reportOpen}
        onClose={() => {
          setReportOpen(false);
          setReportTarget(null);
        }}
        targetType={reportTarget?.type ?? "post"}
        targetID={reportTarget?.id ?? ""}
        targetLabel={reportTarget?.label ?? ""}
      />
    </View>
  );
}

function PetAvatar({ uri, name }: { uri?: string | null; name?: string }) {
  const theme = useTheme();
  const size = 20;

  if (uri && uri.length > 0) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.colors.primarySoft,
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <Text
        style={{
          fontSize: 9,
          fontWeight: "700",
          color: theme.colors.primary,
          fontFamily: "Inter_700Bold"
        }}
      >
        {name?.charAt(0)?.toUpperCase() ?? "?"}
      </Text>
    </View>
  );
}

function PostCard({
  post,
  onLike,
  onPetPress,
  onReport
}: {
  post: {
    id: string;
    author: {
      avatarUrl?: string | null;
      firstName: string;
      lastName: string;
      cityLabel: string;
    };
    body: string;
    imageUrl?: string | null;
    taggedPets: Pet[];
    likeCount: number;
    likedByMe: boolean;
    createdAt: string;
    venueName?: string | null;
  };
  onLike: () => void;
  onPetPress: (petId: string) => void;
  onReport: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        borderRadius: mobileTheme.radius.lg,
        backgroundColor: theme.colors.white,
        overflow: "hidden",
        ...mobileTheme.shadow.sm
      }}
    >
      <View
        style={{
          flexDirection: "row",
          padding: mobileTheme.spacing.lg,
          paddingBottom: 0,
          gap: mobileTheme.spacing.md
        }}
      >
        <Avatar
          uri={post.author.avatarUrl}
          name={post.author.firstName}
          size="md"
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: theme.colors.ink,
              fontSize: mobileTheme.typography.bodySemiBold.fontSize,
              fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
              fontFamily: "Inter_700Bold"
            }}
          >
            {post.author.firstName} {post.author.lastName}
          </Text>
          {post.taggedPets.length > 0 ? (
            <Pressable
              onPress={() => {
                if (post.taggedPets.length === 1 && post.taggedPets[0]) {
                  onPetPress(post.taggedPets[0].id);
                }
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Text
                style={{
                  color: theme.colors.muted,
                  fontSize: mobileTheme.typography.micro.fontSize,
                  fontFamily: "Inter_400Regular"
                }}
              >
                tagged
              </Text>
              {post.taggedPets.map((pet) => (
                <Pressable
                  key={pet.id}
                  onPress={() => onPetPress(pet.id)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
                >
                  <PetAvatar uri={pet.photos[0]?.url} name={pet.name} />
                  <Text
                    style={{
                      color: theme.colors.secondary,
                      fontSize: mobileTheme.typography.micro.fontSize,
                      fontWeight: "600",
                      fontFamily: "Inter_600SemiBold"
                    }}
                  >
                    {pet.name}
                  </Text>
                </Pressable>
              ))}
            </Pressable>
          ) : (
            <Text
              style={{
                color: theme.colors.muted,
                fontSize: mobileTheme.typography.micro.fontSize,
                fontFamily: "Inter_400Regular"
              }}
            >
              {post.author.cityLabel} &middot;{" "}
              {new Date(post.createdAt).toLocaleDateString("en-GB")}
            </Text>
          )}
        </View>
      </View>

      <View
        style={{
          padding: mobileTheme.spacing.lg,
          gap: mobileTheme.spacing.md
        }}
      >
        {post.body ? (
          <Text
            style={{
              color: theme.colors.ink,
              lineHeight: mobileTheme.typography.body.lineHeight,
              fontSize: mobileTheme.typography.body.fontSize,
              fontFamily: "Inter_400Regular"
            }}
          >
            {post.body}
          </Text>
        ) : null}

        {post.venueName ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              alignSelf: "flex-start",
              backgroundColor: theme.colors.primaryBg,
              borderRadius: mobileTheme.radius.pill,
              paddingHorizontal: 10,
              paddingVertical: 4
            }}
          >
            <MapPin size={12} color={theme.colors.primary} />
            <Text
              style={{
                fontSize: mobileTheme.typography.micro.fontSize,
                color: theme.colors.primary,
                fontFamily: "Inter_600SemiBold",
                fontWeight: "600"
              }}
            >
              {post.venueName}
            </Text>
          </View>
        ) : null}

        {post.imageUrl && post.imageUrl.length > 0 ? (
          <Image
            source={{ uri: post.imageUrl }}
            style={{
              width: "100%",
              height: 260,
              borderRadius: mobileTheme.radius.md
            }}
            resizeMode="cover"
          />
        ) : null}

        {post.taggedPets.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: mobileTheme.spacing.sm }}
          >
            {post.taggedPets.map((pet) => (
              <Pressable
                key={pet.id}
                onPress={() => onPetPress(pet.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: mobileTheme.spacing.sm,
                  paddingVertical: mobileTheme.spacing.xs + 2,
                  paddingHorizontal: mobileTheme.spacing.md,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: theme.colors.secondarySoft,
                  borderWidth: 1,
                  borderColor: theme.colors.border
                }}
              >
                <PetAvatar uri={pet.photos[0]?.url} name={pet.name} />
                <Text
                  style={{
                    color: theme.colors.secondary,
                    fontSize: mobileTheme.typography.caption.fontSize,
                    fontFamily: "Inter_600SemiBold",
                    fontWeight: "600"
                  }}
                >
                  {pet.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <Pressable
          onPress={onLike}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: mobileTheme.spacing.sm,
            paddingVertical: mobileTheme.spacing.sm
          }}
        >
          <Heart
            size={18}
            color={
              post.likedByMe
                ? theme.colors.primary
                : theme.colors.muted
            }
            fill={post.likedByMe ? theme.colors.primary : "transparent"}
          />
          <Text
            style={{
              color: post.likedByMe
                ? theme.colors.primary
                : theme.colors.muted,
              fontWeight: "600",
              fontSize: mobileTheme.typography.caption.fontSize,
              fontFamily: "Inter_600SemiBold"
            }}
          >
            {post.likeCount}
          </Text>
        </Pressable>

        <Pressable
          onPress={onReport}
          hitSlop={8}
          style={{
            paddingVertical: mobileTheme.spacing.sm,
            marginLeft: "auto"
          }}
        >
          <Flag size={16} color={theme.colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}
