import { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  Text,
  View,
  type ViewToken
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, Heart, MessageCircle, X } from "lucide-react-native";

import { PrimaryButton } from "@/components/primary-button";
import { mobileTheme, useTheme } from "@/lib/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface TutorialPage {
  id: string;
  title: string;
  description: string;
}

const PAGES: TutorialPage[] = [
  {
    id: "welcome",
    title: "Welcome to Match",
    description:
      "Find perfect playmates for your pet. Swipe through profiles and discover pets nearby who share your vibe."
  },
  {
    id: "like",
    title: "Swipe Right to Like",
    description:
      "See a pet you like? Swipe right or tap the heart button. If they like you back, it's a match!"
  },
  {
    id: "pass",
    title: "Swipe Left to Pass",
    description:
      "Not the right fit? Swipe left to skip. No worries — there are always more pets to discover."
  },
  {
    id: "chat",
    title: "Match & Chat",
    description:
      "When both pets like each other, you get a match! Start a conversation and plan your first meetup."
  }
];

export function MatchTutorial({ onComplete }: { onComplete: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const pageIcons: Record<string, React.ReactNode> = {
    welcome: <Heart size={48} color={theme.colors.primary} />,
    like: <ArrowRight size={48} color={theme.colors.success} />,
    pass: <X size={48} color={theme.colors.danger} />,
    chat: <MessageCircle size={48} color={theme.colors.secondary} />
  };

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const isLastPage = activeIndex === PAGES.length - 1;

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
            fontFamily: "Inter_600SemiBold"
          }}
        >
          Skip
        </Text>
      </Pressable>

      <FlatList
        ref={flatListRef}
        data={PAGES}
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
              gap: mobileTheme.spacing.xl
            }}
          >
            <View
              style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                backgroundColor: theme.colors.primaryBg,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {pageIcons[item.id]}
            </View>
            <Text
              style={{
                fontSize: 28,
                fontWeight: "700",
                color: theme.colors.ink,
                textAlign: "center",
                fontFamily: "Inter_700Bold"
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
                fontFamily: "Inter_400Regular",
                maxWidth: 300
              }}
            >
              {item.description}
            </Text>
          </View>
        )}
      />

      <View
        style={{
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: mobileTheme.spacing["3xl"],
          gap: mobileTheme.spacing.xl,
          alignItems: "center"
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: mobileTheme.spacing.sm
          }}
        >
          {PAGES.map((page, index) => (
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
          label={isLastPage ? "Get Started" : "Next"}
          onPress={handleNext}
        />
      </View>
    </View>
  );
}
