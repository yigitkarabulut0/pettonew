import { requireNativeModule, type EventSubscription } from "expo-modules-core";
import { Platform } from "react-native";

export type PlaydateActivityStatus =
  | "upcoming"
  | "in_progress"
  | "cancelled"
  | "ended";

export interface PlaydateAttributes {
  playdateId: string;
  title: string;
  city?: string | null;
  hostName: string;
  hostAvatar?: string | null;
  emoji?: string;
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
  addListener: () => ({ remove: () => {} }),
};

const native: NativeModule =
  Platform.OS === "ios"
    ? (() => {
        try {
          return requireNativeModule<NativeModule>("PettoLiveActivities");
        } catch {
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
