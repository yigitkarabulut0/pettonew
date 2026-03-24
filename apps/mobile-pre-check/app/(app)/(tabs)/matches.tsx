import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import { DiscoveryPetCard } from "@/components/pet-card";
import { PrimaryButton } from "@/components/primary-button";
import { ScreenShell } from "@/components/screen-shell";
import {
  createSwipe,
  getDiscoveryFeed,
  listMatches,
  listMyPets
} from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import type { DiscoveryCard, Pet } from "@petto/contracts";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 120;

type SwipeDirection = "like" | "pass" | "super-like";

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16
  },
  tabButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flexDirection: "row"
  },
  tabIcon: {
    fontSize: 16,
    lineHeight: 16
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: mobileTheme.fontFamily
  },
  emptyState: {
    padding: 24,
    borderRadius: 20,
    backgroundColor: mobileTheme.colors.surface,
    alignItems: "center",
    gap: 8
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: mobileTheme.colors.ink,
    fontFamily: mobileTheme.fontFamily
  },
  emptyStateSubtitle: {
    color: mobileTheme.colors.muted,
    lineHeight: 22,
    textAlign: "center",
    fontFamily: mobileTheme.fontFamily
  },
  emptyStateIcon: {
    fontSize: 48
  },
  matchListContainer: {
    minHeight: 520
  },
  matchItem: {
    flexDirection: "row",
    gap: 14,
    padding: 14,
    backgroundColor: mobileTheme.colors.surface,
    borderRadius: 16,
    marginBottom: 12,
    alignItems: "center"
  },
  matchPhoto: {
    width: 84,
    height: 84,
    borderRadius: 16
  },
  matchPhotoPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 16,
    backgroundColor: mobileTheme.colors.canvas,
    justifyContent: "center",
    alignItems: "center"
  },
  matchPhotoPlaceholderIcon: {
    fontSize: 28
  },
  matchInfo: {
    flex: 1,
    gap: 4
  },
  matchName: {
    fontSize: 20,
    fontWeight: "700",
    color: mobileTheme.colors.ink,
    fontFamily: mobileTheme.fontFamily
  },
  matchOwner: {
    color: mobileTheme.colors.secondary,
    fontWeight: "600",
    fontFamily: mobileTheme.fontFamily
  },
  matchMessage: {
    color: mobileTheme.colors.muted,
    fontFamily: mobileTheme.fontFamily
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center"
  },
  modalCard: {
    borderRadius: 24,
    backgroundColor: mobileTheme.colors.surface,
    padding: 32,
    alignItems: "center",
    gap: 16,
    width: SCREEN_WIDTH * 0.82
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: mobileTheme.colors.ink,
    textAlign: "center",
    fontFamily: mobileTheme.fontFamily
  },
  modalPhotoRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center"
  },
  modalPhoto: {
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: mobileTheme.colors.secondary
  },
  modalHeartIcon: {
    fontSize: 24,
    color: mobileTheme.colors.secondary
  },
  modalDescription: {
    color: mobileTheme.colors.muted,
    textAlign: "center",
    lineHeight: 22,
    fontFamily: mobileTheme.fontFamily
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 400
  },
  loadingText: {
    color: mobileTheme.colors.muted,
    fontSize: 16,
    fontFamily: mobileTheme.fontFamily
  },
  deckContainer: {
    alignItems: "center",
    gap: 20
  },
  actionRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center"
  },
  actionCircle: {
    alignItems: "center",
    justifyContent: "center",
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4
  },
  cardContainer: {
    position: "relative",
    width: "100%"
  },
  likeOverlay: {
    position: "absolute",
    top: 40,
    left: 24,
    zIndex: 10,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: "#2ECC71",
    paddingHorizontal: 20,
    paddingVertical: 8,
    transform: [{ rotate: "-15deg" }]
  },
  likeText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#2ECC71",
    fontFamily: mobileTheme.fontFamily
  },
  nopeOverlay: {
    position: "absolute",
    top: 40,
    right: 24,
    zIndex: 10,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: "#E74C3C",
    paddingHorizontal: 20,
    paddingVertical: 8,
    transform: [{ rotate: "15deg" }]
  },
  nopeText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#E74C3C",
    fontFamily: mobileTheme.fontFamily
  },
  remainingText: {
    color: mobileTheme.colors.muted,
    fontSize: 13,
    marginTop: 12,
    fontFamily: mobileTheme.fontFamily
  },
  textMuted: {
    color: mobileTheme.colors.muted,
    fontFamily: mobileTheme.fontFamily
  }
});

