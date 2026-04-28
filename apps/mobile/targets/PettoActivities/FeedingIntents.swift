import AppIntents
import ActivityKit
import Foundation

@available(iOS 17.0, *)
struct MarkFeedingDoneIntent: AppIntent, LiveActivityIntent {
    static var title: LocalizedStringResource = "Mark feeding as done"
    static let openAppWhenRun: Bool = false
    static let isDiscoverable: Bool = false

    @Parameter(title: "Activity ID") var activityId: String
    @Parameter(title: "Pet ID") var petId: String
    @Parameter(title: "Schedule ID") var scheduleId: String

    init() {
        self.activityId = ""
        self.petId = ""
        self.scheduleId = ""
    }
    init(activityId: String, petId: String, scheduleId: String) {
        self.activityId = activityId
        self.petId = petId
        self.scheduleId = scheduleId
    }

    func perform() async throws -> some IntentResult {
        AppGroupAuth.recordIntent(
            name: "MarkFeedingDoneIntent",
            status: "fired",
            detail: "sched='\(scheduleId)' pet='\(petId)' act='\(activityId)'"
        )
        let activity = Self.findActivity(activityId: activityId, scheduleId: scheduleId)
        AppGroupAuth.enqueueFeedingAction(
            action: "fed",
            scheduleId: scheduleId.isEmpty ? (activity?.attributes.scheduleId ?? "") : scheduleId,
            petId: petId.isEmpty ? (activity?.attributes.petId ?? "") : petId
        )

        if !petId.isEmpty && !scheduleId.isEmpty {
            await BackendClient.post(
                path: "/v1/pets/\(petId)/feeding/\(scheduleId)/log-now"
            )
        } else if let act = activity {
            await BackendClient.post(
                path: "/v1/pets/\(act.attributes.petId)/feeding/\(act.attributes.scheduleId)/log-now"
            )
        }

        if let activity = activity {
            let now = Date().timeIntervalSince1970
            let final = FeedingAttributes.ContentState(
                status: "fed",
                dueAtSec: now,
                snoozedUntilSec: nil,
                statusMessage: nil
            )
            let content = ActivityContent(state: final, staleDate: nil)
            await activity.end(content, dismissalPolicy: .after(Date().addingTimeInterval(3)))
        } else {
            AppGroupAuth.recordIntent(
                name: "endFeedingActivity",
                status: "not_found",
                detail: "id='\(activityId)' sched='\(scheduleId)'"
            )
        }
        return .result()
    }

    static func findActivity(activityId: String, scheduleId: String) -> Activity<FeedingAttributes>? {
        let all = Activity<FeedingAttributes>.activities
        if !activityId.isEmpty, let m = all.first(where: { $0.id == activityId }) {
            return m
        }
        if !scheduleId.isEmpty, let m = all.first(where: { $0.attributes.scheduleId == scheduleId }) {
            return m
        }
        return all.first(where: { $0.activityState == .active })
    }
}

@available(iOS 17.0, *)
struct SkipFeedingIntent: AppIntent, LiveActivityIntent {
    static var title: LocalizedStringResource = "Skip feeding"
    static let openAppWhenRun: Bool = false
    static let isDiscoverable: Bool = false

    @Parameter(title: "Activity ID") var activityId: String

    init() { self.activityId = "" }
    init(activityId: String) { self.activityId = activityId }

    func perform() async throws -> some IntentResult {
        AppGroupAuth.recordIntent(
            name: "SkipFeedingIntent",
            status: "fired",
            detail: "act='\(activityId)'"
        )
        let activity = MarkFeedingDoneIntent.findActivity(activityId: activityId, scheduleId: "")
        AppGroupAuth.enqueueFeedingAction(
            action: "skipped",
            scheduleId: activity?.attributes.scheduleId ?? "",
            petId: activity?.attributes.petId ?? ""
        )
        guard let activity = activity else {
            AppGroupAuth.recordIntent(name: "endFeedingActivity", status: "not_found", detail: "skip (queued)")
            return .result()
        }
        let now = Date().timeIntervalSince1970
        let final = FeedingAttributes.ContentState(
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
