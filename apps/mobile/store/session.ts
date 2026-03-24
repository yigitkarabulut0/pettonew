import type { SessionPayload } from "@petto/contracts";
import { create } from "zustand";

interface SessionState {
  session: SessionPayload | null;
  petCount: number;
  activePetId: string | null;
  setSession: (session: SessionPayload) => void;
  clearSession: () => void;
  setPetCount: (petCount: number) => void;
  setActivePetId: (petId: string | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  petCount: 0,
  activePetId: null,
  setSession: (session) =>
    set({
      session
    }),
  clearSession: () =>
    set({
      session: null,
      petCount: 0,
      activePetId: null
    }),
  setPetCount: (petCount) => set({ petCount }),
  setActivePetId: (activePetId) => set({ activePetId })
}));

export function needsProfileOnboarding(session: SessionPayload | null) {
  if (!session) {
    return false;
  }

  return !session.user.firstName || !session.user.lastName || !session.user.birthDate || !session.user.gender;
}

export function needsLocationOnboarding(session: SessionPayload | null) {
  if (!session) {
    return false;
  }

  return !session.user.cityId || !session.user.cityLabel;
}
