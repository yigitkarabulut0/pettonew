// Public types for the debug panel registry.

export type DebugGroup =
  | "Screens"
  | "Modals"
  | "Sheets"
  | "Flows"
  | "Scenarios"
  | "Mocks"
  | "Environment";

export type DebugEntry = {
  id: string;
  title: string;
  group: DebugGroup;
  subtitle?: string;
  // Key words that the search will also match against (optional).
  tags?: string[];
  // Performed when the user taps the entry. Receives a small `ctx` helper so
  // the action can navigate, toast, close the panel, etc.
  run: (ctx: DebugRunContext) => void | Promise<void>;
};

export type DebugRunContext = {
  close: () => void;
  navigate: (href: string) => void;
  toast: (message: string) => void;
};

// Scenarios carry a declarative payload — when activated, they hand a
// `queryClient` to mutate so the target screen enters a known state.
export type Scenario = {
  id: string;
  title: string;
  description?: string;
  // `apply` runs when the scenario is activated. Typically writes mock data
  // into a React Query cache key.
  apply: (helpers: ScenarioHelpers) => void | Promise<void>;
  // `reset` should undo whatever `apply` did. Optional.
  reset?: (helpers: ScenarioHelpers) => void | Promise<void>;
};

export type ScenarioHelpers = {
  setQueryData: (queryKey: readonly unknown[], data: unknown) => void;
  invalidateQueries: (queryKey: readonly unknown[]) => Promise<void>;
};

export type PermissionKey =
  | "location.foreground"
  | "location.background"
  | "notifications"
  | "camera"
  | "media-library"
  | "contacts";

export type PermissionState = "granted" | "denied" | "limited" | "undetermined";

export type MockOverrides = {
  apiErrorStatus?: number | null;
  apiErrorPath?: string | null; // glob-ish, e.g. "/v1/me*" — null/undefined means "all"
  apiLatencyMs?: number;
  sessionOverride?: {
    userId: string;
    name: string;
    email: string;
  } | null;
  activePetIdOverride?: string | null;
  locationOverride?: {
    latitude: number;
    longitude: number;
    label: string;
  } | null;
  permissions: Partial<Record<PermissionKey, PermissionState>>;
  onboardingResetAt?: number | null;
  themeOverride?: "light" | "dark" | "system";
};

export type EnvironmentInfo = {
  appName: string;
  appSlug: string;
  version: string;
  buildNumber?: string;
  releaseChannel?: string;
  apiBaseUrl?: string;
  commitSha?: string;
  platform: "ios" | "android" | "web";
  isDev: boolean;
  sessionSummary?: string;
};
