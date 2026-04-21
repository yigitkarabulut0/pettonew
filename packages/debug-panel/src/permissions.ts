// Debug-aware wrapper around the expo-permissions surface. Apps import
// these helpers instead of calling the expo modules directly (or wrap their
// own callers) so the debug panel can force a specific permission state.
//
// The wrappers are purposefully generic — we don't import the actual expo
// modules here to keep the package dependency-free. The app passes in a
// real permission fetcher via `setPermissionResolver(...)` at startup.

import { getOverrides } from "./overrides";
import type { PermissionKey, PermissionState } from "./types";

export type PermissionResolver = (key: PermissionKey) => Promise<PermissionState>;

let resolver: PermissionResolver | null = null;

export function setPermissionResolver(fn: PermissionResolver) {
  resolver = fn;
}

export async function checkPermission(key: PermissionKey): Promise<PermissionState> {
  const forced = getOverrides().permissions[key];
  if (forced) return forced;
  if (!resolver) return "undetermined";
  return resolver(key);
}
