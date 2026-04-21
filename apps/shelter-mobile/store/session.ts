import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import type { Shelter, ShelterMember } from "@petto/contracts";
import { SESSION_KEY, TOKEN_KEY } from "@/lib/api";

type SessionState = {
  shelter: Shelter | null;
  member: ShelterMember | null;
  mustChangePassword: boolean;
  hydrated: boolean;
  // v0.15 — legacy signature kept: `member` is optional so the login
  // code in lib/api.ts can pass it alongside the shelter. Older calls
  // (e.g. profile save that only mutates shelter info) use setShelter
  // and leave member untouched.
  setSession: (
    shelter: Shelter,
    token: string,
    mustChangePassword: boolean,
    member?: ShelterMember | null
  ) => Promise<void>;
  clearSession: () => Promise<void>;
  hydrate: () => Promise<void>;
  setShelter: (shelter: Shelter) => Promise<void>;
  setMember: (member: ShelterMember) => Promise<void>;
  markPasswordChanged: () => Promise<void>;
};

type PersistedSession = {
  shelter: Shelter;
  mustChangePassword: boolean;
  member?: ShelterMember | null;
};

export const useSession = create<SessionState>((set, get) => ({
  shelter: null,
  member: null,
  mustChangePassword: false,
  hydrated: false,

  async setSession(shelter, token, mustChangePassword, member) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ shelter, mustChangePassword, member: member ?? null })
    );
    set({ shelter, mustChangePassword, member: member ?? null });
  },

  async clearSession() {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(SESSION_KEY);
    set({ shelter: null, member: null, mustChangePassword: false });
  },

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedSession;
        set({
          shelter: parsed.shelter,
          member: parsed.member ?? null,
          mustChangePassword: parsed.mustChangePassword
        });
      }
    } catch {
      // no-op
    }
    set({ hydrated: true });
  },

  async setShelter(shelter) {
    const { mustChangePassword, member } = get();
    await AsyncStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ shelter, mustChangePassword, member })
    );
    set({ shelter });
  },

  async setMember(member) {
    const { shelter, mustChangePassword } = get();
    await AsyncStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ shelter, mustChangePassword, member })
    );
    set({ member });
  },

  async markPasswordChanged() {
    const { shelter, member } = get();
    await AsyncStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ shelter, mustChangePassword: false, member })
    );
    set({ mustChangePassword: false });
  }
}));
