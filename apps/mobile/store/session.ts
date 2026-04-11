import type { SessionPayload } from "@petto/contracts";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SessionState {
  session: SessionPayload | null;
  petCount: number;
  activePetId: string | null;
  activeConversationId: string | null;
  matchTutorialSeen: boolean;
  _hasHydrated: boolean;
  setSession: (session: SessionPayload) => void;
  clearSession: () => void;
  setPetCount: (petCount: number) => void;
  setActivePetId: (petId: string | null) => void;
  setActiveConversationId: (id: string | null) => void;
  setMatchTutorialSeen: (seen: boolean) => void;
  setHasHydrated: (state: boolean) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      petCount: 0,
      activePetId: null,
      activeConversationId: null,
      matchTutorialSeen: false,
      _hasHydrated: false,
      setSession: (session) => set({ session }),
      clearSession: () =>
        set({
          session: null,
          petCount: 0,
          activePetId: null,
          activeConversationId: null,
          matchTutorialSeen: false
        }),
      setPetCount: (petCount) => set({ petCount }),
      setActivePetId: (activePetId) => set({ activePetId }),
      setActiveConversationId: (activeConversationId) => set({ activeConversationId }),
      setMatchTutorialSeen: (matchTutorialSeen) => set({ matchTutorialSeen }),
      setHasHydrated: (_hasHydrated) => set({ _hasHydrated })
    }),
    {
      name: "petto-session",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        session: state.session,
        petCount: state.petCount,
        activePetId: state.activePetId,
        matchTutorialSeen: state.matchTutorialSeen
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      }
    }
  )
);

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
