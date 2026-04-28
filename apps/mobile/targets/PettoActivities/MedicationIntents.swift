import AppIntents
import ActivityKit
import Foundation

// Apple WWDC23 patternine en yakın haliyle: minimum boilerplate, default
// parametre değerleri, openAppWhenRun=false. Her perform() başında App
// Group'a "tetiklendim" notu yazıyor — app tarafı bunu okuyup butonların
// gerçekten çağırılıp çağırılmadığını teyit edebilir.

@available(iOS 17.0, *)
struct MarkMedicationGivenIntent: AppIntent, LiveActivityIntent {
    static var title: LocalizedStringResource = "Mark medication as given"
    static let openAppWhenRun: Bool = false
    static let isDiscoverable: Bool = false

    @Parameter(title: "Activity ID") var activityId: String
    @Parameter(title: "Pet ID") var petId: String
    @Parameter(title: "Medication ID") var medicationId: String

    init() {
        self.activityId = ""
        self.petId = ""
        self.medicationId = ""
    }
    init(activityId: String, petId: String, medicationId: String) {
        self.activityId = activityId
        self.petId = petId
        self.medicationId = medicationId
    }

    func perform() async throws -> some IntentResult {
        AppGroupAuth.recordIntent(
            name: "MarkMedicationGivenIntent",
            status: "fired",
            detail: "med=\(medicationId) pet=\(petId) act=\(activityId)"
        )
        let ok = await BackendClient.post(
            path: "/v1/pets/\(petId)/medications/\(medicationId)/mark-given"
        )
        await Self.endActivity(activityId: activityId, status: ok ? "given" : "given")
        return .result()
    }

    static func endActivity(activityId: String, status: String) async {
        guard
            let activity = Activity<MedicationAttributes>.activities.first(where: { $0.id == activityId })
        else {
            AppGroupAuth.recordIntent(name: "endActivity", status: "not_found", detail: activityId)
            return
        }
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

@available(iOS 17.0, *)
struct SkipMedicationIntent: AppIntent, LiveActivityIntent {
    static var title: LocalizedStringResource = "Skip medication dose"
    static let openAppWhenRun: Bool = false
    static let isDiscoverable: Bool = false

    @Parameter(title: "Activity ID") var activityId: String

    init() { self.activityId = "" }
    init(activityId: String) { self.activityId = activityId }

    func perform() async throws -> some IntentResult {
        AppGroupAuth.recordIntent(
            name: "SkipMedicationIntent",
            status: "fired",
            detail: "act=\(activityId)"
        )
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
