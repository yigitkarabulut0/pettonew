import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type ViewToken
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Heart,
  Home,
  Mail,
  MapPin,
  PawPrint,
  Phone,
  Plus,
  X
} from "lucide-react-native";

import { LottieLoading } from "@/components/lottie-loading";
import { PrimaryButton } from "@/components/primary-button";
import {
  listAdoptions,
  createAdoption,
  listTaxonomies,
  uploadMedia
} from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TUTORIAL_KEY = "adoption_tutorial_seen";

/* ------------------------------------------------------------------ */
/*  Tutorial                                                          */
/* ------------------------------------------------------------------ */

interface TutorialPage {
  id: string;
  icon: "heart" | "paw" | "home";
  title: string;
  description: string;
}

const TUTORIAL_PAGES: TutorialPage[] = [
  {
    id: "find",
    icon: "heart",
    title: "Find Your New Best Friend",
    description:
      "Thousands of pets are waiting for their forever home. Browse profiles, fall in love, and give a pet the life they deserve."
  },
  {
    id: "every",
    icon: "paw",
    title: "Every Pet Deserves a Home",
    description:
      "Shelters and pet parents list animals looking for loving families. Each profile includes photos, personality traits, and contact info."
  },
  {
    id: "ready",
    icon: "home",
    title: "Ready to Adopt?",
    description:
      "Browse available pets, connect with their current caregivers, and start your adoption journey today."
  }
];

