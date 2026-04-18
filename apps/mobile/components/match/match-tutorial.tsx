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
import { useTranslation } from "react-i18next";
import { ArrowRight, Heart, MessageCircle, X } from "lucide-react-native";

import { PrimaryButton } from "@/components/primary-button";
import { mobileTheme, useTheme } from "@/lib/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface TutorialPage {
  id: string;
  titleKey: string;
  descKey: string;
}

const PAGES: TutorialPage[] = [
  {
    id: "welcome",
    titleKey: "match.tutorial.welcome",
    descKey: "match.tutorial.welcomeDesc"
  },
  {
    id: "like",
    titleKey: "match.tutorial.swipeRight",
    descKey: "match.tutorial.swipeRightDesc"
  },
  {
    id: "pass",
    titleKey: "match.tutorial.swipeLeft",
    descKey: "match.tutorial.swipeLeftDesc"
  },
  {
    id: "chat",
    titleKey: "match.tutorial.matchChat",
    descKey: "match.tutorial.matchChatDesc"
  }
];

export function MatchTutorial({ onComplete }: { onComplete: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
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
          {t("common.skip")}
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
        // Every page is exactly SCREEN_WIDTH wide, so we can give FlatList
        // the offscreen offsets synchronously — scrollToIndex needs this
        // for offscreen indices, otherwise RN throws the "scrollToIndex
        // should be used with getItemLayout" invariant.
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index
        })}
        // Fallback path in case virtualization still hasn't laid out the
        // target cell (shouldn't trigger with fixed-width pages, but cheap
        // insurance against race conditions).
        onScrollToIndexFailed={({ index }) => {
          requestAnimationFrame(() => {
            flatListRef.current?.scrollToOffset({
              offset: SCREEN_WIDTH * index,
              animated: true
            });
          });
        }}
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
              {t(item.titleKey)}
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
              {t(item.descKey)}
            </Text>
          </View>
        )}
      />

      <View
        style={{
          paddingBottom: insets.bottom + 80,
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
          label={isLastPage ? t("match.tutorial.getStarted") : t("common.next")}
          onPress={handleNext}
        />
      </View>
    </View>
  );
}
