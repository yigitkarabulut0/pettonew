// Debug panel registry for the Fetcht Shelter mobile app. Side-effect
// module imported once from app/_layout.tsx.

import {
  registerEntries,
  registerScenario,
  setOverrides
} from "@petto/debug-panel";

const SCREEN_ROUTES: { title: string; href: string }[] = [
  { title: "Dashboard (stats)", href: "/(app)/(tabs)/dashboard" },
  { title: "Pets list", href: "/(app)/(tabs)/pets" },
  { title: "Applications list", href: "/(app)/(tabs)/applications" },
  { title: "Chats", href: "/(app)/(tabs)/chats" },
  { title: "Profile", href: "/(app)/(tabs)/profile" }
];

const MODAL_ROUTES: { title: string; href: string; subtitle?: string }[] = [
  { title: "New pet", href: "/(app)/pets/new", subtitle: "Pet create form" }
];

const DEEP_LINKS: { title: string; href: string; subtitle?: string }[] = [
  { title: "Pet detail (demo)", href: "/(app)/pets/demo-pet-1" },
  { title: "Application detail (demo)", href: "/(app)/applications/demo-app-1" },
  { title: "Conversation (demo)", href: "/(app)/conversation/demo-conv-1" }
];

registerEntries(
  SCREEN_ROUTES.map((r) => ({
    id: `shelter-screen:${r.href}`,
    title: r.title,
    subtitle: r.href,
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
    id: `shelter-modal:${r.href}`,
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
    id: `shelter-flow:${r.href}`,
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

registerEntries([
  {
    id: "shelter-action:force-logout",
    title: "Force logout",
    subtitle: "Drop shelter session",
    group: "Flows" as const,
    run: async () => {
      const { useSession } = await import("@/store/session");
      await useSession.getState().clearSession();
    }
  }
]);

registerScenario({
  id: "scenario:shelter.pets.empty",
  title: "Pets list — empty",
  description: "Pretend the shelter has zero pets.",
  apply: ({ setQueryData }) => {
    setQueryData(["shelter-pets"], []);
  }
});

registerScenario({
  id: "scenario:shelter.applications.error",
  title: "Applications — 500",
  description: "Force /v1/shelter/applications to respond 500.",
  apply: () => {
    setOverrides({
      apiErrorStatus: 500,
      apiErrorPath: "/v1/shelter/applications"
    });
  },
  reset: () => {
    setOverrides({ apiErrorStatus: null, apiErrorPath: null });
  }
});
