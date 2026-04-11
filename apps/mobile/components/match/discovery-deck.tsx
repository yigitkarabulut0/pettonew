import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  Text,
  View
} from "react-native";
import { Image } from "expo-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import {
  Check,
  Flag,
  Heart,
  ImageIcon,
  MapPin,
  Plus,
  Search,
  Star,
  X
} from "lucide-react-native";

import { PrimaryButton } from "@/components/primary-button";
import { createSwipe } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import type { DiscoveryCard, Pet } from "@petto/contracts";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 80;

type SwipeDirection = "like" | "pass" | "super-like";

interface SwipeableCardProps {
  card: DiscoveryCard;
  onSwipe: (direction: SwipeDirection) => void;
  onPetPress: (pet: Pet) => void;
}

function SwipeableCard({ card, onSwipe, onPetPress }: SwipeableCardProps) {
  const theme = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const cardRotation = useRef(new Animated.Value(0)).current;
  const likeGlow = useRef(new Animated.Value(0)).current;
  const passGlow = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);
  const isHorizontalSwipe = useRef(false);

  const photos = card.pet.photos.filter((p) => p.url && p.url.length > 0);

  const resetValues = useCallback(() => {
    translateX.setOffset(0);
    cardRotation.setOffset(0);
    translateX.setValue(0);
    cardRotation.setValue(0);
    likeGlow.setValue(0);
    passGlow.setValue(0);
    animating.current = false;
    isHorizontalSwipe.current = false;
  }, [translateX, cardRotation, likeGlow, passGlow]);

  const animateOut = useCallback(
    (direction: SwipeDirection) => {
      animating.current = true;
      if (direction === "like") {
        Animated.parallel([
          Animated.timing(translateX, {
            toValue: SCREEN_WIDTH * 1.5,
            duration: 320,
            useNativeDriver: true
          }),
          Animated.timing(likeGlow, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true
          })
        ]).start(() => resetValues());
      } else if (direction === "pass") {
        Animated.parallel([
          Animated.timing(translateX, {
            toValue: -SCREEN_WIDTH * 1.5,
            duration: 320,
            useNativeDriver: true
          }),
          Animated.timing(passGlow, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true
          })
        ]).start(() => resetValues());
      } else {
        Animated.timing(translateX, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true
        }).start(() => resetValues());
      }
      onSwipe(direction);
    },
    [translateX, likeGlow, passGlow, resetValues, onSwipe]
  );

  const springBack = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200
      }),
      Animated.spring(cardRotation, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200
      })
    ]).start();
    Animated.timing(likeGlow, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true
    }).start();
    Animated.timing(passGlow, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true
    }).start();
  }, [translateX, cardRotation, likeGlow, passGlow]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gs) => {
          if (Math.abs(gs.dx) > 10) {
            isHorizontalSwipe.current = true;
          }
          return Math.abs(gs.dx) > 10;
        },
        onPanResponderMove: (_, gs) => {
          if (animating.current) return;
          if (!isHorizontalSwipe.current && Math.abs(gs.dx) < 10) return;
          translateX.setValue(gs.dx);
          cardRotation.setValue(gs.dx / (SCREEN_WIDTH * 2));
          likeGlow.setValue(gs.dx > 30 ? 1 : 0);
          passGlow.setValue(gs.dx < -30 ? 1 : 0);
        },
        onPanResponderRelease: (_, gs) => {
          if (animating.current) return;
          isHorizontalSwipe.current = false;
          if (gs.dx > SWIPE_THRESHOLD) {
            animateOut("like");
          } else if (gs.dx < -SWIPE_THRESHOLD) {
            animateOut("pass");
          } else {
            springBack();
          }
        },
        onPanResponderTerminate: () => {
          if (animating.current) return;
          isHorizontalSwipe.current = false;
          springBack();
        }
      }),
    [
      translateX,
      cardRotation,
      likeGlow,
      passGlow,
      animating,
      animateOut,
      springBack
    ]
  );

  const animatedStyle = {
    transform: [
      { translateX },
      {
        rotate: cardRotation.interpolate({
          inputRange: [-0.3, 0, 0.3],
          outputRange: ["-6deg", "0deg", "6deg"]
        })
      }
    ]
  };

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[{ flex: 1 }, animatedStyle]}
    >
      <Pressable onPress={() => onPetPress(card.pet)} style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            borderRadius: mobileTheme.radius.xl,
            overflow: "hidden",
            backgroundColor: theme.colors.surface,
            ...mobileTheme.shadow.lg
          }}
        >
          {photos.length > 0 ? (
            <Image
              source={{ uri: photos[0]?.url ?? "" }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View
              style={{
                flex: 1,
                backgroundColor: theme.colors.background,
                justifyContent: "center",
                alignItems: "center"
              }}
            >
              <ImageIcon size={40} color={theme.colors.muted} />
            </View>
          )}

          {photos.length > 1 && (
            <View
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                zIndex: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: "rgba(0,0,0,0.35)",
                borderRadius: mobileTheme.radius.pill,
                paddingHorizontal: 10,
                paddingVertical: 5
              }}
            >
              <ImageIcon size={11} color={theme.colors.white} />
              <Text
                style={{
                  color: theme.colors.white,
                  fontSize: 11,
                  fontWeight: "600",
                  fontFamily: "Inter_600SemiBold"
                }}
              >
                1/{photos.length}
              </Text>
            </View>
          )}

          {photos.length > 1 && (
            <View
              style={{
                position: "absolute",
                bottom: 160,
                left: 0,
                right: 0,
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
                zIndex: 10
              }}
            >
              {photos.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor:
                      i === 0
                        ? theme.colors.white
                        : "rgba(255,255,255,0.4)"
                  }}
                />
              ))}
            </View>
          )}

          <Animated.View
            style={[
              {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: mobileTheme.radius.xl,
                borderWidth: 3,
                borderColor: theme.colors.likeGreen,
                opacity: likeGlow
              }
            ]}
          />

          <Animated.View
            style={[
              {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: mobileTheme.radius.xl,
                borderWidth: 3,
                borderColor: theme.colors.passRed,
                opacity: passGlow
              }
            ]}
          />

          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              paddingTop: 48,
              paddingBottom: 20,
              paddingHorizontal: 20,
              backgroundColor: "rgba(0,0,0,0.3)"
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: mobileTheme.typography.heading.fontSize,
                fontWeight: "800",
                color: theme.colors.white,
                fontFamily: "Inter_800ExtraBold",
                lineHeight: mobileTheme.typography.heading.lineHeight,
                textShadowColor: "rgba(0,0,0,0.2)",
                textShadowOffset: { width: 0, height: 1 },
                flex: 1
              }}
            >
              {card.pet.name}, {card.pet.ageYears}
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 4
              }}
            >
              {card.distanceLabel ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 3
                  }}
                >
                  <MapPin size={11} color="rgba(255,255,255,0.75)" />
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.75)",
                      fontSize: 12,
                      fontFamily: "Inter_500Medium"
                    }}
                  >
                    {card.distanceLabel}
                  </Text>
                </View>
              ) : null}
              {card.distanceLabel && card.pet.breedLabel ? (
                <View
                  style={{
                    width: 2,
                    height: 2,
                    borderRadius: 1,
                    backgroundColor: "rgba(255,255,255,0.4)"
                  }}
                />
              ) : null}
              {card.pet.breedLabel ? (
                <Text
                  style={{
                    color: "rgba(255,255,255,0.75)",
                    fontSize: 12,
                    fontFamily: "Inter_500Medium"
                  }}
                >
                  {card.pet.breedLabel}
                </Text>
              ) : null}
            </View>

            {card.pet.bio ? (
              <Text
                numberOfLines={2}
                style={{
                  color: "rgba(255,255,255,0.65)",
                  fontSize: 13,
                  fontFamily: "Inter_400Regular",
                  lineHeight: 18,
                  marginTop: 8
                }}
              >
                {card.pet.bio}
              </Text>
            ) : null}

            {card.prompt ? (
              <Text
                numberOfLines={1}
                style={{
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 11,
                  fontFamily: "Inter_400Regular",
                  lineHeight: 14,
                  marginTop: 4,
                  fontStyle: "italic"
                }}
              >
                &ldquo;{card.prompt}&rdquo;
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  size: number;
  onPress: () => void;
  disabled?: boolean;
}

function ActionButton({
  icon,
  color,
  borderColor,
  size,
  onPress,
  disabled
}: ActionButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
        borderWidth: 2,
        borderColor,
        ...mobileTheme.shadow.md
      }}
    >
      {icon}
    </Pressable>
  );
}

