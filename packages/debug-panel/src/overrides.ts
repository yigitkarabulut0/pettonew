// Lightweight module-scoped store for mock overrides so non-React code
// (fetch interceptor, permission wrapper, etc.) can read the current state
// without plumbing context into everything.

import type { MockOverrides } from "./types";

let state: MockOverrides = {
  apiErrorStatus: null,
  apiErrorPath: null,
  apiLatencyMs: 0,
  sessionOverride: null,
  activePetIdOverride: null,
  locationOverride: null,
  permissions: {},
  onboardingResetAt: null,
  themeOverride: "system"
};

type Listener = (next: MockOverrides) => void;
const listeners = new Set<Listener>();

export function getOverrides(): MockOverrides {
  return state;
}

export function setOverrides(patch: Partial<MockOverrides>) {
  state = {
    ...state,
    ...patch,
    permissions: { ...state.permissions, ...(patch.permissions ?? {}) }
  };
  for (const listener of listeners) listener(state);
}

export function resetOverrides() {
  state = {
    apiErrorStatus: null,
    apiErrorPath: null,
    apiLatencyMs: 0,
    sessionOverride: null,
    activePetIdOverride: null,
    locationOverride: null,
    permissions: {},
    onboardingResetAt: null,
    themeOverride: "system"
  };
  for (const listener of listeners) listener(state);
}

export function subscribeOverrides(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
