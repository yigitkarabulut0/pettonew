// Zustand store that threads wizard state across all (apply) screens.
// Persisted to AsyncStorage so closing/reopening the app keeps progress.

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  defaultSubmission,
  type ApplySubmissionValues
} from "@/lib/apply-schema";

const DRAFT_KEY = "fetcht.shelter-apply.draft";
const RESULT_KEY = "fetcht.shelter-apply.lastResult";

export type ApplyResult = {
  id: string;
  accessToken: string;
  slaDeadline: string;
};

type ApplyState = {
  values: ApplySubmissionValues;
  hydrated: boolean;
  lastResult: ApplyResult | null;
  setField: <K extends keyof ApplySubmissionValues>(
    key: K,
    value: ApplySubmissionValues[K]
  ) => void;
  setValues: (values: Partial<ApplySubmissionValues>) => void;
  reset: () => Promise<void>;
  hydrate: () => Promise<void>;
  storeResult: (result: ApplyResult) => Promise<void>;
  clearResult: () => Promise<void>;
};

async function persistDraft(values: ApplySubmissionValues) {
  try {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(values));
  } catch {
    /* storage full — ignore */
  }
}

export const useApplyStore = create<ApplyState>((set, get) => ({
  values: defaultSubmission,
  hydrated: false,
  lastResult: null,

  setField(key, value) {
    const next = { ...get().values, [key]: value };
    set({ values: next });
    void persistDraft(next);
  },

  setValues(partial) {
    const next = { ...get().values, ...partial };
    set({ values: next });
    void persistDraft(next);
  },

  async reset() {
    set({ values: defaultSubmission });
    try {
      await AsyncStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  },

  async hydrate() {
    try {
      const [draftRaw, resultRaw] = await Promise.all([
        AsyncStorage.getItem(DRAFT_KEY),
        AsyncStorage.getItem(RESULT_KEY)
      ]);
      const values = draftRaw
        ? { ...defaultSubmission, ...(JSON.parse(draftRaw) as ApplySubmissionValues) }
        : defaultSubmission;
      const lastResult = resultRaw
        ? (JSON.parse(resultRaw) as ApplyResult)
        : null;
      set({ values, lastResult, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  async storeResult(result) {
    set({ lastResult: result });
    try {
      await AsyncStorage.setItem(RESULT_KEY, JSON.stringify(result));
      await AsyncStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  },

  async clearResult() {
    set({ lastResult: null });
    try {
      await AsyncStorage.removeItem(RESULT_KEY);
    } catch {
      /* ignore */
    }
  }
}));