export default function MatchesPage() {
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"discover" | "matches">("discover");
  const [matchModal, setMatchModal] = useState<{
    visible: boolean;
    myPet: Pet | null;
    matchedPet: Pet | null;
    ownerName: string;
  }>({
    visible: false,
    myPet: null,
    matchedPet: null,
    ownerName: ""
  });

  const { data: myPets = [] } = useQuery({
    queryKey: ["my-pets-discovery", session?.tokens.accessToken],
    queryFn: () => listMyPets(session!.tokens.accessToken),
    enabled: Boolean(session) && tab === "discover"
  });

  const { data: feed = [], isLoading: feedLoading } = useQuery({
    queryKey: ["discovery-feed", session?.tokens.accessToken],
    queryFn: () => getDiscoveryFeed(session!.tokens.accessToken),
    enabled: Boolean(session) && tab === "discover"
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["matches", session?.tokens.accessToken],
    queryFn: () => listMatches(session!.tokens.accessToken),
    enabled: Boolean(session) && tab === "matches"
  });

  const handleMatch = useCallback(
    (myPet: Pet, matchedPet: Pet, ownerName: string) => {
      setMatchModal({ visible: true, myPet, matchedPet, ownerName });
    },
    []
  );

  const handleDismiss = useCallback(() => {
    setMatchModal({
      visible: false,
      myPet: null,
      matchedPet: null,
      ownerName: ""
    });
  }, []);

  return (
    <ScreenShell
      eyebrow="Discover"
      title="Find your pet a playmate"
      subtitle="Swipe right to like, left to pass."
    >
      <View style={styles.tabBar}>
        <TabButton
          label="Discover"
          active={tab === "discover"}
          onPress={() => setTab("discover")}
          iconName={tab === "discover" ? "search" : "search-outline"}
        />
        <TabButton
          label={`Matches${matches.length > 0 ? ` (${matches.length})` : ""}`}
          active={tab === "matches"}
          onPress={() => setTab("matches")}
          iconName={tab === "matches" ? "heart" : "heart-outline"}
        />
      </View>

      {tab === "discover" ? (
        <DiscoveryDeck
          cards={feed}
          myPets={myPets}
          isLoading={feedLoading}
          accessToken={session?.tokens.accessToken ?? ""}
          onMatch={handleMatch}
          queryClient={queryClient}
        />
      ) : (
        <View style={styles.matchListContainer}>
          {matches.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="paw-outline"
                size={48}
                color={mobileTheme.colors.inactive}
              />
              <Text style={styles.emptyStateTitle}>No matches yet</Text>
              <Text style={styles.emptyStateSubtitle}>
                Keep swiping to find pets that are a great match for yours.
              </Text>
            </View>
          ) : (
            matches.map((match) => (
              <Pressable key={match.id} style={styles.matchItem}>
                {match.matchedPet.photos[0]?.url ? (
                  <Image
                    source={{ uri: match.matchedPet.photos[0].url }}
                    style={styles.matchPhoto}
                  />
                ) : (
                  <View style={styles.matchPhotoPlaceholder}>
                    <Ionicons
                      name="paw-outline"
                      size={28}
                      color={mobileTheme.colors.inactive}
                    />
                  </View>
                )}
                <View style={styles.matchInfo}>
                  <Text style={styles.matchName}>{match.matchedPet.name}</Text>
                  <Text style={styles.matchOwner}>
                    Owner: {match.matchedOwnerName}
                  </Text>
                  <Text style={styles.matchMessage}>
                    {match.lastMessagePreview}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      )}

      <Modal
        visible={matchModal.visible}
        animationType="fade"
        transparent
        onRequestClose={handleDismiss}
      >
        <Pressable onPress={handleDismiss} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons
              name="heart"
              size={48}
              color={mobileTheme.colors.primary}
            />
            <Text style={styles.modalTitle}>It&apos;s a Match!</Text>
            {(matchModal.myPet || matchModal.matchedPet) && (
              <View style={styles.modalPhotoRow}>
                {matchModal.myPet && matchModal.myPet.photos[0]?.url ? (
                  <Image
                    source={{ uri: matchModal.myPet.photos[0].url }}
                    style={styles.modalPhoto}
                  />
                ) : null}
                <Ionicons
                  name="heart"
                  size={24}
                  color={mobileTheme.colors.secondary}
                />
                {matchModal.matchedPet &&
                matchModal.matchedPet.photos[0]?.url ? (
                  <Image
                    source={{ uri: matchModal.matchedPet.photos[0].url }}
                    style={styles.modalPhoto}
                  />
                ) : null}
              </View>
            )}
            <Text style={styles.modalDescription}>
              {matchModal.myPet && matchModal.matchedPet
                ? `${matchModal.myPet.name} and ${matchModal.matchedPet.name} like each other! Start a conversation now.`
                : "Your pets like each other! Start a conversation now."}
            </Text>
            <PrimaryButton label="Keep Swiping" onPress={handleDismiss} />
          </View>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}

interface DiscoveryDeckProps {
  cards: DiscoveryCard[];
  myPets: Pet[];
  isLoading: boolean;
  accessToken: string;
  onMatch: (myPet: Pet, matchedPet: Pet, ownerName: string) => void;
  queryClient: ReturnType<typeof useQueryClient>;
}

function DiscoveryDeck({
  cards,
  myPets,
  isLoading,
  accessToken,
  onMatch,
  queryClient
}: DiscoveryDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const swipeLock = useRef(false);

  const activePet = myPets.length > 0 ? myPets[0] : null;

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
          onMatch(activePet, card.pet, card.owner.firstName);
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

  const remaining = useMemo(
    () => Math.max(0, cards.length - currentIndex),
    [cards.length, currentIndex]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading pets...</Text>
      </View>
    );
  }

  if (!activePet) {
    return (
      <View style={styles.emptyState}>
        <Ionicons
          name="paw-outline"
          size={48}
          color={mobileTheme.colors.inactive}
        />
        <Text style={styles.emptyStateTitle}>Add a pet first</Text>
        <Text style={styles.emptyStateSubtitle}>
          You need at least one pet profile to start discovering other pets.
        </Text>
      </View>
    );
  }

  if (!cards.length) {
    return (
      <View style={styles.emptyState}>
        <Ionicons
          name="search-outline"
          size={48}
          color={mobileTheme.colors.inactive}
        />
        <Text style={styles.emptyStateTitle}>No new pets nearby</Text>
        <Text style={styles.emptyStateSubtitle}>
          Check back later or try adding more pets to your profile to improve
          discovery.
        </Text>
      </View>
    );
  }

  if (currentIndex >= cards.length) {
    return (
      <View style={styles.emptyState}>
        <Ionicons
          name="checkmark-circle-outline"
          size={48}
          color={mobileTheme.colors.inactive}
        />
        <Text style={styles.emptyStateTitle}>
          You&apos;ve seen all pets for now
        </Text>
        <Text style={styles.emptyStateSubtitle}>
          Come back soon to discover new pets in your area.
        </Text>
        <PrimaryButton
          label="Refresh"
          onPress={() => {
            setCurrentIndex(0);
            queryClient.invalidateQueries({
              queryKey: ["discovery-feed", accessToken]
            });
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.deckContainer}>
      <SwipeableCard
        card={cards[currentIndex]!}
        remaining={remaining}
        onSwipe={handleSwipeAction}
      />
      <View style={styles.actionRow}>
        <ActionCircle
          iconName="close"
          color="#E74C3C"
          size={56}
          onPress={() => handleSwipeAction("pass")}
          disabled={isSwiping}
        />
        <ActionCircle
          iconName="star"
          color="#2ECC71"
          size={48}
          onPress={() => handleSwipeAction("super-like")}
          disabled={isSwiping}
        />
        <ActionCircle
          iconName="heart"
          color={mobileTheme.colors.secondary}
          size={56}
          onPress={() => handleSwipeAction("like")}
          disabled={isSwiping}
        />
      </View>
    </View>
  );
}

interface SwipeableCardProps {
  card: DiscoveryCard;
  remaining: number;
  onSwipe: (direction: SwipeDirection) => void;
}

function SwipeableCard({ card, remaining, onSwipe }: SwipeableCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const cardRotation = useRef(new Animated.Value(0)).current;
  const likeOpacity = useRef(new Animated.Value(0)).current;
  const nopeOpacity = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);

  const resetValues = useCallback(() => {
    translateX.setOffset(0);
    translateY.setOffset(0);
    cardRotation.setOffset(0);
    translateX.setValue(0);
    translateY.setValue(0);
    cardRotation.setValue(0);
    likeOpacity.setValue(0);
    nopeOpacity.setValue(0);
    animating.current = false;
  }, [translateX, translateY, cardRotation, likeOpacity, nopeOpacity]);

  const animateOut = useCallback(
    (direction: SwipeDirection) => {
      animating.current = true;

      if (direction === "like") {
        Animated.parallel([
          Animated.timing(translateX, {
            toValue: SCREEN_WIDTH * 1.5,
            duration: 300,
            useNativeDriver: true
          }),
          Animated.timing(likeOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true
          })
        ]).start(() => {
          resetValues();
        });
      } else if (direction === "pass") {
        Animated.parallel([
          Animated.timing(translateX, {
            toValue: -SCREEN_WIDTH * 1.5,
            duration: 300,
            useNativeDriver: true
          }),
          Animated.timing(nopeOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true
          })
        ]).start(() => {
          resetValues();
        });
      } else {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -SCREEN_WIDTH * 1.5,
            duration: 300,
            useNativeDriver: true
          })
        ]).start(() => {
          resetValues();
        });
      }

      onSwipe(direction);
    },
    [translateX, translateY, likeOpacity, nopeOpacity, resetValues, onSwipe]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dx) > 8 || Math.abs(gs.dy) > 8,
        onPanResponderMove: (_, gs) => {
          if (animating.current) return;
          translateX.setValue(gs.dx);
          translateY.setValue(gs.dy);
          cardRotation.setValue(gs.dx / (SCREEN_WIDTH * 1.8));
          likeOpacity.setValue(gs.dx > 40 ? 1 : 0);
          nopeOpacity.setValue(gs.dx < -40 ? 1 : 0);
        },
        onPanResponderRelease: (_, gs) => {
          if (animating.current) return;
          const shouldRight = gs.dx > SWIPE_THRESHOLD;
          const shouldLeft = gs.dx < -SWIPE_THRESHOLD;
          const shouldUp =
            gs.dy < -SWIPE_THRESHOLD && Math.abs(gs.dx) < SWIPE_THRESHOLD;

          if (shouldRight) {
            animateOut("like");
          } else if (shouldLeft) {
            animateOut("pass");
          } else if (shouldUp) {
            animateOut("super-like");
          } else {
            Animated.parallel([
              Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: false,
                damping: 20,
                stiffness: 200
              }),
              Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: false,
                damping: 20,
                stiffness: 200
              }),
              Animated.spring(cardRotation, {
                toValue: 0,
                useNativeDriver: false,
                damping: 20,
                stiffness: 200
              })
            ]).start();
            Animated.timing(likeOpacity, {
              toValue: 0,
              duration: 150,
              useNativeDriver: false
            }).start();
            Animated.timing(nopeOpacity, {
              toValue: 0,
              duration: 150,
              useNativeDriver: false
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          if (animating.current) return;
          Animated.parallel([
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: false,
              damping: 20,
              stiffness: 200
            }),
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: false,
              damping: 20,
              stiffness: 200
            }),
            Animated.spring(cardRotation, {
              toValue: 0,
              useNativeDriver: false,
              damping: 20,
              stiffness: 200
            })
          ]).start();
          Animated.timing(likeOpacity, {
            toValue: 0,
            duration: 150,
            useNativeDriver: false
          }).start();
          Animated.timing(nopeOpacity, {
            toValue: 0,
            duration: 150,
            useNativeDriver: false
          }).start();
        }
      }),
    [
      translateX,
      translateY,
      cardRotation,
      likeOpacity,
      nopeOpacity,
      animating,
      animateOut
    ]
  );

  const animatedLikeStyle = { opacity: likeOpacity };
  const animatedNopeStyle = { opacity: nopeOpacity };
  const animatedCardStyle = {
    transform: [
      { translateX },
      { translateY },
      {
        rotate: cardRotation.interpolate({
          inputRange: [-0.5, 0, 0.5],
          outputRange: ["-15deg", "0deg", "15deg"]
        })
      }
    ]
  };

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        { width: SCREEN_WIDTH - 40, alignItems: "center" },
        animatedCardStyle
      ]}
    >
      <View style={styles.cardContainer}>
        <Animated.View style={[styles.likeOverlay, animatedLikeStyle]}>
          <Text style={styles.likeText}>LIKE</Text>
        </Animated.View>
        <Animated.View style={[styles.nopeOverlay, animatedNopeStyle]}>
          <Text style={styles.nopeText}>NOPE</Text>
        </Animated.View>
        <DiscoveryPetCard card={card} />
      </View>
      <Text style={styles.textMuted}>
        {remaining} {remaining === 1 ? "pet" : "pets"} left to discover
      </Text>
    </Animated.View>
  );
}

function ActionCircle({
  iconName,
  color,
  size,
  onPress,
  disabled
}: {
  iconName: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  size: number;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionCircle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: disabled ? 0.4 : 1,
          shadowColor: color,
          shadowOpacity: 0.25
        }
      ]}
    >
      <Ionicons
        name={iconName}
        size={size * 0.4}
        color={mobileTheme.colors.surface}
      />
    </Pressable>
  );
}

function TabButton({
  label,
  active,
  onPress,
  iconName
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  iconName: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tabButton,
        {
          backgroundColor: active
            ? mobileTheme.colors.secondary
            : "transparent",
          borderColor: active
            ? mobileTheme.colors.secondary
            : mobileTheme.colors.border
        }
      ]}
    >
      <Ionicons
        name={iconName}
        size={16}
        color={active ? mobileTheme.colors.surface : mobileTheme.colors.muted}
      />
      <Text
        style={[
          styles.tabLabel,
          {
            color: active
              ? mobileTheme.colors.surface
              : mobileTheme.colors.muted
          }
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
