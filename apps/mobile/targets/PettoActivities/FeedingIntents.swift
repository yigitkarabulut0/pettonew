import AppIntents
import ActivityKit
import Foundation

/// "Mama verildi" — backend `/v1/pets/{petID}/feeding/{scheduleID}/log-now`
/// endpoint'ini POST ile çağırır (kalori sayacına bugünkü öğün düşer),
/// sonrasında activity'yi `fed` durumuna geçirir ve dismiss eder.
@available(iOS 17.0, *)
struct MarkFeedingDoneIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Mark feeding as done"

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
        await endActivity(status: "fed")
        return .result()
    }

    private func endActivity(status: String) async {
        guard
            let activity = Activity<FeedingAttributes>.activities.first(where: { $0.id == activityId })
        else { return }
        let now = Date().timeIntervalSince1970
        let final = FeedingAttributes.ContentState(
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
struct SkipFeedingIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Skip feeding"

    @Parameter(title: "Activity ID") var activityId: String

    init() {}
    init(activityId: String) { self.activityId = activityId }

    func perform() async throws -> some IntentResult {
        await endActivity()
        return .result()
    }

    private func endActivity() async {
        guard
            let activity = Activity<FeedingAttributes>.activities.first(where: { $0.id == activityId })
        else { return }
        let now = Date().timeIntervalSince1970
        let final = FeedingAttributes.ContentState(
            status: "skipped",
            dueAtSec: now,
            snoozedUntilSec: nil,
            statusMessage: nil
        )
        let content = ActivityContent(state: final, staleDate: nil)
        await activity.end(content, dismissalPolicy: .immediate)
    }
}

@available(iOS 17.0, *)
struct SnoozeFeedingIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Snooze feeding reminder"

    @Parameter(title: "Activity ID") var activityId: String

    init() {}
    init(activityId: String) { self.activityId = activityId }

    func perform() async throws -> some IntentResult {
        await snooze()
        return .result()
    }

    private func snooze() async {
        guard
            let activity = Activity<FeedingAttributes>.activities.first(where: { $0.id == activityId })
        else { return }
        let snoozedUntil = Date().addingTimeInterval(15 * 60)
        let next = FeedingAttributes.ContentState(
            status: "snoozed",
            dueAtSec: snoozedUntil.timeIntervalSince1970,
            snoozedUntilSec: snoozedUntil.timeIntervalSince1970,
            statusMessage: nil
        )
        let content = ActivityContent(state: next, staleDate: nil)
        await activity.update(content)
    }
}