function AdoptionTutorial({ onComplete }: { onComplete: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const icons: Record<string, React.ReactNode> = {
    heart: <Heart size={40} color="#FFFFFF" fill="#FFFFFF" />,
    paw: <PawPrint size={40} color="#FFFFFF" />,
    home: <Home size={40} color="#FFFFFF" />
  };

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50
  }).current;

  const isLastPage = activeIndex === TUTORIAL_PAGES.length - 1;

  const handleNext = () => {
    if (isLastPage) {
      onComplete();
    } else {
      flatListRef.current?.scrollToIndex({
        index: activeIndex + 1,
        animated: true
      });
    }
  };

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.colors.white,
        zIndex: 100
      }}
    >
      {/* Skip */}
      <Pressable
        onPress={onComplete}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={{
          position: "absolute",
          top: insets.top + 16,
          right: 20,
          zIndex: 10,
          paddingHorizontal: mobileTheme.spacing.md,
          paddingVertical: mobileTheme.spacing.sm,
          minWidth: 44,
          minHeight: 44,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Text
          style={{
            fontSize: mobileTheme.typography.body.fontSize,
            color: theme.colors.muted,
            fontWeight: "600"
          }}
        >
          Skip
        </Text>
      </Pressable>

      {/* Pages */}
      <FlatList
        ref={flatListRef}
        data={TUTORIAL_PAGES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={{
              width: SCREEN_WIDTH,
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: mobileTheme.spacing["3xl"],
              gap: mobileTheme.spacing["2xl"]
            }}
          >
            {/* Icon circle */}
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: theme.colors.primary,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {icons[item.icon]}
            </View>

            <Text
              style={{
                fontSize: 28,
                fontWeight: "700",
                color: theme.colors.ink,
                textAlign: "center"
              }}
            >
              {item.title}
            </Text>

            <Text
              style={{
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.muted,
                textAlign: "center",
                lineHeight: 24,
                maxWidth: 300
              }}
            >
              {item.description}
            </Text>
          </View>
        )}
      />

      {/* Bottom area */}
      <View
        style={{
          paddingBottom: insets.bottom + 80,
          paddingHorizontal: mobileTheme.spacing["3xl"],
          gap: mobileTheme.spacing.xl,
          alignItems: "center"
        }}
      >
        {/* Dots */}
        <View style={{ flexDirection: "row", gap: mobileTheme.spacing.sm }}>
          {TUTORIAL_PAGES.map((page, index) => (
            <View
              key={page.id}
              style={{
                width: index === activeIndex ? 24 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor:
                  index === activeIndex
                    ? theme.colors.primary
                    : theme.colors.border
              }}
            />
          ))}
        </View>

        <PrimaryButton
          label={isLastPage ? "Browse Pets" : "Next"}
          onPress={handleNext}
        />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail Modal                                                      */
/* ------------------------------------------------------------------ */

interface DetailModalProps {
  visible: boolean;
  listing: AdoptionItem | null;
  onClose: () => void;
  theme: ReturnType<typeof useTheme>;
  insets: ReturnType<typeof useSafeAreaInsets>;
}

type AdoptionItem = {
  id: string;
  petName: string;
  petAge: number;
  petSpecies: string;
  petBreed: string;
  gender: string;
  description: string;
  contactPhone: string;
  contactEmail: string;
  location: string;
  photos: { id: string; url: string; isPrimary: boolean }[];
  characterTraits: string[];
  isNeutered: boolean;
  activityLevel: number;
  imageUrl?: string;
  status: "active" | "adopted";
  userId: string;
  userName?: string;
  createdAt: string;
};

const TRAIT_COLORS = [
  "#E6694A",
  "#3F7D4E",
  "#5BA89A",
  "#F7B267",
  "#A14632",
  "#6C5CE7",
  "#00B894",
  "#FD79A8"
];

function DetailModal({
  visible,
  listing,
  onClose,
  theme,
  insets
}: DetailModalProps) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const photoListRef = useRef<FlatList>(null);

  const onPhotoViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setPhotoIndex(viewableItems[0].index);
      }
    },
    []
  );

  const photoViewConfig = useRef({
    viewAreaCoveragePercentThreshold: 50
  }).current;

  useEffect(() => {
    if (visible) setPhotoIndex(0);
  }, [visible]);

  if (!listing) return null;

  const safePhotos = listing.photos ?? [];
  const allPhotos =
    safePhotos.length > 0
      ? safePhotos
      : listing.imageUrl
        ? [{ id: "main", url: listing.imageUrl, isPrimary: true }]
        : [];

  const ageLabel =
    listing.petAge === 1 ? "1 yr" : `${listing.petAge} yrs`;

  const handleCall = () => {
    if (!listing.contactPhone) return;
    Linking.openURL(`tel:${listing.contactPhone}`);
  };

  const handleEmail = () => {
    if (!listing.contactEmail) return;
    Linking.openURL(`mailto:${listing.contactEmail}?subject=Adoption Inquiry: ${listing.petName}`);
  };

  const handleContact = () => {
    // Open in-app conversation with the listing owner
    onClose();
    router.push(`/(app)/conversations`);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Photo gallery */}
          {allPhotos.length > 0 ? (
            <View>
              <FlatList
                ref={photoListRef}
                data={allPhotos}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onViewableItemsChanged={onPhotoViewableItemsChanged}
                viewabilityConfig={photoViewConfig}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Image
                    source={{ uri: item.url }}
                    style={{ width: SCREEN_WIDTH, height: 280 }}
                    resizeMode="cover"
                  />
                )}
              />
              {/* Photo dots */}
              {allPhotos.length > 1 && (
                <View
                  style={{
                    position: "absolute",
                    bottom: 12,
                    left: 0,
                    right: 0,
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 6
                  }}
                >
                  {allPhotos.map((_, idx) => (
                    <View
                      key={idx}
                      style={{
                        width: idx === photoIndex ? 20 : 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor:
                          idx === photoIndex
                            ? "#FFFFFF"
                            : "rgba(255,255,255,0.5)"
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View
              style={{
                width: SCREEN_WIDTH,
                height: 280,
                backgroundColor: theme.colors.primaryBg,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <PawPrint size={64} color={theme.colors.primary} />
            </View>
          )}

          {/* Close button */}
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={{
              position: "absolute",
              top: insets.top + 12,
              left: 16,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(0,0,0,0.45)",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10
            }}
          >
            <X size={18} color="#FFFFFF" />
          </Pressable>

          {/* Info */}
          <View
            style={{
              backgroundColor: theme.colors.white,
              borderTopLeftRadius: mobileTheme.radius.xl,
              borderTopRightRadius: mobileTheme.radius.xl,
              marginTop: -24,
              padding: mobileTheme.spacing.xl,
              gap: mobileTheme.spacing.lg
            }}
          >
            {/* Name + Age */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between"
              }}
            >
              <Text
                style={{
                  fontSize: mobileTheme.typography.heading.fontSize,
                  fontWeight: mobileTheme.typography.heading.fontWeight,
                  color: theme.colors.ink
                }}
              >
                {listing.petName}
              </Text>
              <View
                style={{
                  backgroundColor: theme.colors.primaryBg,
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  borderRadius: mobileTheme.radius.pill
                }}
              >
                <Text
                  style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    fontWeight: "600",
                    color: theme.colors.primary
                  }}
                >
                  {ageLabel}
                </Text>
              </View>
            </View>

            {/* Species / Breed */}
            <Text
              style={{
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.muted
              }}
            >
              {listing.petSpecies}
              {listing.petBreed ? ` \u00B7 ${listing.petBreed}` : ""}
            </Text>

            {/* Gender + Neutered */}
            <View style={{ flexDirection: "row", gap: mobileTheme.spacing.sm }}>
              <View
                style={{
                  backgroundColor:
                    listing.gender === "Female"
                      ? "rgba(253,121,168,0.12)"
                      : "rgba(56,103,214,0.12)",
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: mobileTheme.radius.pill
                }}
              >
                <Text
                  style={{
                    fontSize: mobileTheme.typography.micro.fontSize,
                    fontWeight: "600",
                    color:
                      listing.gender === "Female" ? "#FD79A8" : "#3867D6"
                  }}
                >
                  {listing.gender}
                </Text>
              </View>
              {listing.isNeutered && (
                <View
                  style={{
                    backgroundColor: theme.colors.successBg,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: mobileTheme.radius.pill
                  }}
                >
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.micro.fontSize,
                      fontWeight: "600",
                      color: theme.colors.success
                    }}
                  >
                    Neutered
                  </Text>
                </View>
              )}
            </View>

            {/* Character traits */}
            {(listing.characterTraits ?? []).length > 0 && (
              <View>
                <Text
                  style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    fontWeight: "600",
                    color: theme.colors.ink,
                    marginBottom: mobileTheme.spacing.sm
                  }}
                >
                  Personality
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: mobileTheme.spacing.sm
                  }}
                >
                  {(listing.characterTraits ?? []).map((trait, idx) => {
                    const chipColor =
                      TRAIT_COLORS[idx % TRAIT_COLORS.length];
                    return (
                      <View
                        key={trait}
                        style={{
                          backgroundColor: `${chipColor}15`,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: mobileTheme.radius.pill
                        }}
                      >
                        <Text
                          style={{
                            fontSize: mobileTheme.typography.micro.fontSize,
                            fontWeight: "600",
                            color: chipColor
                          }}
                        >
                          {trait}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Activity level */}
            {listing.activityLevel > 0 && (
              <View>
                <Text
                  style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    fontWeight: "600",
                    color: theme.colors.ink,
                    marginBottom: mobileTheme.spacing.sm
                  }}
                >
                  Activity Level
                </Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((level) => (
                    <View
                      key={level}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor:
                          level <= listing.activityLevel
                            ? theme.colors.primary
                            : theme.colors.border
                      }}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Description */}
            <View>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  fontWeight: "600",
                  color: theme.colors.ink,
                  marginBottom: mobileTheme.spacing.sm
                }}
              >
                About
              </Text>
              <Text
                style={{
                  fontSize: mobileTheme.typography.body.fontSize,
                  lineHeight: mobileTheme.typography.body.lineHeight,
                  color: theme.colors.muted
                }}
              >
                {listing.description ||
                  "Looking for a loving home \uD83C\uDFE1"}
              </Text>
            </View>

            {/* Location */}
            {listing.location ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6
                }}
              >
                <MapPin size={14} color={theme.colors.muted} />
                <Text
                  style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    color: theme.colors.muted
                  }}
                >
                  {listing.location}
                </Text>
              </View>
            ) : null}

            {/* Contact buttons */}
            <View
              style={{
                gap: mobileTheme.spacing.md,
                marginTop: mobileTheme.spacing.md
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  gap: mobileTheme.spacing.md
                }}
              >
                {listing.contactPhone ? (
                  <Pressable
                    onPress={handleCall}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      paddingVertical: 12,
                      borderRadius: mobileTheme.radius.md,
                      backgroundColor: theme.colors.successBg,
                      borderWidth: 1,
                      borderColor: theme.colors.success
                    }}
                  >
                    <Phone size={16} color={theme.colors.success} />
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.caption.fontSize,
                        fontWeight: "600",
                        color: theme.colors.success
                      }}
                    >
                      Call
                    </Text>
                  </Pressable>
                ) : null}
                {listing.contactEmail ? (
                  <Pressable
                    onPress={handleEmail}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      paddingVertical: 12,
                      borderRadius: mobileTheme.radius.md,
                      backgroundColor: theme.colors.secondarySoft,
                      borderWidth: 1,
                      borderColor: theme.colors.secondary
                    }}
                  >
                    <Mail size={16} color={theme.colors.secondary} />
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.caption.fontSize,
                        fontWeight: "600",
                        color: theme.colors.secondary
                      }}
                    >
                      Email
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <PrimaryButton
                label="Message to Adopt"
                onPress={handleContact}
              />
            </View>

            {/* Listed by */}
            {listing.userName ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: mobileTheme.spacing.sm,
                  paddingTop: mobileTheme.spacing.md,
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border
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
                      fontSize: mobileTheme.typography.micro.fontSize,
                      fontWeight: "700",
                      color: theme.colors.primary
                    }}
                  >
                    {listing.userName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    color: theme.colors.muted
                  }}
                >
                  Listed by {listing.userName}
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                         */
/* ------------------------------------------------------------------ */

