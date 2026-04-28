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
            detail: "sched=\(scheduleId) pet=\(petId) act=\(activityId)"
        )
        await BackendClient.post(
            path: "/v1/pets/\(petId)/feeding/\(scheduleId)/log-now"
        )
        guard
            let activity = Activity<FeedingAttributes>.activities.first(where: { $0.id == activityId })
        else { return .result() }
        let now = Date().timeIntervalSince1970
        let final = FeedingAttributes.ContentState(
            status: "fed",
            dueAtSec: now,
            snoozedUntilSec: nil,
            statusMessage: nil
        )
        let content = ActivityContent(state: final, staleDate: nil)
        await activity.end(content, dismissalPolicy: .after(Date().addingTimeInterval(3)))
        return .result()
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
            detail: "act=\(activityId)"
        )
        guard
            let activity = Activity<FeedingAttributes>.activities.first(where: { $0.id == activityId })
        else { return .result() }
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
