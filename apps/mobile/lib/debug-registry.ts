// Registers every screen, modal, sheet and scenario the Fetcht mobile app
// exposes through the debug panel. Imported once from app/_layout.tsx as a
// side-effect module.

import {
  registerEntries,
  registerScenario,
  setOverrides
} from "@petto/debug-panel";

// ── Screens ─────────────────────────────────────────────────
// Every /app/(app) route listed here so QA can jump without navigating
// through the real UI. Keep this list in sync with the router tree.
const SCREEN_ROUTES: { title: string; href: string; subtitle?: string }[] = [
  { title: "Home feed", href: "/(app)/(tabs)/home" },
  { title: "Discover (swipe)", href: "/(app)/(tabs)/discover" },
  { title: "Chat list", href: "/(app)/(tabs)/chat" },
  { title: "Explore", href: "/(app)/(tabs)/explore" },
  { title: "Match tab", href: "/(app)/(tabs)/match" },
  { title: "Care", href: "/(app)/(tabs)/care" },
  { title: "Profile", href: "/(app)/(tabs)/profile" },
  { title: "Conversations", href: "/(app)/conversations" },
  { title: "Groups", href: "/(app)/groups" },
  { title: "Playdates", href: "/(app)/playdates" },
  { title: "Lost pets", href: "/(app)/lost-pets" },
  { title: "My applications", href: "/(app)/my-applications" },
  { title: "Pet sitters", href: "/(app)/pet-sitters" },
  { title: "Vet contacts", href: "/(app)/vet-contacts" },
  { title: "Training tips", href: "/(app)/training-tips" },
  { title: "Notification settings", href: "/(app)/notification-settings" }
];

// ── Modals / sheets ─────────────────────────────────────────
// These are screens that are presented modally via expo-router — they can
// still be opened by route so we list them under their own bucket.
const MODAL_ROUTES: { title: string; href: string; subtitle?: string }[] = [
  { title: "Edit pet (modal)", href: "/(app)/edit-pet", subtitle: "Pet profile editor" },
  { title: "Onboarding welcome", href: "/(app)/onboarding/welcome" },
  { title: "Onboarding pet", href: "/(app)/onboarding/pet" },
  { title: "Playdate create", href: "/(app)/playdates/new" },
  { title: "Group create", href: "/(app)/group/new" }
];

// ── Deep-link shortcuts (parameterized) ─────────────────────
// Route patterns with a representative sample ID so the QA panel can open
// the screen directly instead of navigating through a list first.
const DEEP_LINKS: { title: string; href: string; subtitle?: string }[] = [
  { title: "Adoption detail (demo)", href: "/(app)/adopt/demo-pet-1", subtitle: "Opens adoption detail for a seeded pet" },
  { title: "Shelter detail (demo)", href: "/(app)/shelter/demo-shelter-1" },
  { title: "Venue detail (demo)", href: "/(app)/venue/demo-venue-1" },
  { title: "Playdate detail (demo)", href: "/(app)/playdates/demo-playdate-1" },
  { title: "Group detail (demo)", href: "/(app)/group/demo-group-1" },
  { title: "Conversation (demo)", href: "/(app)/conversation/demo-conv-1" },
  { title: "User profile (demo)", href: "/(app)/user/demo-user-1" },
  { title: "Pet health (demo)", href: "/(app)/pet-health/demo-pet-1" },
  { title: "Pet weight (demo)", href: "/(app)/pet-weight/demo-pet-1" },
  { title: "Feeding (demo)", href: "/(app)/feeding/demo-pet-1" },
  { title: "Diary (demo)", href: "/(app)/diary/demo-pet-1" }
];

registerEntries(
  SCREEN_ROUTES.map((r) => ({
    id: `screen:${r.href}`,
    title: r.title,
    subtitle: r.subtitle ?? r.href,
    group: "Screens" as const,
    tags: [r.href],
    run: ({ close, navigate }) => {
      close();
      navigate(r.href);
    }
  }))
);

registerEntries(
  MODAL_ROUTES.map((r) => ({
    id: `modal:${r.href}`,
    title: r.title,
    subtitle: r.subtitle ?? r.href,
    group: "Modals" as const,
    tags: [r.href],
    run: ({ close, navigate }) => {
      close();
      navigate(r.href);
    }
  }))
);

registerEntries(
  DEEP_LINKS.map((r) => ({
    id: `flow:${r.href}`,
    title: r.title,
    subtitle: r.subtitle ?? r.href,
    group: "Flows" as const,
    tags: [r.href],
    run: ({ close, navigate }) => {
      close();
      navigate(r.href);
    }
  }))
);

// ── Actions ─────────────────────────────────────────────────
// Generic app-level test utilities that don't navigate.
registerEntries([
  {
    id: "action:force-logout",
    title: "Force logout",
    subtitle: "Drop current session and return to auth",
    group: "Flows" as const,
    run: async () => {
      const { useSessionStore } = await import("@/store/session");
      useSessionStore.getState().clearSession();
    }
  },
  {
    id: "action:reset-onboarding",
    title: "Reset onboarding flag",
    subtitle: "Next launch re-shows onboarding",
    group: "Flows" as const,
    run: () => {
      setOverrides({ onboardingResetAt: Date.now() });
    }
  },
  {
    id: "action:clear-query-cache",
    title: "Clear persisted React Query cache",
    subtitle: "Wipes PETTO_REACT_QUERY_CACHE + in-memory queries",
    group: "Flows" as const,
    run: async () => {
      const AsyncStorage = (
        await import("@react-native-async-storage/async-storage")
      ).default;
      await AsyncStorage.removeItem("PETTO_REACT_QUERY_CACHE");
    }
  }
]);

// ── Scenarios ───────────────────────────────────────────────
// Example scenarios. Each screen's owner can add more by calling
// registerScenario() in their own module.
registerScenario({
  id: "scenario:home.empty",
  title: "Home feed — empty",
  description: "Pretend the home feed returned zero posts.",
  apply: ({ setQueryData }) => {
    setQueryData(["home-feed"], { posts: [], hasMore: false });
  }
});

registerScenario({
  id: "scenario:matches.loading",
  title: "Matches — loading",
  description: "Clears the cache so matches shows its loading state.",
  apply: async ({ invalidateQueries }) => {
    await invalidateQueries(["matches"]);
  }
});

registerScenario({
  id: "scenario:conversations.error",
  title: "Conversations — 500 error",
  description: "Forces /v1/conversations to respond 500.",
  apply: () => {
    setOverrides({ apiErrorStatus: 500, apiErrorPath: "/v1/conversations" });
  },
  reset: () => {
    setOverrides({ apiErrorStatus: null, apiErrorPath: null });
  }
});
