// In-memory registry shared by both apps. Consumers call
// `registerEntry(...)` and `registerScenario(...)` at module import time so
// the panel can list everything without manual wiring per screen.
//
// The registry is intentionally a plain singleton — the debug panel is a
// single-instance UI and we don't want each app re-hydrating from
// AsyncStorage just to list routes.

import type { DebugEntry, Scenario } from "./types";

type Listener = () => void;

const entries = new Map<string, DebugEntry>();
const scenarios = new Map<string, Scenario>();
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

export function registerEntry(entry: DebugEntry): () => void {
  entries.set(entry.id, entry);
  notify();
  return () => {
    entries.delete(entry.id);
    notify();
  };
}

export function registerEntries(list: DebugEntry[]): () => void {
  const unsubs = list.map(registerEntry);
  return () => unsubs.forEach((fn) => fn());
}

export function registerScenario(scenario: Scenario): () => void {
  scenarios.set(scenario.id, scenario);
  notify();
  return () => {
    scenarios.delete(scenario.id);
    notify();
  };
}

export function getAllEntries(): DebugEntry[] {
  return Array.from(entries.values());
}

export function getAllScenarios(): Scenario[] {
  return Array.from(scenarios.values());
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
