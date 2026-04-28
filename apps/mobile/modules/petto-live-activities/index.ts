import { requireNativeModule, type EventSubscription } from "expo-modules-core";
import { Platform } from "react-native";

export type PlaydateActivityStatus =
  | "upcoming"
  | "in_progress"
  | "cancelled"
  | "ended";

/**
 * Localized labels rendered by the SwiftUI Live Activity views. Set once
 * when the activity starts; immutable for the activity's lifetime. JS side
 * builds this from i18next's current language so the lock screen / Dynamic
 * Island always match the device locale at start time.
 */
export interface PlaydateLabels {
  left: string;
  inProgress: string;
  cancelled: string;
  ended: string;
  live: string;
  friends: string;
  queue: string;
  directions: string;
  directionsShort: string;
  playdateBy: string;
}

export interface PlaydateAttributes {
  playdateId: string;
  title: string;
  city?: string | null;
  hostName: string;
  hostAvatar?: string | null;
  emoji?: string;
  labels?: PlaydateLabels;
}

export interface PlaydateState {
  status: PlaydateActivityStatus;
  startsAt: number;
  endsAt?: number | null;
  attendeeCount: number;
  maxPets: number;
  firstAvatars?: string[];
  waitlistPosition?: number | null;
  statusMessage?: string | null;
}

export interface ActivePlaydateActivity {
  id: string;
  playdateId: string;
  status: "active" | "ended" | "dismissed" | "stale";
}

export interface PushToStartTokenEvent {
  kind: "playdate";
  token: string;
}

export interface ActivityPushTokenEvent {
  activityId: string;
  kind: "playdate";
  playdateId: string;
  token: string;
}

export interface ActivityEndedEvent {
  activityId: string;
  state: "ended" | "dismissed";
}

// MARK: - Medication

export type MedicationActivityStatus = "due" | "given" | "skipped" | "snoozed";

export interface MedicationLabels {
  due: string;
  given: string;
  skip: string;
  someoneElse: string;
  snooze: string;
  inProgress: string;
  completed: string;
  skipped: string;
  minutesShort: string;
}

export interface MedicationAttributes {
  medicationId: string;
  petId: string;
  medicationName: string;
  dosage: string;
  petName: string;
  labels?: MedicationLabels;
}

export interface MedicationState {
  status: MedicationActivityStatus;
  dueAt: number; // sec since epoch
  snoozedUntil?: number | null;
  statusMessage?: string | null;
}

export interface ActiveMedicationActivity {
  id: string;
  medicationId: string;
  petId: string;
  status: "active" | "ended" | "dismissed";
}

// MARK: - Feeding

export type FeedingActivityStatus = "due" | "fed" | "skipped" | "snoozed";

export interface FeedingLabels {
  due: string;
  fed: string;
  skip: string;
  snooze: string;
  inProgress: string;
  completed: string;
  skipped: string;
  minutesShort: string;
}

export interface FeedingAttributes {
  scheduleId: string;
  petId: string;
  mealName: string;
  foodType: string;
  amount: string;
  petName: string;
  labels?: FeedingLabels;
}

export interface FeedingState {
  status: FeedingActivityStatus;
  dueAt: number;
  snoozedUntil?: number | null;
  statusMessage?: string | null;
}

export interface ActiveFeedingActivity {
  id: string;
  scheduleId: string;
  petId: string;
  status: "active" | "ended" | "dismissed";
}

interface NativeModule {
  isSupported(): Promise<boolean>;
  startPlaydate(input: {
    attributes: PlaydateAttributes;
    state: PlaydateState;
    staleAt?: number | null;
  }): Promise<string>;
  updatePlaydate(activityId: string, state: PlaydateState): Promise<void>;
  endPlaydate(
    activityId: string,
    finalState?: PlaydateState | null,
    dismissAfterSeconds?: number | null,
  ): Promise<void>;
  listActive(): Promise<ActivePlaydateActivity[]>;

  startMedication(input: {
    attributes: MedicationAttributes;
    state: MedicationState;
    staleAt?: number | null;
  }): Promise<string>;
  updateMedication(activityId: string, state: MedicationState): Promise<void>;
  endMedication(
    activityId: string,
    finalState?: MedicationState | null,
    dismissAfterSeconds?: number | null,
  ): Promise<void>;
  listActiveMedications(): Promise<ActiveMedicationActivity[]>;

  startFeeding(input: {
    attributes: FeedingAttributes;
    state: FeedingState;
    staleAt?: number | null;
  }): Promise<string>;
  updateFeeding(activityId: string, state: FeedingState): Promise<void>;
  endFeeding(
    activityId: string,
    finalState?: FeedingState | null,
    dismissAfterSeconds?: number | null,
  ): Promise<void>;
  listActiveFeedings(): Promise<ActiveFeedingActivity[]>;

  /** Bridge auth state into the App Group so App Intents (Mark Given /
   *  Mark Fed) can call the backend without opening the app. Pass null
   *  on logout to clear. */
  setAppGroupAuth(accessToken: string | null, apiBaseUrl: string | null): Promise<void>;

  /** Diagnostic: Live Activity App Intent'ları her tetiklendiğinde
   *  App Group UserDefaults'a tek satır kayıt yazıyor. Bunu okumak,
   *  butonların gerçekten fire'lanıp fire'lanmadığını doğrulamanın en
   *  güvenilir yolu. */
  getIntentLog(): Promise<string[]>;
  clearIntentLog(): Promise<void>;

