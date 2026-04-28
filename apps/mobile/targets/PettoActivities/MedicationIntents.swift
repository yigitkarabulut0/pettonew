import AppIntents
import ActivityKit
import Foundation

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
            detail: "med='\(medicationId)' pet='\(petId)' act='\(activityId)'"
        )

        // Activity'yi bulmak için 3 yol dene: önce activityId, yoksa
        // medicationId üzerinden attributes match, sonra "ilk aktif".
        // iOS bazen @Parameter deserialize'ı başarısız ediyor; bu fallback
        // o senaryoda da banner'ı dismiss etmemizi sağlıyor.
        let activity = await Self.findActivity(activityId: activityId, medicationId: medicationId)

        // Backend'e POST — petId/medicationId boşsa atlanır.
        if !petId.isEmpty && !medicationId.isEmpty {
            await BackendClient.post(
                path: "/v1/pets/\(petId)/medications/\(medicationId)/mark-given"
            )
        } else if let act = activity {
            // Param boş ama activity'den okuyabiliyorsak oradan
            await BackendClient.post(
                path: "/v1/pets/\(act.attributes.petId)/medications/\(act.attributes.medicationId)/mark-given"
            )
        } else {
            AppGroupAuth.recordIntent(
                name: "BackendClient.post",
                status: "skipped_empty_params",
                detail: ""
            )
        }

        if let activity = activity {
            await Self.endActivity(activity, status: "given")
        } else {
            AppGroupAuth.recordIntent(
                name: "endActivity",
                status: "not_found",
                detail: "id='\(activityId)' med='\(medicationId)'"
            )
        }
        return .result()
    }

    static func findActivity(activityId: String, medicationId: String) async -> Activity<MedicationAttributes>? {
        let all = Activity<MedicationAttributes>.activities
        if !activityId.isEmpty, let m = all.first(where: { $0.id == activityId }) {
            return m
        }
        if !medicationId.isEmpty, let m = all.first(where: { $0.attributes.medicationId == medicationId }) {
            return m
        }
        return all.first(where: { $0.activityState == .active })
    }

    static func endActivity(_ activity: Activity<MedicationAttributes>, status: String) async {
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
            detail: "act='\(activityId)'"
        )
        let activity = await MarkMedicationGivenIntent.findActivity(
            activityId: activityId,
            medicationId: ""
        )
        guard let activity = activity else {
            AppGroupAuth.recordIntent(name: "endActivity", status: "not_found", detail: "skip act='\(activityId)'")
            return .result()
        }
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
