import type { FeedingSchedule } from "@petto/contracts";

import LiveActivities, {
  type FeedingAttributes,
  type FeedingLabels,
  type FeedingState,
} from "petto-live-activities";

import i18n from "@/lib/i18n";

const REMINDER_WINDOW_MS = 30 * 60 * 1000;        // 30 dk önceden tetikle (kullanıcı 15 dk istedi, biraz tampon)
const POST_DUE_WINDOW_MS = 60 * 60 * 1000;        // doz zamanı sonrası 60 dk banner kalsın

function deriveLabels(): FeedingLabels {
  const t = i18n.t.bind(i18n);
  return {
    due: t("liveActivity.feedDue"),
    fed: t("liveActivity.feedFed"),
    skip: t("liveActivity.feedSkip"),
    snooze: t("liveActivity.feedSnooze"),
    inProgress: t("liveActivity.feedDue"),
    completed: t("liveActivity.feedCompleted"),
    skipped: t("liveActivity.feedSkipped"),
    minutesShort: t("liveActivity.minutesShort"),
  };
}

function todaysDueAt(schedule: FeedingSchedule, now = new Date()): Date | null {
  const [hh, mm] = (schedule.time || "00:00").split(":").map((v) => parseInt(v, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const d = new Date(now);
  d.setHours(hh, mm, 0, 0);
  return d;
}

export async function ensureFeedingLiveActivity(
  schedule: FeedingSchedule,
  petName: string,
): Promise<string | null> {
  if (!(await LiveActivities.isSupported())) return null;
  const due = todaysDueAt(schedule);
  if (!due) return null;

  const now = Date.now();
  const ms = due.getTime() - now;
  if (ms > REMINDER_WINDOW_MS || ms < -POST_DUE_WINDOW_MS) return null;

  if (schedule.lastLoggedAt) {
    const last = new Date(schedule.lastLoggedAt);
    if (
      last.getFullYear() === due.getFullYear() &&
      last.getMonth() === due.getMonth() &&
      last.getDate() === due.getDate()
    ) {
      return null;
    }
  }

  const dueAtSec = Math.floor(due.getTime() / 1000);
  const state: FeedingState = {
    status: "due",
    dueAt: dueAtSec,
    snoozedUntil: null,
    statusMessage: null,
  };

  const active = await LiveActivities.listActiveFeedings();
  const existing = active.find(
    (a) => a.scheduleId === schedule.id && a.status === "active",
  );
  if (existing) {
    await LiveActivities.updateFeeding(existing.id, state);
    return existing.id;
  }

  const attributes: FeedingAttributes = {
    scheduleId: schedule.id,
    petId: schedule.petId,
    mealName: schedule.mealName,
    foodType: schedule.foodType || "",
    amount: schedule.amount || "",
    petName,
    labels: deriveLabels(),
  };
  return LiveActivities.startFeeding(attributes, state);
}

export async function endFeedingLiveActivity(scheduleId: string) {
  const active = await LiveActivities.listActiveFeedings();
  const match = active.find((a) => a.scheduleId === scheduleId);
  if (!match) return;
  await LiveActivities.endFeeding(match.id, undefined, 0);
}
