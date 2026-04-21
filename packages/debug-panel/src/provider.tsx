// Public context for apps: exposes whether the panel is visible, toggles it,
// and subscribes React components to override / registry changes so the UI
// re-renders when a scenario is applied or an entry is added.

import * as React from "react";
import { subscribe } from "./registry";
import { subscribeOverrides } from "./overrides";
import type { EnvironmentInfo } from "./types";

type DebugContextValue = {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
  env: EnvironmentInfo;
};

const DebugContext = React.createContext<DebugContextValue | null>(null);

export function DebugProvider({
  env,
  children
}: {
  env: EnvironmentInfo;
  children: React.ReactNode;
}) {
  const [isOpen, setOpen] = React.useState(false);

  const open = React.useCallback(() => setOpen(true), []);
  const close = React.useCallback(() => setOpen(false), []);
  const toggle = React.useCallback(() => setOpen((v) => !v), []);

  const value = React.useMemo<DebugContextValue>(
    () => ({ isOpen, open, close, toggle, env }),
    [isOpen, open, close, toggle, env]
  );

  return <DebugContext.Provider value={value}>{children}</DebugContext.Provider>;
}

export function useDebug(): DebugContextValue {
  const ctx = React.useContext(DebugContext);
  if (!ctx) {
    throw new Error("useDebug() called outside <DebugProvider>");
  }
  return ctx;
}

// Forces a re-render whenever registry entries change.
export function useRegistryVersion(): number {
  const [version, setVersion] = React.useState(0);
  React.useEffect(() => subscribe(() => setVersion((v) => v + 1)), []);
  return version;
}

// Forces a re-render whenever overrides change.
export function useOverridesVersion(): number {
  const [version, setVersion] = React.useState(0);
  React.useEffect(() => subscribeOverrides(() => setVersion((v) => v + 1)), []);
  return version;
}