  /** Pending queue — extension iOS cross-process bug yüzünden LA'yı
   *  dismiss edemediğinde main app foreground'da bu kuyruğu okuyup
   *  işlemi tamamlar. */
  getPendingMedicationActions(): Promise<
    Array<{ action: string; medicationId: string; petId: string; ts: string }>
  >;
  clearPendingMedicationActions(): Promise<void>;
  getPendingFeedingActions(): Promise<
    Array<{ action: string; scheduleId: string; petId: string; ts: string }>
  >;
  clearPendingFeedingActions(): Promise<void>;

  addListener(eventName: string, listener: (...args: unknown[]) => void): EventSubscription;
}

const noopModule: NativeModule = {
  isSupported: async () => false,
  startPlaydate: async () => {
    throw new Error("Live Activities are only supported on iOS 16.2+");
  },
  updatePlaydate: async () => {},
  endPlaydate: async () => {},
  listActive: async () => [],
  startMedication: async () => {
    throw new Error("Live Activities are only supported on iOS 16.2+");
  },
  updateMedication: async () => {},
  endMedication: async () => {},
  listActiveMedications: async () => [],
  startFeeding: async () => {
    throw new Error("Live Activities are only supported on iOS 16.2+");
  },
  updateFeeding: async () => {},
  endFeeding: async () => {},
  listActiveFeedings: async () => [],
  setAppGroupAuth: async () => {},
  getIntentLog: async () => [],
  clearIntentLog: async () => {},
  getPendingMedicationActions: async () => [],
  clearPendingMedicationActions: async () => {},
  getPendingFeedingActions: async () => [],
  clearPendingFeedingActions: async () => {},
  addListener: () => ({ remove: () => {} }),
};

/**
 * The error thrown by requireNativeModule when the native module isn't
 * registered. Captured so callers can surface it in diagnostics — silently
 * falling back to noop hid issues like missing autolinking or a failed
 * Swift Module load for far too long.
 */
export let nativeLoadError: string | null = null;

const native: NativeModule =
  Platform.OS === "ios"
    ? (() => {
        try {
          return requireNativeModule<NativeModule>("PettoLiveActivities");
        } catch (err) {
          nativeLoadError = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.warn("[petto-live-activities] native module not loaded:", nativeLoadError);
          return noopModule;
        }
      })()
    : noopModule;

export const LiveActivities = {
  isSupported: () => native.isSupported(),

  startPlaydate: (
    attributes: PlaydateAttributes,
    state: PlaydateState,
    staleAt?: number,
  ) => native.startPlaydate({ attributes, state, staleAt }),

  updatePlaydate: (activityId: string, state: PlaydateState) =>
    native.updatePlaydate(activityId, state),

  endPlaydate: (
    activityId: string,
    finalState?: PlaydateState,
    dismissAfterSeconds?: number,
  ) =>
    native.endPlaydate(activityId, finalState ?? null, dismissAfterSeconds ?? null),

  listActive: () => native.listActive(),

  // Medication
  startMedication: (
    attributes: MedicationAttributes,
    state: MedicationState,
    staleAt?: number,
  ) => native.startMedication({ attributes, state, staleAt }),

  updateMedication: (activityId: string, state: MedicationState) =>
    native.updateMedication(activityId, state),

  endMedication: (
    activityId: string,
    finalState?: MedicationState,
    dismissAfterSeconds?: number,
  ) =>
    native.endMedication(activityId, finalState ?? null, dismissAfterSeconds ?? null),

  listActiveMedications: () => native.listActiveMedications(),

  // Feeding
  startFeeding: (
    attributes: FeedingAttributes,
    state: FeedingState,
    staleAt?: number,
  ) => native.startFeeding({ attributes, state, staleAt }),

  updateFeeding: (activityId: string, state: FeedingState) =>
    native.updateFeeding(activityId, state),

  endFeeding: (
    activityId: string,
    finalState?: FeedingState,
    dismissAfterSeconds?: number,
  ) =>
    native.endFeeding(activityId, finalState ?? null, dismissAfterSeconds ?? null),

  listActiveFeedings: () => native.listActiveFeedings(),

  setAppGroupAuth: (accessToken: string | null, apiBaseUrl: string | null) =>
    native.setAppGroupAuth(accessToken, apiBaseUrl),

  getIntentLog: () => native.getIntentLog(),
  clearIntentLog: () => native.clearIntentLog(),

  getPendingMedicationActions: () => native.getPendingMedicationActions(),
  clearPendingMedicationActions: () => native.clearPendingMedicationActions(),
  getPendingFeedingActions: () => native.getPendingFeedingActions(),
  clearPendingFeedingActions: () => native.clearPendingFeedingActions(),

  addPushToStartTokenListener: (
    cb: (e: PushToStartTokenEvent) => void,
  ): EventSubscription =>
    native.addListener("onPushToStartToken", cb as (...args: unknown[]) => void),

  addActivityPushTokenListener: (
    cb: (e: ActivityPushTokenEvent) => void,
  ): EventSubscription =>
    native.addListener("onActivityPushToken", cb as (...args: unknown[]) => void),

  addActivityEndedListener: (
    cb: (e: ActivityEndedEvent) => void,
  ): EventSubscription =>
    native.addListener("onActivityEnded", cb as (...args: unknown[]) => void),
};

export default LiveActivities;
