import AppIntents
import ActivityKit
import Foundation

@available(iOS 17.0, *)
struct MarkFeedingDoneIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Mark feeding as done"
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false

    @Parameter(title: "Activity ID") var activityId: String
    @Parameter(title: "Pet ID") var petId: String
    @Parameter(title: "Schedule ID") var scheduleId: String

    init() {}
    init(activityId: String, petId: String, scheduleId: String) {
        self.activityId = activityId
        self.petId = petId
        self.scheduleId = scheduleId
    }

    func perform() async throws -> some IntentResult {
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
struct SkipFeedingIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Skip feeding"
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false

    @Parameter(title: "Activity ID") var activityId: String

    init() {}
    init(activityId: String) { self.activityId = activityId }

    func perform() async throws -> some IntentResult {
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