export default function AdoptionPage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();
  const token = session?.tokens.accessToken ?? "";

  /* --- tutorial state --- */
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialChecked, setTutorialChecked] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_KEY).then((val) => {
      if (val !== "true") {
        setShowTutorial(true);
      }
      setTutorialChecked(true);
    });
  }, []);

  const dismissTutorial = useCallback(() => {
    setShowTutorial(false);
    AsyncStorage.setItem(TUTORIAL_KEY, "true");
  }, []);

  /* --- composer state --- */
  const [composerOpen, setComposerOpen] = useState(false);
  const [petName, setPetName] = useState("");
  const [petAge, setPetAge] = useState("");
  const [selectedSpeciesId, setSelectedSpeciesId] = useState("");
  const [selectedSpeciesLabel, setSelectedSpeciesLabel] = useState("");
  const [selectedBreedId, setSelectedBreedId] = useState("");
  const [selectedBreedLabel, setSelectedBreedLabel] = useState("");
  const [gender, setGender] = useState<"Male" | "Female">("Male");
  const [description, setDescription] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [location, setLocation] = useState("");
  const [photos, setPhotos] = useState<
    { uri: string; fileName: string }[]
  >([]);

  /* --- detail modal --- */
  const [selectedListing, setSelectedListing] = useState<AdoptionItem | null>(
    null
  );

  /* --- queries --- */
  const adoptionsQuery = useQuery({
    queryKey: ["adoptions"],
    queryFn: () => listAdoptions(token),
    enabled: Boolean(token)
  });

  const speciesQuery = useQuery({
    queryKey: ["taxonomies", "species"],
    queryFn: () => listTaxonomies(token, "species"),
    enabled: Boolean(token)
  });

  const breedsQuery = useQuery({
    queryKey: ["taxonomies", "breeds"],
    queryFn: () => listTaxonomies(token, "breeds"),
    enabled: Boolean(token)
  });

  const allBreeds = breedsQuery.data ?? [];
  const filteredBreeds = useMemo(() => {
    if (!selectedSpeciesId) return allBreeds;
    return allBreeds.filter(
      (b: any) =>
        b.parentId === selectedSpeciesId ||
        b.speciesId === selectedSpeciesId
    );
  }, [allBreeds, selectedSpeciesId]);

  /* --- create mutation --- */
  const createMutation = useMutation({
    mutationFn: async () => {
      let uploadedPhotos: { id: string; url: string; isPrimary: boolean }[] =
        [];

      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        const asset = await uploadMedia(
          token,
          p.uri,
          p.fileName || `adoption-${i}.jpg`
        );
        uploadedPhotos.push({
          id: asset.id,
          url: asset.url,
          isPrimary: i === 0
        });
      }

      return createAdoption(token, {
        petName: petName.trim(),
        petAge: parseInt(petAge, 10) || 0,
        petSpecies: selectedSpeciesLabel || "Unknown",
        petBreed: selectedBreedLabel || "",
        gender,
        description: description.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim(),
        location: location.trim(),
        photos: uploadedPhotos,
        characterTraits: [],
        isNeutered: false,
        activityLevel: 3,
        imageUrl: uploadedPhotos[0]?.url
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adoptions"] });
      resetComposer();
    }
  });

  const resetComposer = () => {
    setPetName("");
    setPetAge("");
    setSelectedSpeciesId("");
    setSelectedSpeciesLabel("");
    setSelectedBreedId("");
    setSelectedBreedLabel("");
    setGender("Male");
    setDescription("");
    setContactPhone("");
    setContactEmail("");
    setLocation("");
    setPhotos([]);
    setComposerOpen(false);
  };

  const pickPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 6 - photos.length,
      quality: 0.8
    });

    if (!result.canceled) {
      const newPhotos = result.assets.map((a) => ({
        uri: a.uri,
        fileName: a.fileName || `photo-${Date.now()}.jpg`
      }));
      setPhotos((prev) => [...prev, ...newPhotos].slice(0, 6));
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const onRefresh = useCallback(() => {
    adoptionsQuery.refetch();
  }, [adoptionsQuery]);

  const listings = (adoptionsQuery.data ?? []) as AdoptionItem[];

  const canSubmit =
    petName.trim().length > 0 &&
    petAge.trim().length > 0;

  /* --- render --- */
  if (!tutorialChecked) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <LottieLoading size={70} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Tutorial overlay */}
      {showTutorial && <AdoptionTutorial onComplete={dismissTutorial} />}

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
            Adopt a Pet
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
          paddingBottom: 100 + insets.bottom
        }}
        refreshControl={
          <RefreshControl
            refreshing={adoptionsQuery.isRefetching}
            onRefresh={onRefresh}
            tintColor="#F48C28"
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* Composer form */}
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
              List a Pet for Adoption
            </Text>

            {/* Pet Name */}
            <View style={{ gap: mobileTheme.spacing.xs }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted
                }}
              >
                Pet Name *
              </Text>
              <TextInput
                value={petName}
                onChangeText={setPetName}
                placeholder="e.g. Buddy"
                placeholderTextColor={theme.colors.muted}
                style={{
                  backgroundColor: theme.colors.background,
                  borderRadius: mobileTheme.radius.md,
                  padding: mobileTheme.spacing.lg,
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: theme.colors.ink
                }}
              />
            </View>

            {/* Age */}
            <View style={{ gap: mobileTheme.spacing.xs }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted
                }}
              >
                Age (years) *
              </Text>
              <TextInput
                value={petAge}
                onChangeText={setPetAge}
                placeholder="e.g. 2"
                placeholderTextColor={theme.colors.muted}
                keyboardType="number-pad"
                style={{
                  backgroundColor: theme.colors.background,
                  borderRadius: mobileTheme.radius.md,
                  padding: mobileTheme.spacing.lg,
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: theme.colors.ink
                }}
              />
            </View>

            {/* Species picker */}
            <View style={{ gap: mobileTheme.spacing.xs }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted
                }}
              >
                Species
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: mobileTheme.spacing.sm,
                  flexWrap: "wrap"
                }}
              >
                {(speciesQuery.data ?? []).map((s: any) => (
                  <Pressable
                    key={s.id}
                    onPress={() => {
                      setSelectedSpeciesId(s.id);
                      setSelectedSpeciesLabel(s.label);
                      setSelectedBreedId("");
                      setSelectedBreedLabel("");
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: mobileTheme.radius.pill,
                      backgroundColor:
                        selectedSpeciesId === s.id
                          ? theme.colors.primaryBg
                          : theme.colors.background,
                      borderWidth: 1,
                      borderColor:
                        selectedSpeciesId === s.id
                          ? theme.colors.primary
                          : theme.colors.border
                    }}
                  >
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.caption.fontSize,
                        fontWeight:
                          selectedSpeciesId === s.id ? "600" : "400",
                        color:
                          selectedSpeciesId === s.id
                            ? theme.colors.primary
                            : theme.colors.ink
                      }}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Breed picker */}
            {selectedSpeciesId && filteredBreeds.length > 0 && (
              <View style={{ gap: mobileTheme.spacing.xs }}>
                <Text
                  style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    color: theme.colors.muted
                  }}
                >
                  Breed
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{
                    gap: mobileTheme.spacing.sm,
                    paddingRight: mobileTheme.spacing.lg
                  }}
                >
                  {filteredBreeds.map((b: any) => (
                    <Pressable
                      key={b.id}
                      onPress={() => {
                        setSelectedBreedId(b.id);
                        setSelectedBreedLabel(b.label);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: mobileTheme.radius.pill,
                        backgroundColor:
                          selectedBreedId === b.id
                            ? theme.colors.primaryBg
                            : theme.colors.background,
                        borderWidth: 1,
                        borderColor:
                          selectedBreedId === b.id
                            ? theme.colors.primary
                            : theme.colors.border
                      }}
                    >
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.caption.fontSize,
                          fontWeight:
                            selectedBreedId === b.id ? "600" : "400",
                          color:
                            selectedBreedId === b.id
                              ? theme.colors.primary
                              : theme.colors.ink
                        }}
                      >
                        {b.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Gender toggle */}
            <View style={{ gap: mobileTheme.spacing.xs }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted
                }}
              >
                Gender
              </Text>
              <View style={{ flexDirection: "row", gap: mobileTheme.spacing.sm }}>
                {(["Male", "Female"] as const).map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => setGender(g)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: mobileTheme.radius.md,
                      backgroundColor:
                        gender === g
                          ? g === "Male"
                            ? "rgba(56,103,214,0.12)"
                            : "rgba(253,121,168,0.12)"
                          : theme.colors.background,
                      borderWidth: 1,
                      borderColor:
                        gender === g
                          ? g === "Male"
                            ? "#3867D6"
                            : "#FD79A8"
                          : theme.colors.border,
                      alignItems: "center"
                    }}
                  >
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.caption.fontSize,
                        fontWeight: gender === g ? "600" : "400",
                        color:
                          gender === g
                            ? g === "Male"
                              ? "#3867D6"
                              : "#FD79A8"
                            : theme.colors.ink
                      }}
                    >
                      {g}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Photo picker */}
            <View style={{ gap: mobileTheme.spacing.xs }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted
                }}
              >
                Photos (up to 6)
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: mobileTheme.spacing.sm
                }}
              >
                {photos.map((photo, idx) => (
                  <View key={idx} style={{ position: "relative" }}>
                    <Image
                      source={{ uri: photo.uri }}
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: mobileTheme.radius.sm
                      }}
                      resizeMode="cover"
                    />
                    <Pressable
                      onPress={() => removePhoto(idx)}
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -6,
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: theme.colors.danger,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <X size={12} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ))}
                {photos.length < 6 && (
                  <Pressable
                    onPress={pickPhotos}
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: mobileTheme.radius.sm,
                      borderWidth: 2,
                      borderStyle: "dashed",
                      borderColor: theme.colors.border,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <Plus size={24} color={theme.colors.muted} />
                  </Pressable>
                )}
              </View>
            </View>

            {/* Description */}
            <View style={{ gap: mobileTheme.spacing.xs }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted
                }}
              >
                Description
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Tell us about this pet..."
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
            </View>

            {/* Contact phone */}
            <View style={{ gap: mobileTheme.spacing.xs }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted
                }}
              >
                Contact Phone
              </Text>
              <TextInput
                value={contactPhone}
                onChangeText={setContactPhone}
                placeholder="+1 555 123 4567"
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
            </View>

            {/* Contact email */}
            <View style={{ gap: mobileTheme.spacing.xs }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted
                }}
              >
                Contact Email
              </Text>
              <TextInput
                value={contactEmail}
                onChangeText={setContactEmail}
                placeholder="hello@example.com"
                placeholderTextColor={theme.colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={{
                  backgroundColor: theme.colors.background,
                  borderRadius: mobileTheme.radius.md,
                  padding: mobileTheme.spacing.lg,
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: theme.colors.ink
                }}
              />
            </View>

            {/* Location */}
            <View style={{ gap: mobileTheme.spacing.xs }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted
                }}
              >
                Location / City
              </Text>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="e.g. San Francisco, CA"
                placeholderTextColor={theme.colors.muted}
                style={{
                  backgroundColor: theme.colors.background,
                  borderRadius: mobileTheme.radius.md,
                  padding: mobileTheme.spacing.lg,
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: theme.colors.ink
                }}
              />
            </View>

            {/* Submit */}
            <PrimaryButton
              label="List for Adoption"
              onPress={() => createMutation.mutate()}
              disabled={!canSubmit}
              loading={createMutation.isPending}
            />
          </View>
        )}

        {/* Loading */}
        {adoptionsQuery.isLoading && (
          <View
            style={{
              paddingVertical: mobileTheme.spacing["4xl"],
              alignItems: "center"
            }}
          >
            <LottieLoading size={70} />
          </View>
        )}

        {/* Empty state */}
        {!adoptionsQuery.isLoading && listings.length === 0 && (
          <View
            style={{
              paddingVertical: mobileTheme.spacing["4xl"],
              alignItems: "center",
              gap: mobileTheme.spacing.lg
            }}
          >
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: theme.colors.primaryBg,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <PawPrint size={36} color={theme.colors.primary} />
            </View>
            <Text
              style={{
                fontSize: mobileTheme.typography.subheading.fontSize,
                fontWeight: mobileTheme.typography.subheading.fontWeight,
                color: theme.colors.ink
              }}
            >
              No pets listed yet
            </Text>
            <Text
              style={{
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.muted,
                textAlign: "center",
                paddingHorizontal: mobileTheme.spacing["3xl"]
              }}
            >
              Be the first to list a pet for adoption. Tap the + button to get
              started.
            </Text>
          </View>
        )}

        {/* Pet cards */}
        {listings.map((listing) => {
          const primaryPhoto = (listing.photos ?? []).find((p) => p.isPrimary);
          const photoUrl =
            primaryPhoto?.url || listing.imageUrl || null;
          const ageLabel =
            listing.petAge === 1 ? "1 yr" : `${listing.petAge} yrs`;

          return (
            <Pressable
              key={listing.id}
              onPress={() => setSelectedListing(listing)}
              style={{
                backgroundColor: theme.colors.white,
                borderRadius: mobileTheme.radius.md,
                overflow: "hidden",
                marginBottom: mobileTheme.spacing.lg,
                ...mobileTheme.shadow.sm
              }}
            >
              {/* Photo */}
              {photoUrl ? (
                <Image
                  source={{ uri: photoUrl }}
                  style={{
                    width: "100%",
                    height: 200,
                    borderTopLeftRadius: mobileTheme.radius.md,
                    borderTopRightRadius: mobileTheme.radius.md
                  }}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={{
                    width: "100%",
                    height: 200,
                    borderTopLeftRadius: mobileTheme.radius.md,
                    borderTopRightRadius: mobileTheme.radius.md,
                    backgroundColor: theme.colors.primaryBg,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <PawPrint size={48} color={theme.colors.primary} />
                </View>
              )}

              {/* Info */}
              <View
                style={{
                  padding: mobileTheme.spacing.lg,
                  gap: mobileTheme.spacing.sm
                }}
              >
                {/* Name + Age */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "700",
                      color: theme.colors.ink
                    }}
                  >
                    {listing.petName}
                  </Text>
                  <View
                    style={{
                      backgroundColor: theme.colors.primaryBg,
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                      borderRadius: mobileTheme.radius.pill
                    }}
                  >
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.micro.fontSize,
                        fontWeight: "600",
                        color: theme.colors.primary
                      }}
                    >
                      {ageLabel}
                    </Text>
                  </View>
                </View>

                {/* Species / Breed */}
                <Text
                  style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    color: theme.colors.muted
                  }}
                >
                  {listing.petSpecies}
                  {listing.petBreed
                    ? ` \u00B7 ${listing.petBreed}`
                    : ""}
                </Text>

                {/* Gender + Neutered badges */}
                <View
                  style={{
                    flexDirection: "row",
                    gap: mobileTheme.spacing.sm
                  }}
                >
                  <View
                    style={{
                      backgroundColor:
                        listing.gender === "Female"
                          ? "rgba(253,121,168,0.12)"
                          : "rgba(56,103,214,0.12)",
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: mobileTheme.radius.pill
                    }}
                  >
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.micro.fontSize,
                        fontWeight: "600",
                        color:
                          listing.gender === "Female"
                            ? "#FD79A8"
                            : "#3867D6"
                      }}
                    >
                      {listing.gender}
                    </Text>
                  </View>
                  {listing.isNeutered && (
                    <View
                      style={{
                        backgroundColor: theme.colors.successBg,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: mobileTheme.radius.pill
                      }}
                    >
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.micro.fontSize,
                          fontWeight: "600",
                          color: theme.colors.success
                        }}
                      >
                        Neutered
                      </Text>
                    </View>
                  )}
                </View>

                {/* Description */}
                <Text
                  numberOfLines={2}
                  style={{
                    fontSize: mobileTheme.typography.body.fontSize,
                    lineHeight: mobileTheme.typography.body.lineHeight,
                    color: theme.colors.muted
                  }}
                >
                  {listing.description || (
                    <Text style={{ fontStyle: "italic" }}>
                      Looking for a loving home {"\uD83C\uDFE1"}
                    </Text>
                  )}
                </Text>

                {/* Location */}
                {listing.location ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6
                    }}
                  >
                    <MapPin size={14} color={theme.colors.muted} />
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.caption.fontSize,
                        color: theme.colors.muted
                      }}
                    >
                      {listing.location}
                    </Text>
                  </View>
                ) : null}

                {/* Contact button */}
                <View style={{ marginTop: mobileTheme.spacing.sm }}>
                  <PrimaryButton
                    label="Contact"
                    onPress={() => setSelectedListing(listing)}
                    size="sm"
                  />
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Detail modal */}
      <DetailModal
        visible={selectedListing !== null}
        listing={selectedListing}
        onClose={() => setSelectedListing(null)}
        theme={theme}
        insets={insets}
      />
    </KeyboardAvoidingView>
  );
}
