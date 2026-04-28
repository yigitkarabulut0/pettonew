import AppIntents
import ActivityKit
import Foundation

/// "İlaç verildi" — Live Activity buton tap'inde tetiklenir. iOS 17+'da
/// `openAppWhenRun = false` sayesinde app açılmadan extension process'inde
/// çalışır: backend'e mark-given POST atar, sonra activity'yi `given`
/// durumuna geçirip 3 saniye içinde dismiss eder.
@available(iOS 17.0, *)
struct MarkMedicationGivenIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Mark medication as given"
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false

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
        await Self.endActivity(activityId: activityId, status: "given")
        return .result()
    }

    static func endActivity(activityId: String, status: String) async {
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
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false

    @Parameter(title: "Activity ID") var activityId: String

    init() {}
    init(activityId: String) { self.activityId = activityId }

    func perform() async throws -> some IntentResult {
        guard
            let activity = Activity<MedicationAttributes>.activities.first(where: { $0.id == activityId })
        else { return .result() }
        let now = Date().timeIntervalSince1970
        let final = MedicationAttributes.ContentState(
            status: "skipped",
            dueAtSec: now,
            snoozedUntilSec: nil,
            statusMessage: nil
        )
        let content = ActivityContent(state: final, staleDate: nil)
        await activity.end(content, dismissalPolicy: .immediate)
        return .result()
    }
}