interface DiscoveryDeckProps {
  cards: DiscoveryCard[];
  myPets: Pet[];
  isLoading: boolean;
  accessToken: string;
  onMatch: (
    myPet: Pet,
    matchedPet: Pet,
    ownerName: string,
    conversationId: string
  ) => void;
  queryClient: ReturnType<typeof useQueryClient>;
  onPetPress: (pet: Pet) => void;
}

export function DiscoveryDeck({
  cards,
  myPets,
  isLoading,
  accessToken,
  onMatch,
  queryClient,
  onPetPress
}: DiscoveryDeckProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const activePetId = useSessionStore((state) => state.activePetId);
  const insets = useSafeAreaInsets();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const swipeLock = useRef(false);

  const activePet = useMemo(() => {
    if (activePetId) {
      return myPets.find((p) => p.id === activePetId) ?? null;
    }
    return myPets.length > 0 ? myPets[0] : null;
  }, [myPets, activePetId]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [cards]);

  const swipeMutation = useMutation({
    mutationFn: ({
      actorPetId,
      targetPetId,
      direction
    }: {
      actorPetId: string;
      targetPetId: string;
      direction: SwipeDirection;
    }) => createSwipe(accessToken, actorPetId, targetPetId, direction),
    onSuccess: (matchResult) => {
      if (matchResult) {
        const card = cards[currentIndex];
        if (card && activePet) {
          onMatch(
            activePet,
            card.pet,
            card.owner.firstName,
            matchResult.conversationId
          );
        }
      }
      queryClient.invalidateQueries({
        queryKey: ["discovery-feed", accessToken]
      });
      queryClient.invalidateQueries({ queryKey: ["matches", accessToken] });
      setCurrentIndex((prev) => prev + 1);
      setIsSwiping(false);
      swipeLock.current = false;
    },
    onError: () => {
      setIsSwiping(false);
      swipeLock.current = false;
    }
  });

  const handleSwipeAction = useCallback(
    (direction: SwipeDirection) => {
      if (swipeLock.current || isSwiping || currentIndex >= cards.length)
        return;
      swipeLock.current = true;
      setIsSwiping(true);

      if (direction === "like" || direction === "super-like") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      const card = cards[currentIndex];
      if (!card || !activePet) {
        setIsSwiping(false);
        swipeLock.current = false;
        return;
      }
      swipeMutation.mutate({
        actorPetId: activePet.id,
        targetPetId: card.pet.id,
        direction
      });
    },
    [cards, currentIndex, activePet, isSwiping, swipeMutation, onMatch]
  );

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: theme.colors.background
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 2,
            borderTopColor: theme.colors.primary,
            borderRightColor: "transparent",
            borderBottomColor: "transparent",
            borderLeftColor: "transparent"
          }}
        />
      </View>
    );
  }

  if (!activePet) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: mobileTheme.spacing.xl,
          backgroundColor: theme.colors.background
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: theme.colors.primaryBg,
            justifyContent: "center",
            alignItems: "center",
            marginBottom: mobileTheme.spacing.lg
          }}
        >
          <Plus size={28} color={theme.colors.primary} />
        </View>
        <Text
          style={{
            fontSize: mobileTheme.typography.subheading.fontSize,
            fontWeight: mobileTheme.typography.subheading.fontWeight,
            color: theme.colors.ink,
            fontFamily: "Inter_600SemiBold",
            textAlign: "center"
          }}
        >
          {t("discoveryDeck.addPetFirst")}
        </Text>
        <Text
          style={{
            color: theme.colors.muted,
            lineHeight: mobileTheme.typography.body.lineHeight,
            textAlign: "center",
            fontSize: mobileTheme.typography.body.fontSize,
            fontFamily: "Inter_400Regular",
            maxWidth: 260,
            marginTop: mobileTheme.spacing.md
          }}
        >
          {t("discoveryDeck.addPetFirstDescription")}
        </Text>
      </View>
    );
  }

  if (!cards.length) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: mobileTheme.spacing.xl,
          backgroundColor: theme.colors.background
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: theme.colors.likeGreenBg,
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <Search size={28} color={theme.colors.likeGreen} />
        </View>
        <Text
          style={{
            fontSize: mobileTheme.typography.subheading.fontSize,
            fontWeight: mobileTheme.typography.subheading.fontWeight,
            color: theme.colors.ink,
            fontFamily: "Inter_600SemiBold",
            marginTop: mobileTheme.spacing.md
          }}
        >
          {t("discoveryDeck.noNewPets")}
        </Text>
        <Text
          style={{
            color: theme.colors.muted,
            lineHeight: mobileTheme.typography.body.lineHeight,
            textAlign: "center",
            fontSize: mobileTheme.typography.body.fontSize,
            fontFamily: "Inter_400Regular",
            maxWidth: 260,
            marginTop: mobileTheme.spacing.sm
          }}
        >
          {t("discoveryDeck.checkBackLater")}
        </Text>
      </View>
    );
  }

  if (currentIndex >= cards.length) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: mobileTheme.spacing.xl,
          backgroundColor: theme.colors.background
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: theme.colors.likeGreenBg,
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <Check size={28} color={theme.colors.likeGreen} />
        </View>
        <Text
          style={{
            fontSize: mobileTheme.typography.subheading.fontSize,
            fontWeight: mobileTheme.typography.subheading.fontWeight,
            color: theme.colors.ink,
            fontFamily: "Inter_600SemiBold",
            marginTop: mobileTheme.spacing.md
          }}
        >
          {t("discoveryDeck.noMorePets")}
        </Text>
        <Text
          style={{
            color: theme.colors.muted,
            lineHeight: mobileTheme.typography.body.lineHeight,
            textAlign: "center",
            fontSize: mobileTheme.typography.body.fontSize,
            fontFamily: "Inter_400Regular",
            maxWidth: 260,
            marginTop: mobileTheme.spacing.sm
          }}
        >
          {t("discoveryDeck.checkBackLater")}
        </Text>
        <PrimaryButton
          label={t("discoveryDeck.refresh")}
          onPress={() => {
            setCurrentIndex(0);
            queryClient.invalidateQueries({
              queryKey: ["discovery-feed", accessToken]
            });
          }}
          size="sm"
          variant="ghost"
          style={{ marginTop: mobileTheme.spacing.md }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingHorizontal: mobileTheme.spacing.lg }}>
        <SwipeableCard
          card={cards[currentIndex]!}
          onSwipe={handleSwipeAction}
          onPetPress={onPetPress}
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          gap: mobileTheme.spacing.lg,
          alignItems: "center",
          justifyContent: "center",
          paddingTop: mobileTheme.spacing.sm,
          paddingBottom: Math.max(insets.bottom, mobileTheme.spacing.lg)
        }}
      >
        <ActionButton
          icon={<X size={22} color={theme.colors.passRed} />}
          color={theme.colors.white}
          borderColor={theme.colors.passRed}
          size={44}
          onPress={() => handleSwipeAction("pass")}
          disabled={isSwiping}
        />
        <ActionButton
          icon={<Star size={18} color={theme.colors.white} />}
          color={theme.colors.starGold}
          borderColor={theme.colors.starGold}
          size={40}
          onPress={() => handleSwipeAction("super-like")}
          disabled={isSwiping}
        />
        <ActionButton
          icon={<Heart size={22} color={theme.colors.white} />}
          color={theme.colors.primary}
          borderColor={theme.colors.primary}
          size={56}
          onPress={() => handleSwipeAction("like")}
          disabled={isSwiping}
        />
      </View>
    </View>
  );
}
