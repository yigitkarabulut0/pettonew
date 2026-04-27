import AppIntents
import ActivityKit
import Foundation

/// "İlaç verildi" — Live Activity buton tap'inde tetiklenir. iOS 17+'da
/// app açılmadan extension process'inde çalışır: backend'e mark-given
/// POST atar, sonrasında activity'yi `given` durumuna geçirir ve 3 saniye
/// içinde dismiss eder.
@available(iOS 17.0, *)
struct MarkMedicationGivenIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Mark medication as given"

    @Parameter(title: "Activity ID") var activityId: String
    @Parameter(title: "Pet ID") var petId: String
    @Parameter(title: "Medication ID") var medicationId: String

    init() {}

    init(activityId: String, petId: String, medicationId: String) {
        self.activityId = activityId
        self.petId = petId
        self.medicationId = medicationId
    }

    func perform() async throws -> some IntentResult {
        await BackendClient.post(
            path: "/v1/pets/\(petId)/medications/\(medicationId)/mark-given"
        )
        await endActivity(status: "given")
        return .result()
    }

    private func endActivity(status: String) async {
        guard
            let activity = Activity<MedicationAttributes>.activities.first(where: { $0.id == activityId })
        else { return }
        let now = Date().timeIntervalSince1970
        let final = MedicationAttributes.ContentState(
            status: status,
            dueAtSec: now,
            snoozedUntilSec: nil,
            statusMessage: nil
        )
        let content = ActivityContent(state: final, staleDate: nil)
        await activity.end(content, dismissalPolicy: .after(Date().addingTimeInterval(3)))
    }
}

/// "Pas geç" — atlanan dozu işaretler. Backend'e log atılmaz (kullanıcı
/// dozu vermedi). Activity hemen dismiss olur.
@available(iOS 17.0, *)
struct SkipMedicationIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Skip medication dose"

    @Parameter(title: "Activity ID") var activityId: String

    init() {}
    init(activityId: String) { self.activityId = activityId }

    func perform() async throws -> some IntentResult {
        await endActivity(status: "skipped")
        return .result()
    }

    private func endActivity(status: String) async {
        guard
            let activity = Activity<MedicationAttributes>.activities.first(where: { $0.id == activityId })
        else { return }
        let now = Date().timeIntervalSince1970
        let final = MedicationAttributes.ContentState(
            status: status,
            dueAtSec: now,
            snoozedUntilSec: nil,
            statusMessage: nil
        )
        let content = ActivityContent(state: final, staleDate: nil)
        await activity.end(content, dismissalPolicy: .immediate)
    }
}

/// "Başkası verdi" — backend'e (mark-given) yine log atar (ev içindeki
/// başka bir kişi verdiği için doz alındı kaydı tutulmalı), ek olarak
/// activity'ye "başkası verdi" status mesajı ekler. Sonra dismiss.
@available(iOS 17.0, *)
struct SomeoneElseMedicationIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Mark as given by someone else"

    @Parameter(title: "Activity ID") var activityId: String
    @Parameter(title: "Pet ID") var petId: String
    @Parameter(title: "Medication ID") var medicationId: String

    init() {}
    init(activityId: String, petId: String, medicationId: String) {
        self.activityId = activityId
        self.petId = petId
        self.medicationId = medicationId
    }

    func perform() async throws -> some IntentResult {
        await BackendClient.post(
            path: "/v1/pets/\(petId)/medications/\(medicationId)/mark-given",
            body: ["givenBy": "other"]
        )
        await endActivity()
        return .result()
    }

    private func endActivity() async {
        guard
            let activity = Activity<MedicationAttributes>.activities.first(where: { $0.id == activityId })
        else { return }
        let now = Date().timeIntervalSince1970
        let final = MedicationAttributes.ContentState(
            status: "given",
            dueAtSec: now,
            snoozedUntilSec: nil,
            statusMessage: nil
        )
        let content = ActivityContent(state: final, staleDate: nil)
        await activity.end(content, dismissalPolicy: .after(Date().addingTimeInterval(3)))
    }
}

/// "Ertele" — 15 dakika sonraya öteler. Local-only, backend'i etkilemez.
/// Activity dismiss olmaz, sadece state.snoozedUntil güncellenir.
@available(iOS 17.0, *)
struct SnoozeMedicationIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Snooze medication reminder"

    @Parameter(title: "Activity ID") var activityId: String

    init() {}
    init(activityId: String) { self.activityId = activityId }

    func perform() async throws -> some IntentResult {
        await snooze()
        return .result()
    }

    private func snooze() async {
        guard
            let activity = Activity<MedicationAttributes>.activities.first(where: { $0.id == activityId })
        else { return }
        let snoozedUntil = Date().addingTimeInterval(15 * 60)
        let next = MedicationAttributes.ContentState(
            status: "snoozed",
            dueAtSec: snoozedUntil.timeIntervalSince1970,
            snoozedUntilSec: snoozedUntil.timeIntervalSince1970,
            statusMessage: nil
        )
        let content = ActivityContent(state: next, staleDate: nil)
        await activity.update(content)
    }
}
