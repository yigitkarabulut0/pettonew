import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
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
      title="Find the perfect playmate."
      subtitle="Swipe right to like, left to pass. When both pets like each other, it's a match!"
    >
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <TabButton
          label="Discover"
          active={tab === "discover"}
          onPress={() => setTab("discover")}
          icon="🔍"
        />
        <TabButton
          label={`Matches${matches.length > 0 ? ` (${matches.length})` : ""}`}
          active={tab === "matches"}
          onPress={() => setTab("matches")}
          icon="❤️"
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
        <View style={{ minHeight: 520 }}>
          {matches.length === 0 ? (
            <View
              style={{
                padding: 24,
                borderRadius: 28,
                backgroundColor: mobileTheme.colors.surface,
                alignItems: "center",
                gap: 8
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
                No matches yet
              </Text>
              <Text
                selectable
                style={{
                  color: mobileTheme.colors.muted,
                  lineHeight: 22,
                  textAlign: "center"
                }}
              >
                Keep swiping to find pets that are a great match for yours.
              </Text>
            </View>
          ) : (
            matches.map((match) => (
              <Pressable
                key={match.id}
                style={{
                  flexDirection: "row",
                  gap: 14,
                  padding: 14,
                  backgroundColor: mobileTheme.colors.surface,
                  borderRadius: mobileTheme.radius.md,
                  marginBottom: 12,
                  alignItems: "center"
                }}
              >
                {match.matchedPet.photos[0]?.url ? (
                  <Image
                    source={{ uri: match.matchedPet.photos[0].url }}
                    style={{ width: 84, height: 84, borderRadius: 24 }}
                  />
                ) : (
                  <View
                    style={{
                      width: 84,
                      height: 84,
                      borderRadius: 24,
                      backgroundColor: mobileTheme.colors.background,
                      justifyContent: "center",
                      alignItems: "center"
                    }}
                  >
                    <Text style={{ fontSize: 28 }}>🐾</Text>
                  </View>
                )}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    selectable
                    style={{
                      fontSize: 20,
                      fontWeight: "700",
                      color: mobileTheme.colors.ink
                    }}
                  >
                    {match.matchedPet.name}
                  </Text>
                  <Text
                    selectable
                    style={{
                      color: mobileTheme.colors.secondary,
                      fontWeight: "600"
                    }}
                  >
                    Owner: {match.matchedOwnerName}
                  </Text>
                  <Text selectable style={{ color: mobileTheme.colors.muted }}>
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
        <Pressable
          onPress={handleDismiss}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <View
            style={{
              borderRadius: 32,
              backgroundColor: mobileTheme.colors.surface,
              padding: 32,
              alignItems: "center",
              gap: 16,
              width: SCREEN_WIDTH * 0.82
            }}
          >
            <Text selectable style={{ fontSize: 48 }}>
              🎉
            </Text>
            <Text
              selectable
              style={{
                fontSize: 28,
                fontWeight: "800",
                color: mobileTheme.colors.ink,
                textAlign: "center"
              }}
            >
              It&apos;s a Match!
            </Text>
            {(matchModal.myPet || matchModal.matchedPet) && (
              <View
                style={{ flexDirection: "row", gap: 16, alignItems: "center" }}
              >
                {matchModal.myPet && matchModal.myPet.photos[0]?.url ? (
                  <Image
                    source={{ uri: matchModal.myPet.photos[0].url }}
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 24,
                      borderWidth: 3,
                      borderColor: mobileTheme.colors.secondary
                    }}
                  />
                ) : null}
                <Text
                  selectable
                  style={{ fontSize: 24, color: mobileTheme.colors.secondary }}
                >
                  ♥
                </Text>
                {matchModal.matchedPet &&
                matchModal.matchedPet.photos[0]?.url ? (
                  <Image
                    source={{ uri: matchModal.matchedPet.photos[0].url }}
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 24,
                      borderWidth: 3,
                      borderColor: mobileTheme.colors.secondary
                    }}
                  />
                ) : null}
              </View>
            )}
            <Text
              selectable
              style={{
                color: mobileTheme.colors.muted,
                textAlign: "center",
                lineHeight: 22
              }}
            >
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
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          minHeight: 400
        }}
      >
        <Text
          selectable
          style={{ color: mobileTheme.colors.muted, fontSize: 16 }}
        >
          Loading pets...
        </Text>
      </View>
    );
  }

  if (!activePet) {
    return (
      <View
        style={{
          padding: 24,
          borderRadius: 28,
          backgroundColor: mobileTheme.colors.surface,
          alignItems: "center",
          gap: 8
        }}
      >
        <Text selectable style={{ fontSize: 48 }}>
          🐾
        </Text>
        <Text
          selectable
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: mobileTheme.colors.ink
          }}
        >
          Add a pet first
        </Text>
        <Text
          selectable
          style={{
            color: mobileTheme.colors.muted,
            lineHeight: 22,
            textAlign: "center"
          }}
        >
          You need at least one pet profile to start discovering other pets.
        </Text>
      </View>
    );
  }

  if (!cards.length) {
    return (
      <View
        style={{
          padding: 24,
          borderRadius: 28,
          backgroundColor: mobileTheme.colors.surface,
          alignItems: "center",
          gap: 8
        }}
      >
        <Text selectable style={{ fontSize: 48 }}>
          🔍
        </Text>
        <Text
          selectable
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: mobileTheme.colors.ink
          }}
        >
          No new pets nearby
        </Text>
        <Text
          selectable
          style={{
            color: mobileTheme.colors.muted,
            lineHeight: 22,
            textAlign: "center"
          }}
        >
          Check back later or try adding more pets to your profile to improve
          discovery.
        </Text>
      </View>
    );
  }

  if (currentIndex >= cards.length) {
    return (
      <View
        style={{
          padding: 24,
          borderRadius: 28,
          backgroundColor: mobileTheme.colors.surface,
          alignItems: "center",
          gap: 8
        }}
      >
        <Text selectable style={{ fontSize: 48 }}>
          ✅
        </Text>
        <Text
          selectable
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: mobileTheme.colors.ink
          }}
        >
          You&apos;ve seen all pets for now
        </Text>
        <Text
          selectable
          style={{
            color: mobileTheme.colors.muted,
            lineHeight: 22,
            textAlign: "center"
          }}
        >
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
    <View style={{ alignItems: "center", gap: 20 }}>
      <SwipeableCard
        card={cards[currentIndex]!}
        remaining={remaining}
        onSwipe={handleSwipeAction}
      />
      <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
        <ActionCircle
          icon="✕"
          color="#E74C3C"
          size={56}
          onPress={() => handleSwipeAction("pass")}
          disabled={isSwiping}
        />
        <ActionCircle
          icon="⭐"
          color="#2ECC71"
          size={48}
          onPress={() => handleSwipeAction("super-like")}
          disabled={isSwiping}
        />
        <ActionCircle
          icon="♡"
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
      <View style={{ position: "relative", width: "100%" }}>
        <Animated.View
          style={[
            {
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
            animatedLikeStyle
          ]}
        >
          <Text
            selectable
            style={{ fontSize: 32, fontWeight: "800", color: "#2ECC71" }}
          >
            LIKE
          </Text>
        </Animated.View>
        <Animated.View
          style={[
            {
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
            animatedNopeStyle
          ]}
        >
          <Text
            selectable
            style={{ fontSize: 32, fontWeight: "800", color: "#E74C3C" }}
          >
            NOPE
          </Text>
        </Animated.View>
        <DiscoveryPetCard card={card} />
      </View>
      <Text
        selectable
        style={{ color: mobileTheme.colors.muted, fontSize: 13, marginTop: 12 }}
      >
        {remaining} {remaining === 1 ? "pet" : "pets"} left to discover
      </Text>
    </Animated.View>
  );
}

