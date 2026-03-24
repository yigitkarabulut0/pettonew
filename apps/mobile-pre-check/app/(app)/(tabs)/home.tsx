import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
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
import { styles } from "@/lib/styles";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const localStyles = StyleSheet.create({
  composerTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 20,
    backgroundColor: mobileTheme.colors.surface
  },
  composerTriggerButton: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 18,
    paddingVertical: 16
  },
  composerTriggerText: {
    color: mobileTheme.colors.muted,
    fontSize: 16,
    fontFamily: mobileTheme.fontFamily
  },
  feedContainer: {
    gap: 14
  },
  postCard: {
    gap: 14,
    padding: 18,
    borderRadius: 20,
    backgroundColor: mobileTheme.colors.surface
  },
  postHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16
  },
  postHeaderLeft: {
    flexDirection: "row",
    gap: 12,
    flex: 1
  },
  postHeaderInfo: {
    flex: 1
  },
  authorName: {
    color: mobileTheme.colors.ink,
    fontSize: 17,
    fontWeight: "600",
    fontFamily: mobileTheme.fontFamily
  },
  authorCity: {
    color: mobileTheme.colors.secondary,
    fontWeight: "700",
    fontFamily: mobileTheme.fontFamily
  },
  postDate: {
    color: mobileTheme.colors.muted,
    fontFamily: mobileTheme.fontFamily
  },
  postBody: {
    color: mobileTheme.colors.ink,
    lineHeight: 24,
    fontSize: 16,
    fontFamily: mobileTheme.fontFamily
  },
  postImage: {
    width: "100%",
    height: 280,
    borderRadius: 20
  },
  taggedPetsSection: {
    gap: 10
  },
  taggedPetsLabel: {
    color: mobileTheme.colors.secondary,
    fontWeight: "800",
    fontFamily: mobileTheme.fontFamily
  },
  likeButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  likeButtonLiked: {
    backgroundColor: mobileTheme.colors.primarySoft
  },
  likeText: {
    color: mobileTheme.colors.secondary,
    fontWeight: "800",
    fontFamily: mobileTheme.fontFamily
  },
  emptyState: {
    gap: 8,
    padding: 22,
    borderRadius: 20,
    backgroundColor: mobileTheme.colors.surface,
    alignItems: "center",
    paddingTop: 40
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: mobileTheme.colors.ink,
    fontFamily: mobileTheme.fontFamily,
    marginTop: 12
  },
  emptyStateDescription: {
    color: mobileTheme.colors.muted,
    lineHeight: 22,
    fontFamily: mobileTheme.fontFamily,
    textAlign: "center"
  },
  composerCard: {
    gap: 14,
    padding: 18,
    borderRadius: 20,
    backgroundColor: mobileTheme.colors.surface
  },
  composerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  composerHeaderInfo: {
    flex: 1
  },
  composerAuthorName: {
    color: mobileTheme.colors.ink,
    fontSize: 20,
    fontWeight: "800",
    fontFamily: mobileTheme.fontFamily
  },
  composerAuthorCity: {
    color: mobileTheme.colors.secondary,
    fontWeight: "700",
    fontFamily: mobileTheme.fontFamily
  },
  composerInput: {
    borderRadius: mobileTheme.radius.md,
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 150,
    color: mobileTheme.colors.ink,
    textAlignVertical: "top",
    fontFamily: mobileTheme.fontFamily
  },
  composerTaggedSection: {
    gap: 10
  },
  composerTaggedLabel: {
    color: mobileTheme.colors.secondary,
    fontWeight: "800",
    fontFamily: mobileTheme.fontFamily
  },
  composerTaggedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  composerActionsRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  composerImagePreview: {
    width: "100%",
    height: 240,
    borderRadius: 24
  },
  composerButtonsRow: {
    flexDirection: "row",
    gap: 10
  },
  composerButtonFlex: {
    flex: 1
  },
  petPickerCard: {
    gap: 14,
    padding: 18,
    borderRadius: 20,
    backgroundColor: mobileTheme.colors.surface
  },
  petPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  petPickerTitle: {
    color: mobileTheme.colors.ink,
    fontSize: 20,
    fontWeight: "800",
    fontFamily: mobileTheme.fontFamily
  },
  petPickerScroll: {
    gap: 12
  },
  petPickerItem: {
    gap: 10
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarContainerSmall: {
    width: 44,
    height: 44
  },
  avatarImage: {
    width: "100%",
    height: "100%"
  }
});

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
      title="Your feed"
      subtitle="See what your pet community is sharing."
    >
      <View style={localStyles.composerTrigger}>
        <Avatar uri={session?.user.avatarUrl} name={session?.user.firstName} />
        <Pressable
          onPress={() => setComposerOpen(true)}
          style={localStyles.composerTriggerButton}
        >
          <Text style={localStyles.composerTriggerText}>
            Write something...
          </Text>
        </Pressable>
      </View>

      <View style={localStyles.feedContainer}>
        {posts.length ? (
          posts.map((post) => (
            <View key={post.id} style={localStyles.postCard}>
              <View style={localStyles.postHeader}>
                <View style={localStyles.postHeaderLeft}>
                  <Avatar
                    uri={post.author.avatarUrl}
                    name={post.author.firstName}
                    small
                  />
                  <View style={localStyles.postHeaderInfo}>
                    <Text style={localStyles.authorName}>
                      {post.author.firstName} {post.author.lastName}
                    </Text>
                    <Text style={localStyles.authorCity}>
                      {post.author.cityLabel}
                    </Text>
                  </View>
                </View>
                <Text style={localStyles.postDate}>
                  {new Date(post.createdAt).toLocaleDateString("en-GB")}
                </Text>
              </View>

              {post.body ? (
                <Text style={localStyles.postBody}>{post.body}</Text>
              ) : null}

              {post.imageUrl ? (
                <Image
                  source={{ uri: post.imageUrl }}
                  style={localStyles.postImage}
                  resizeMode="cover"
                />
              ) : null}

              {post.taggedPets.length ? (
                <View style={localStyles.taggedPetsSection}>
                  <Text style={localStyles.taggedPetsLabel}>Tagged pets</Text>
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
                style={[
                  localStyles.likeButton,
                  post.likedByMe && localStyles.likeButtonLiked
                ]}
              >
                <Ionicons
                  name={post.likedByMe ? "heart" : "heart-outline"}
                  size={18}
                  color={mobileTheme.colors.secondary}
                />
                <Text style={localStyles.likeText}>{post.likeCount}</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <View style={localStyles.emptyState}>
            <Ionicons
              name="document-text-outline"
              size={48}
              color={mobileTheme.colors.muted}
            />
            <Text style={localStyles.emptyStateTitle}>No posts yet</Text>
            <Text style={localStyles.emptyStateDescription}>
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
          <View style={localStyles.composerCard}>
            <View style={localStyles.composerHeaderRow}>
              <Avatar
                uri={session?.user.avatarUrl}
                name={session?.user.firstName}
              />
              <View style={localStyles.composerHeaderInfo}>
                <Text style={localStyles.composerAuthorName}>
                  {session?.user.firstName} {session?.user.lastName}
                </Text>
                <Text style={localStyles.composerAuthorCity}>
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
              style={localStyles.composerInput}
            />

            <View style={localStyles.composerTaggedSection}>
              <Text style={localStyles.composerTaggedLabel}>Tagged pets</Text>
              <View style={localStyles.composerTaggedRow}>
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

            <View style={localStyles.composerActionsRow}>
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
                style={localStyles.composerImagePreview}
                resizeMode="cover"
              />
            ) : null}

            {errorMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : null}

            <View style={localStyles.composerButtonsRow}>
              <View style={localStyles.composerButtonFlex}>
                <PrimaryButton
                  label="Cancel"
                  variant="ghost"
                  onPress={() => setComposerOpen(false)}
                />
              </View>
              <View style={localStyles.composerButtonFlex}>
                <PrimaryButton
                  label={createMutation.isPending ? "Posting..." : "Share post"}
                  onPress={() => createMutation.mutate()}
                  disabled={createMutation.isPending}
                />
              </View>
            </View>
          </View>

          {petPickerOpen ? (
            <View style={localStyles.petPickerCard}>
              <View style={localStyles.petPickerHeader}>
                <Text style={localStyles.petPickerTitle}>
                  Select pets to tag
                </Text>
                <PrimaryButton
                  label="Done"
                  variant="ghost"
                  onPress={() => setPetPickerOpen(false)}
                />
              </View>
              <ScrollView contentContainerStyle={localStyles.petPickerScroll}>
                {pets.map((pet) => {
                  const selected = taggedPetIds.includes(pet.id);
                  return (
                    <View key={pet.id} style={localStyles.petPickerItem}>
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
  small = false
}: {
  uri?: string | null;
  name?: string;
  small?: boolean;
}) {
  return (
    <View
      style={[
        localStyles.avatarContainer,
        small && localStyles.avatarContainerSmall
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={localStyles.avatarImage}
          resizeMode="cover"
        />
      ) : (
        <Ionicons
          name="person"
          size={small ? 22 : 28}
          color={mobileTheme.colors.secondary}
        />
      )}
    </View>
  );
}
