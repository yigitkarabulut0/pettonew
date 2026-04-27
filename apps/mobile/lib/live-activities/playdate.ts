import type { Playdate } from "@petto/contracts";

import LiveActivities, {
  type PlaydateAttributes,
  type PlaydateLabels,
  type PlaydateState,
} from "petto-live-activities";

import i18n from "@/lib/i18n";
import { useSessionStore } from "@/store/session";

import { deleteActivity } from "./api";

const PETTO_EMOJI = "🐾";
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function speciesEmoji(_playdate: Playdate): string {
  // MemberPet doesn't carry species in the contract, so we render the
  // generic Petto pawprint. If species ever ships on PlaydateAttendee /
  // MemberPet, swap in a per-species emoji here.
  return PETTO_EMOJI;
}

/**
 * Build the localized label set the SwiftUI Live Activity views render.
 * Snapshot of i18next at start time — Apple's ActivityAttributes are
 * immutable for the activity's lifetime, so if the user later changes
 * device language, existing activities keep their original labels and
 * any *new* activity picks up the new language.
 */
function deriveLabels(): PlaydateLabels {
  const t = i18n.t.bind(i18n);
  return {
    left: t("liveActivity.left"),
    inProgress: t("liveActivity.inProgress"),
    cancelled: t("liveActivity.cancelled"),
    ended: t("liveActivity.ended"),
    live: t("liveActivity.live"),
    friends: t("liveActivity.friends"),
    queue: t("liveActivity.queue"),
    directions: t("liveActivity.directions"),
    directionsShort: t("liveActivity.directionsShort"),
    playdateBy: t("liveActivity.playdateBy"),
  };
}

function deriveAttributes(playdate: Playdate): PlaydateAttributes {
  return {
    playdateId: playdate.id,
    title: playdate.title,
    city: playdate.cityLabel ?? null,
    hostName: playdate.hostInfo?.firstName ?? "Host",
    hostAvatar: playdate.hostInfo?.avatarUrl ?? null,
    emoji: speciesEmoji(playdate),
    labels: deriveLabels(),
  };
}

function deriveState(playdate: Playdate): PlaydateState {
  const startsAt = Math.floor(new Date(playdate.date).getTime() / 1000);
  const endsAt = startsAt + 2 * 60 * 60;
  const attendeeCount = playdate.attendees?.length ?? 0;

  let status: PlaydateState["status"] = "upcoming";
  if (playdate.status === "cancelled") status = "cancelled";
  else if (Date.now() / 1000 >= startsAt && Date.now() / 1000 < endsAt)
    status = "in_progress";

  const avatars = (playdate.attendeesInfo ?? [])
    .map((a) => a.avatarUrl)
    .filter((u): u is string => Boolean(u))
    .slice(0, 3);

  const waitlist =
    playdate.isWaitlisted && playdate.waitlist
      ? Math.max(1, playdate.waitlist.indexOf(useSessionStore.getState().session?.user.id ?? "") + 1)
      : null;

  return {
    status,
    startsAt,
    endsAt,
    attendeeCount,
    maxPets: playdate.maxPets,
    firstAvatars: avatars,
    waitlistPosition: waitlist,
    statusMessage: null,
  };
}

function within6Hours(date: string): boolean {
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return false;
  const now = Date.now();
  return t - now <= SIX_HOURS_MS && t - now > -ONE_HOUR_MS;
}

/**
 * Idempotent: starts a Playdate Live Activity if the playdate is within 6h
 * and there isn't one already running for this id. Otherwise updates the
 * existing one's state. Safe to call repeatedly (e.g. on focus).
 */
export async function ensurePlaydateLiveActivity(
  playdate: Playdate,
): Promise<string | null> {
  if (!playdate.isAttending && !playdate.isWaitlisted && !playdate.isOrganizer) {
    return null;
  }
  if (playdate.status === "cancelled") {
    await endPlaydateLiveActivity(playdate.id, "cancelled");
    return null;
  }
  if (!within6Hours(playdate.date)) return null;
  if (!(await LiveActivities.isSupported())) return null;

  const active = await LiveActivities.listActive();
  const existing = active.find((a) => a.playdateId === playdate.id && a.status === "active");
  const state = deriveState(playdate);

  if (existing) {
    await LiveActivities.updatePlaydate(existing.id, state);
    return existing.id;
  }

  const id = await LiveActivities.startPlaydate(deriveAttributes(playdate), state);
  return id;
}

export async function endPlaydateLiveActivity(
  playdateId: string,
  reason: "cancelled" | "ended" = "ended",
) {
  const active = await LiveActivities.listActive();
  const match = active.find((a) => a.playdateId === playdateId);
  if (!match) return;

  const dismissAfter = reason === "cancelled" ? 0 : 60 * 60;
  await LiveActivities.endPlaydate(match.id, undefined, dismissAfter);

  const token = useSessionStore.getState().session?.tokens.accessToken;
  if (token) {
    try {
      await deleteActivity(token, match.id);
    } catch {
      // server cleanup is best-effort; the activity is already ended on device.
    }
  }
}