function ActionCircle({
  icon,
  color,
  size,
  onPress,
  disabled
}: {
  icon: string;
  color: string;
  size: number;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
        shadowColor: color,
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4
      }}
    >
      <Text
        selectable={false}
        style={{
          fontSize: size * 0.4,
          color: "#FFFFFF",
          fontWeight: "700",
          lineHeight: size * 0.4,
          textAlign: "center",
          textAlignVertical: "center"
        }}
      >
        {icon}
      </Text>
    </Pressable>
  );
}

function TabButton({
  label,
  active,
  onPress,
  icon
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        borderRadius: 999,
        backgroundColor: active ? mobileTheme.colors.secondary : "transparent",
        borderWidth: 1,
        borderColor: active
          ? mobileTheme.colors.secondary
          : mobileTheme.colors.border,
        paddingHorizontal: 16,
        paddingVertical: 10,
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        flexDirection: "row"
      }}
    >
      <Text
        selectable={false}
        style={{
          fontSize: 16,
          lineHeight: 16,
          color: active ? "#FFFFFF" : mobileTheme.colors.muted
        }}
      >
        {icon}
      </Text>
      <Text
        selectable
        style={{
          fontSize: 14,
          fontWeight: "700",
          color: active ? "#FFFFFF" : mobileTheme.colors.muted
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
