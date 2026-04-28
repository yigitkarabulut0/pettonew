import type { PetMedication } from "@petto/contracts";

import LiveActivities, {
  type MedicationAttributes,
  type MedicationLabels,
  type MedicationState,
} from "petto-live-activities";

import i18n from "@/lib/i18n";

const REMINDER_WINDOW_MS = 30 * 60 * 1000;       // doz vakti −30dk içinde tetikle
const POST_DUE_WINDOW_MS = 4 * 60 * 60 * 1000;   // dozdan sonra 4 saat daha aktif
const ACTIVE_LIFETIME_SEC = 8 * 60 * 60;          // Apple max active süresi


function deriveLabels(): MedicationLabels {
  const t = i18n.t.bind(i18n);
  return {
    due: t("liveActivity.medDue"),
    given: t("liveActivity.medGiven"),
    skip: t("liveActivity.medSkip"),
    someoneElse: t("liveActivity.medSomeoneElse"),
    snooze: t("liveActivity.medSnooze"),
    inProgress: t("liveActivity.medDue"),
    completed: t("liveActivity.medCompleted"),
    skipped: t("liveActivity.medSkipped"),
    minutesShort: t("liveActivity.minutesShort"),
  };
}

/**
 * Today'in doz zamanını hesaplar (timeOfDay HH:MM, medication timezone'da).
 * `daysOfWeek` boş veya bugünü içeriyorsa geçerli; aksi halde null.
 */
function todaysDueAt(med: PetMedication, now = new Date()): Date | null {
  if (!med.active) return null;
  const dow = now.getDay(); // 0=Sun..6=Sat
  if (med.daysOfWeek?.length && !med.daysOfWeek.includes(dow)) return null;

  const [hh, mm] = (med.timeOfDay || "00:00").split(":").map((v) => parseInt(v, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;

  const d = new Date(now);
  d.setHours(hh, mm, 0, 0);
  return d;
}

/**
 * Idempotent: bir ilaç için Live Activity tetiklenebilir mi diye bakar,
 * tetiklenebiliyorsa start eder ya da var olanı update eder.
 *
 * Kurallar:
 *   - dueAt 30dk önce ya da 90dk sonra arası → aktif tetikle
 *   - bugünkü doz zaten verildiyse (lastGivenAt bugüne aitse) tetikleme
 *   - aynı medicationId için aktif activity varsa state'i güncelle
 */
export async function ensureMedicationLiveActivity(
  med: PetMedication,
  petName: string,
): Promise<string | null> {
  if (!(await LiveActivities.isSupported())) return null;
  const due = todaysDueAt(med);
  if (!due) return null;

  const now = Date.now();
  const ms = due.getTime() - now;
  if (ms > REMINDER_WINDOW_MS || ms < -POST_DUE_WINDOW_MS) return null;

  // Bugün verilmişse tekrar başlatma
  if (med.lastGivenAt) {
    const last = new Date(med.lastGivenAt);
    if (
      last.getFullYear() === due.getFullYear() &&
      last.getMonth() === due.getMonth() &&
      last.getDate() === due.getDate()
    ) {
      return null;
    }
  }

  const dueAtSec = Math.floor(due.getTime() / 1000);
  const state: MedicationState = {
    status: "due",
    dueAt: dueAtSec,
    snoozedUntil: null,
    statusMessage: null,
  };

  const active = await LiveActivities.listActiveMedications();
  const existing = active.find(
    (a) => a.medicationId === med.id && a.status === "active",
  );
  if (existing) {
    await LiveActivities.updateMedication(existing.id, state);
    return existing.id;
  }

  const attributes: MedicationAttributes = {
    medicationId: med.id,
    petId: med.petId,
    medicationName: med.name,
    dosage: med.dosage || "",
    petName,
    labels: deriveLabels(),
  };
  // staleAt'ı 8 saat ileri ayarla — bu sürede kullanıcı butona basmazsa
  // banner sadece "stale" görünüme geçer; Apple ekstra ~4 saat daha
  // dismiss etmeden tutar. Yani toplam ~12 saat kullanıcı işlem yapmazsa
  // bile banner kaybolmaz.
  const staleAtSec = Math.floor(Date.now() / 1000) + ACTIVE_LIFETIME_SEC;
  return LiveActivities.startMedication(attributes, state, staleAtSec);
}

export async function endMedicationLiveActivity(medicationId: string) {
  const active = await LiveActivities.listActiveMedications();
  const match = active.find((a) => a.medicationId === medicationId);
  if (!match) return;
  await LiveActivities.endMedication(match.id, undefined, 0);
}
