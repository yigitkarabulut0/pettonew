import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";

import { CompactPetCard, PetDetailModal } from "@/components/pet-card";
import { PrimaryButton } from "@/components/primary-button";
import { ScreenShell } from "@/components/screen-shell";
import {
  createHomePost,
  listHomeFeed,
  listMyPets,
  toggleHomePostLike,
  uploadMedia
} from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function HomePage() {
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();
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

  const { data: posts = [] } = useQuery({
    queryKey: ["home-feed", session?.tokens.accessToken],
    queryFn: () => listHomeFeed(session!.tokens.accessToken),
    enabled: Boolean(session)
  });
  const { data: pets = [] } = useQuery({
    queryKey: ["home-my-pets", session?.tokens.accessToken],
    queryFn: () => listMyPets(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  const taggedPets = pets.filter((pet) => taggedPetIds.includes(pet.id));
  const selectedPet =
    taggedPets.find((pet) => pet.id === selectedPetId) ??
    posts
      .flatMap((post) => post.taggedPets)
      .find((pet) => pet.id === selectedPetId) ??
    null;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!session) {
        throw new Error("No session found.");
      }

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
        taggedPetIds
      });
    },
    onSuccess: () => {
      setBody("");
      setImageAsset(null);
      setTaggedPetIds([]);
      setErrorMessage(null);
      setComposerOpen(false);
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
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["home-feed", session?.tokens.accessToken]
      });
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    }
  });

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.8
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    if (!asset) {
      return;
    }

    setImageAsset({
      uri: asset.uri,
      mimeType: asset.mimeType
    });
  };

  return (
    <ScreenShell
      eyebrow="Home"
      title="The social side of your pet world."
      subtitle="Quick thoughts, photos, tagged pets, and a simple feed with likes."
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          padding: 18,
          borderRadius: 30,
          backgroundColor: mobileTheme.colors.surface
        }}
      >
        <Avatar uri={session?.user.avatarUrl} name={session?.user.firstName} />
        <Pressable
          onPress={() => setComposerOpen(true)}
          style={{
            flex: 1,
            borderRadius: 999,
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: mobileTheme.colors.border,
            paddingHorizontal: 18,
            paddingVertical: 16
          }}
        >
          <Text
            selectable
            style={{ color: mobileTheme.colors.muted, fontSize: 16 }}
          >
            Write something...
          </Text>
        </Pressable>
      </View>

      <View style={{ gap: 14 }}>
        {posts.length ? (
          posts.map((post) => (
            <View
              key={post.id}
              style={{
                gap: 14,
                padding: 18,
                borderRadius: 30,
                backgroundColor: mobileTheme.colors.surface
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 16
                }}
              >
                <View style={{ flexDirection: "row", gap: 12, flex: 1 }}>
                  <Avatar
                    uri={post.author.avatarUrl}
                    name={post.author.firstName}
                    small
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      selectable
                      style={{
                        color: mobileTheme.colors.ink,
                        fontSize: 20,
                        fontWeight: "800"
                      }}
                    >
                      {post.author.firstName} {post.author.lastName}
                    </Text>
                    <Text
                      selectable
                      style={{
                        color: mobileTheme.colors.secondary,
                        fontWeight: "700"
                      }}
                    >
                      {post.author.cityLabel}
                    </Text>
                  </View>
                </View>
                <Text selectable style={{ color: mobileTheme.colors.muted }}>
                  {new Date(post.createdAt).toLocaleDateString("en-GB")}
                </Text>
              </View>

              {post.body ? (
                <Text
                  selectable
                  style={{
                    color: mobileTheme.colors.ink,
                    lineHeight: 24,
                    fontSize: 16
                  }}
                >
                  {post.body}
                </Text>
              ) : null}

              {post.imageUrl ? (
                <Image
                  source={{ uri: post.imageUrl }}
                  style={{ width: "100%", height: 280, borderRadius: 26 }}
                  resizeMode="cover"
                />
              ) : null}

              {post.taggedPets.length ? (
                <View style={{ gap: 10 }}>
                  <Text
                    selectable
                    style={{
                      color: mobileTheme.colors.secondary,
                      fontWeight: "800"
                    }}
                  >
                    Tagged pets
                  </Text>
                  {post.taggedPets.map((pet) => (
                    <CompactPetCard
                      key={pet.id}
                      pet={pet}
                      onPress={() => setSelectedPetId(pet.id)}
                    />
                  ))}
                </View>
              ) : null}

              <Pressable
                onPress={() => likeMutation.mutate(post.id)}
                style={{
                  alignSelf: "flex-start",
                  borderRadius: 999,
                  backgroundColor: post.likedByMe
                    ? mobileTheme.colors.primarySoft
                    : "#FFFFFF",
                  borderWidth: 1,
                  borderColor: mobileTheme.colors.border,
                  paddingHorizontal: 16,
                  paddingVertical: 10
                }}
              >
                <Text
                  selectable
                  style={{
                    color: mobileTheme.colors.secondary,
                    fontWeight: "800"
                  }}
                >
                  {post.likedByMe ? "Liked" : "Like"} • {post.likeCount}
                </Text>
              </Pressable>
            </View>
          ))
        ) : (
          <View
            style={{
              gap: 8,
              padding: 22,
              borderRadius: 28,
              backgroundColor: mobileTheme.colors.surface
            }}
          >
            <Text
              selectable
              style={{
                fontSize: 22,
                fontWeight: "800",
                color: mobileTheme.colors.ink
              }}
            >
              No posts yet
            </Text>
            <Text
              selectable
              style={{ color: mobileTheme.colors.muted, lineHeight: 22 }}
            >
              Share the first post from your pet world and it will appear here
              immediately.
            </Text>
          </View>
        )}
      </View>

      <Modal
        visible={composerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <ScreenShell
          eyebrow="Create Post"
          title="Share a moment"
          subtitle="Write something, add a photo, and tag one or more pets."
        >
          <View
            style={{
              gap: 14,
              padding: 18,
              borderRadius: 28,
              backgroundColor: mobileTheme.colors.surface
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
            >
              <Avatar
                uri={session?.user.avatarUrl}
                name={session?.user.firstName}
              />
              <View style={{ flex: 1 }}>
                <Text
                  selectable
                  style={{
                    color: mobileTheme.colors.ink,
                    fontSize: 20,
                    fontWeight: "800"
                  }}
                >
                  {session?.user.firstName} {session?.user.lastName}
                </Text>
                <Text
                  selectable
                  style={{
                    color: mobileTheme.colors.secondary,
                    fontWeight: "700"
                  }}
                >
                  {session?.user.cityLabel || "No location"}
                </Text>
              </View>
            </View>

            <TextInput
              value={body}
              onChangeText={(value) => {
                setBody(value);
                setErrorMessage(null);
              }}
              placeholder="Write something..."
              placeholderTextColor={mobileTheme.colors.muted}
              multiline
              style={{
                borderRadius: mobileTheme.radius.md,
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor: mobileTheme.colors.border,
                paddingHorizontal: 16,
                paddingVertical: 16,
                minHeight: 150,
                color: mobileTheme.colors.ink,
                textAlignVertical: "top"
              }}
            />

            <View style={{ gap: 10 }}>
              <Text
                selectable
                style={{
                  color: mobileTheme.colors.secondary,
                  fontWeight: "800"
                }}
              >
                Tagged pets
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {taggedPets.map((pet) => (
                  <PrimaryButton
                    key={pet.id}
                    label={pet.name}
                    variant="secondary"
                    onPress={() =>
                      setTaggedPetIds((current) =>
                        current.filter((entry) => entry !== pet.id)
                      )
                    }
                  />
                ))}
                <PrimaryButton
                  label="+ Tag pet"
                  variant="ghost"
                  onPress={() => setPetPickerOpen(true)}
                />
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              <PrimaryButton
                label={imageAsset ? "Change photo" : "Add photo"}
                variant="ghost"
                onPress={() => void pickImage()}
              />
              {imageAsset ? (
                <PrimaryButton
                  label="Remove photo"
                  variant="ghost"
                  onPress={() => setImageAsset(null)}
                />
              ) : null}
            </View>

            {imageAsset ? (
              <Image
                source={{ uri: imageAsset.uri }}
                style={{ width: "100%", height: 240, borderRadius: 24 }}
                resizeMode="cover"
              />
            ) : null}

            {errorMessage ? (
              <Text
                selectable
                style={{ color: mobileTheme.colors.danger, fontWeight: "700" }}
              >
                {errorMessage}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label="Cancel"
                  variant="ghost"
                  onPress={() => setComposerOpen(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label={createMutation.isPending ? "Posting..." : "Share post"}
                  onPress={() => createMutation.mutate()}
                  disabled={createMutation.isPending}
                />
              </View>
            </View>
          </View>

          {petPickerOpen ? (
            <View
              style={{
                gap: 14,
                padding: 18,
                borderRadius: 28,
                backgroundColor: mobileTheme.colors.surface
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <Text
                  selectable
                  style={{
                    color: mobileTheme.colors.ink,
                    fontSize: 20,
                    fontWeight: "800"
                  }}
                >
                  Select pets to tag
                </Text>
                <PrimaryButton
                  label="Done"
                  variant="ghost"
                  onPress={() => setPetPickerOpen(false)}
                />
              </View>
              <ScrollView contentContainerStyle={{ gap: 12 }}>
                {pets.map((pet) => {
                  const selected = taggedPetIds.includes(pet.id);
                  return (
                    <View key={pet.id} style={{ gap: 10 }}>
                      <CompactPetCard
                        pet={pet}
                        onPress={() => setSelectedPetId(pet.id)}
                      />
                      <PrimaryButton
                        label={selected ? "Tagged" : "Tag this pet"}
                        variant={selected ? "secondary" : "ghost"}
                        onPress={() =>
                          setTaggedPetIds((current) =>
                            current.includes(pet.id)
                              ? current.filter((entry) => entry !== pet.id)
                              : [...current, pet.id]
                          )
                        }
                      />
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <PetDetailModal
            pet={selectedPet}
            visible={Boolean(selectedPet)}
            onClose={() => setSelectedPetId(null)}
          />
        </ScreenShell>
      </Modal>
    </ScreenShell>
  );
}

function Avatar({
  uri,
  name,
  small = false
}: {
  uri?: string | null;
  name?: string;
  small?: boolean;
}) {
  const size = small ? 44 : 56;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        overflow: "hidden",
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: mobileTheme.colors.border,
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      ) : (
        <Text
          selectable
          style={{ color: mobileTheme.colors.secondary, fontWeight: "800" }}
        >
          {(name || "P").slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}
