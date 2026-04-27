import ExpoModulesCore
import ActivityKit
import Foundation

public class PettoLiveActivitiesModule: Module {
    private var pushTokenTasks: [String: Task<Void, Never>] = [:]
    private var pushToStartTask: Task<Void, Never>?

    public func definition() -> ModuleDefinition {
        Name("PettoLiveActivities")

        Events("onPushToStartToken", "onActivityPushToken", "onActivityEnded")

        OnCreate {
            if #available(iOS 17.2, *) {
                self.startObservingPushToStart()
            }
        }

        OnDestroy {
            self.pushToStartTask?.cancel()
            for task in self.pushTokenTasks.values { task.cancel() }
            self.pushTokenTasks.removeAll()
        }

        AsyncFunction("isSupported") { () -> Bool in
            if #available(iOS 16.2, *) {
                return ActivityAuthorizationInfo().areActivitiesEnabled
            }
            return false
        }

        AsyncFunction("startPlaydate") { (input: [String: Any]) -> String in
            guard #available(iOS 16.2, *) else {
                throw LiveActivityError.unsupportedOS
            }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                throw LiveActivityError.notAuthorized
            }

            let attributes = try Self.parseAttributes(from: input["attributes"])
            let state = try Self.parseState(from: input["state"])
            let staleAt = (input["staleAt"] as? Double).map { Date(timeIntervalSince1970: $0) }

            let content = ActivityContent(state: state, staleDate: staleAt)
            let activity: Activity<PlaydateAttributes>
            if #available(iOS 16.2, *) {
                activity = try Activity<PlaydateAttributes>.request(
                    attributes: attributes,
                    content: content,
                    pushType: .token
                )
            } else {
                throw LiveActivityError.unsupportedOS
            }

            self.observePushToken(for: activity)
            self.observeStateUpdates(for: activity)
            return activity.id
        }

        AsyncFunction("updatePlaydate") { (activityId: String, stateInput: [String: Any]) -> Void in
            guard #available(iOS 16.2, *) else { return }
            guard let activity = Activity<PlaydateAttributes>.activities.first(where: { $0.id == activityId }) else {
                throw LiveActivityError.notFound
            }
            let state = try Self.parseState(from: stateInput)
            let content = ActivityContent(state: state, staleDate: nil)
            await activity.update(content)
        }

        AsyncFunction("endPlaydate") { (activityId: String, stateInput: [String: Any]?, dismissAfterSeconds: Double?) -> Void in
            guard #available(iOS 16.2, *) else { return }
            guard let activity = Activity<PlaydateAttributes>.activities.first(where: { $0.id == activityId }) else {
                return
            }
            let finalState: ActivityContent<PlaydateAttributes.ContentState>?
            if let stateInput = stateInput {
                let state = try Self.parseState(from: stateInput)
                finalState = ActivityContent(state: state, staleDate: nil)
            } else {
                finalState = nil
            }

            let policy: ActivityUIDismissalPolicy
            if let secs = dismissAfterSeconds {
                if secs <= 0 {
                    policy = .immediate
                } else {
                    policy = .after(Date().addingTimeInterval(secs))
                }
            } else {
                policy = .default
            }
            await activity.end(finalState, dismissalPolicy: policy)
            self.pushTokenTasks[activityId]?.cancel()
            self.pushTokenTasks.removeValue(forKey: activityId)
        }

        AsyncFunction("listActive") { () -> [[String: Any]] in
            guard #available(iOS 16.2, *) else { return [] }
            return Activity<PlaydateAttributes>.activities.map { activity in
                [
                    "id": activity.id,
                    "playdateId": activity.attributes.playdateId,
                    "status": activity.activityState == .active ? "active"
                            : activity.activityState == .ended ? "ended"
                            : activity.activityState == .dismissed ? "dismissed"
                            : "stale"
                ]
            }
        }

        // MARK: - Medication

        AsyncFunction("startMedication") { (input: [String: Any]) -> String in
            guard #available(iOS 16.2, *) else { throw LiveActivityError.unsupportedOS }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                throw LiveActivityError.notAuthorized
            }
            let attributes = try Self.parseMedicationAttributes(from: input["attributes"])
            let state = try Self.parseMedicationState(from: input["state"])
            let staleAt = (input["staleAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
            let content = ActivityContent(state: state, staleDate: staleAt)
            let activity = try Activity<MedicationAttributes>.request(
                attributes: attributes,
                content: content,
                pushType: .token
            )
            return activity.id
        }

        AsyncFunction("updateMedication") { (activityId: String, stateInput: [String: Any]) -> Void in
            guard #available(iOS 16.2, *) else { return }
            guard let activity = Activity<MedicationAttributes>.activities.first(where: { $0.id == activityId }) else {
                throw LiveActivityError.notFound
            }
            let state = try Self.parseMedicationState(from: stateInput)
            let content = ActivityContent(state: state, staleDate: nil)
            await activity.update(content)
        }

        AsyncFunction("endMedication") { (activityId: String, stateInput: [String: Any]?, dismissAfterSeconds: Double?) -> Void in
            guard #available(iOS 16.2, *) else { return }
            guard let activity = Activity<MedicationAttributes>.activities.first(where: { $0.id == activityId }) else { return }
            let finalState: ActivityContent<MedicationAttributes.ContentState>?
            if let stateInput = stateInput {
                let state = try Self.parseMedicationState(from: stateInput)
                finalState = ActivityContent(state: state, staleDate: nil)
            } else { finalState = nil }
            let policy: ActivityUIDismissalPolicy = (dismissAfterSeconds ?? -1) <= 0
                ? .immediate
                : .after(Date().addingTimeInterval(dismissAfterSeconds!))
            await activity.end(finalState, dismissalPolicy: policy)
        }

        AsyncFunction("listActiveMedications") { () -> [[String: Any]] in
            guard #available(iOS 16.2, *) else { return [] }
            return Activity<MedicationAttributes>.activities.map { activity in
                [
                    "id": activity.id,
                    "medicationId": activity.attributes.medicationId,
                    "petId": activity.attributes.petId,
                    "status": activity.activityState == .active ? "active"
                            : activity.activityState == .ended ? "ended"
                            : "dismissed"
                ]
            }
        }

        // MARK: - Feeding

        AsyncFunction("startFeeding") { (input: [String: Any]) -> String in
            guard #available(iOS 16.2, *) else { throw LiveActivityError.unsupportedOS }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                throw LiveActivityError.notAuthorized
            }
            let attributes = try Self.parseFeedingAttributes(from: input["attributes"])
            let state = try Self.parseFeedingState(from: input["state"])
            let staleAt = (input["staleAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
            let content = ActivityContent(state: state, staleDate: staleAt)
            let activity = try Activity<FeedingAttributes>.request(
                attributes: attributes,
                content: content,
                pushType: .token
            )
            return activity.id
        }

        AsyncFunction("updateFeeding") { (activityId: String, stateInput: [String: Any]) -> Void in
            guard #available(iOS 16.2, *) else { return }
            guard let activity = Activity<FeedingAttributes>.activities.first(where: { $0.id == activityId }) else {
                throw LiveActivityError.notFound
            }
            let state = try Self.parseFeedingState(from: stateInput)
            let content = ActivityContent(state: state, staleDate: nil)
            await activity.update(content)
        }

        AsyncFunction("endFeeding") { (activityId: String, stateInput: [String: Any]?, dismissAfterSeconds: Double?) -> Void in
            guard #available(iOS 16.2, *) else { return }
            guard let activity = Activity<FeedingAttributes>.activities.first(where: { $0.id == activityId }) else { return }
            let finalState: ActivityContent<FeedingAttributes.ContentState>?
            if let stateInput = stateInput {
                let state = try Self.parseFeedingState(from: stateInput)
                finalState = ActivityContent(state: state, staleDate: nil)
            } else { finalState = nil }
            let policy: ActivityUIDismissalPolicy = (dismissAfterSeconds ?? -1) <= 0
                ? .immediate
                : .after(Date().addingTimeInterval(dismissAfterSeconds!))
            await activity.end(finalState, dismissalPolicy: policy)
        }

        AsyncFunction("listActiveFeedings") { () -> [[String: Any]] in
            guard #available(iOS 16.2, *) else { return [] }
            return Activity<FeedingAttributes>.activities.map { activity in
                [
                    "id": activity.id,
                    "scheduleId": activity.attributes.scheduleId,
                    "petId": activity.attributes.petId,
                    "status": activity.activityState == .active ? "active"
                            : activity.activityState == .ended ? "ended"
                            : "dismissed"
                ]
            }
        }

        // MARK: - App Group auth bridge
        //
        // App Intent'lar (Mark given / Mark fed) extension process'inde
        // çalışır ve backend'e doğrudan POST atar; bunun için access token
        // ile API base URL'sini App Group UserDefaults üzerinden almaları
        // gerekir. JS tarafı login/logout'ta bu metodu çağırarak köprüyü
        // canlı tutar.

        AsyncFunction("setAppGroupAuth") { (accessToken: String?, apiBaseUrl: String?) -> Void in
            let suite = "group.app.petto.shared"
            let d = UserDefaults(suiteName: suite)
            if let t = accessToken, !t.isEmpty {
                d?.set(t, forKey: "petto.accessToken")
            } else {
                d?.removeObject(forKey: "petto.accessToken")
            }
            if let u = apiBaseUrl, !u.isEmpty {
                d?.set(u, forKey: "petto.apiBaseUrl")
            } else {
                d?.removeObject(forKey: "petto.apiBaseUrl")
            }
        }
    }

    @available(iOS 17.2, *)
    private func startObservingPushToStart() {
        pushToStartTask = Task { [weak self] in
            for await tokenData in Activity<PlaydateAttributes>.pushToStartTokenUpdates {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                self?.sendEvent("onPushToStartToken", [
                    "kind": "playdate",
                    "token": token
                ])
            }
        }
    }

    @available(iOS 16.2, *)
    private func observePushToken(for activity: Activity<PlaydateAttributes>) {
        let id = activity.id
        let task = Task { [weak self] in
            for await tokenData in activity.pushTokenUpdates {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                self?.sendEvent("onActivityPushToken", [
                    "activityId": id,
                    "kind": "playdate",
                    "playdateId": activity.attributes.playdateId,
                    "token": token
                ])
            }
        }
        pushTokenTasks[id] = task
    }

    @available(iOS 16.2, *)
    private func observeStateUpdates(for activity: Activity<PlaydateAttributes>) {
        let id = activity.id
        Task { [weak self] in
            for await state in activity.activityStateUpdates {
                if state == .ended || state == .dismissed {
                    self?.sendEvent("onActivityEnded", [
                        "activityId": id,
                        "state": state == .ended ? "ended" : "dismissed"
                    ])
                    self?.pushTokenTasks[id]?.cancel()
                    self?.pushTokenTasks.removeValue(forKey: id)
                    break
                }
            }
        }
    }

    @available(iOS 16.2, *)
    private static func parseAttributes(from raw: Any?) throws -> PlaydateAttributes {
        guard let dict = raw as? [String: Any] else {
            throw LiveActivityError.invalidPayload("attributes missing")
        }
        guard let playdateId = dict["playdateId"] as? String,
              let title = dict["title"] as? String,
              let hostName = dict["hostName"] as? String else {
            throw LiveActivityError.invalidPayload("attributes incomplete")
        }
        return PlaydateAttributes(
            playdateId: playdateId,
            title: title,
            city: dict["city"] as? String,
            hostName: hostName,
            hostAvatar: dict["hostAvatar"] as? String,
            emoji: (dict["emoji"] as? String) ?? "🐾",
            labels: parseLabels(from: dict["labels"])
        )
    }

    @available(iOS 16.2, *)
    private static func parseLabels(from raw: Any?) -> PlaydateAttributes.Labels {
        // No labels passed → fall back to defaults (Turkish baseline). Any
        // missing key inside the labels dict also falls back to its default.
        let defaults = PlaydateAttributes.Labels()
        guard let dict = raw as? [String: Any] else { return defaults }
        return PlaydateAttributes.Labels(
            left: (dict["left"] as? String) ?? defaults.left,
            inProgress: (dict["inProgress"] as? String) ?? defaults.inProgress,
            cancelled: (dict["cancelled"] as? String) ?? defaults.cancelled,
            ended: (dict["ended"] as? String) ?? defaults.ended,
            live: (dict["live"] as? String) ?? defaults.live,
            friends: (dict["friends"] as? String) ?? defaults.friends,
            queue: (dict["queue"] as? String) ?? defaults.queue,
            directions: (dict["directions"] as? String) ?? defaults.directions,
            directionsShort: (dict["directionsShort"] as? String) ?? defaults.directionsShort,
            playdateBy: (dict["playdateBy"] as? String) ?? defaults.playdateBy
        )
    }

    @available(iOS 16.2, *)
    private static func parseState(from raw: Any?) throws -> PlaydateAttributes.ContentState {
        guard let dict = raw as? [String: Any] else {
            throw LiveActivityError.invalidPayload("state missing")
        }
        guard let status = dict["status"] as? String,
              let startsAtSec = dict["startsAt"] as? Double,
              let attendeeCount = dict["attendeeCount"] as? Int,
              let maxPets = dict["maxPets"] as? Int else {
            throw LiveActivityError.invalidPayload("state incomplete")
        }
        let endsAtSec = dict["endsAt"] as? Double
        let avatars = (dict["firstAvatars"] as? [String]) ?? []
        let waitlist = dict["waitlistPosition"] as? Int
        let msg = dict["statusMessage"] as? String

        return PlaydateAttributes.ContentState(
            status: status,
            startsAtSec: startsAtSec,
            endsAtSec: endsAtSec,
            attendeeCount: attendeeCount,
            maxPets: maxPets,
            firstAvatars: avatars,
            waitlistPosition: waitlist,
            statusMessage: msg
        )
    }

    // MARK: - Medication parsers

    @available(iOS 16.2, *)
    private static func parseMedicationAttributes(from raw: Any?) throws -> MedicationAttributes {
        guard let dict = raw as? [String: Any] else {
            throw LiveActivityError.invalidPayload("medication attributes missing")
        }
        guard let medicationId = dict["medicationId"] as? String,
              let petId = dict["petId"] as? String,
              let medicationName = dict["medicationName"] as? String,
              let petName = dict["petName"] as? String else {
            throw LiveActivityError.invalidPayload("medication attributes incomplete")
        }
        return MedicationAttributes(
            medicationId: medicationId,
            petId: petId,
            medicationName: medicationName,
            dosage: (dict["dosage"] as? String) ?? "",
            petName: petName,
            labels: parseMedicationLabels(from: dict["labels"])
        )
    }

    @available(iOS 16.2, *)
    private static func parseMedicationLabels(from raw: Any?) -> MedicationAttributes.Labels {
        let d = MedicationAttributes.Labels()
        guard let dict = raw as? [String: Any] else { return d }
        return MedicationAttributes.Labels(
            due: (dict["due"] as? String) ?? d.due,
            given: (dict["given"] as? String) ?? d.given,
            skip: (dict["skip"] as? String) ?? d.skip,
            someoneElse: (dict["someoneElse"] as? String) ?? d.someoneElse,
            snooze: (dict["snooze"] as? String) ?? d.snooze,
            inProgress: (dict["inProgress"] as? String) ?? d.inProgress,
            completed: (dict["completed"] as? String) ?? d.completed,
            skipped: (dict["skipped"] as? String) ?? d.skipped,
            minutesShort: (dict["minutesShort"] as? String) ?? d.minutesShort
        )
    }

    @available(iOS 16.2, *)
    private static func parseMedicationState(from raw: Any?) throws -> MedicationAttributes.ContentState {
        guard let dict = raw as? [String: Any] else {
            throw LiveActivityError.invalidPayload("medication state missing")
        }
        guard let status = dict["status"] as? String,
              let dueAtSec = dict["dueAt"] as? Double else {
            throw LiveActivityError.invalidPayload("medication state incomplete")
        }
        return MedicationAttributes.ContentState(
            status: status,
            dueAtSec: dueAtSec,
            snoozedUntilSec: dict["snoozedUntil"] as? Double,
            statusMessage: dict["statusMessage"] as? String
        )
    }

    // MARK: - Feeding parsers

    @available(iOS 16.2, *)
    private static func parseFeedingAttributes(from raw: Any?) throws -> FeedingAttributes {
        guard let dict = raw as? [String: Any] else {
            throw LiveActivityError.invalidPayload("feeding attributes missing")
        }
        guard let scheduleId = dict["scheduleId"] as? String,
              let petId = dict["petId"] as? String,
              let mealName = dict["mealName"] as? String,
              let petName = dict["petName"] as? String else {
            throw LiveActivityError.invalidPayload("feeding attributes incomplete")
        }
        return FeedingAttributes(
            scheduleId: scheduleId,
            petId: petId,
            mealName: mealName,
            foodType: (dict["foodType"] as? String) ?? "",
            amount: (dict["amount"] as? String) ?? "",
            petName: petName,
            labels: parseFeedingLabels(from: dict["labels"])
        )
    }

    @available(iOS 16.2, *)
    private static func parseFeedingLabels(from raw: Any?) -> FeedingAttributes.Labels {
        let d = FeedingAttributes.Labels()
        guard let dict = raw as? [String: Any] else { return d }
        return FeedingAttributes.Labels(
            due: (dict["due"] as? String) ?? d.due,
            fed: (dict["fed"] as? String) ?? d.fed,
            skip: (dict["skip"] as? String) ?? d.skip,
            snooze: (dict["snooze"] as? String) ?? d.snooze,
            inProgress: (dict["inProgress"] as? String) ?? d.inProgress,
            completed: (dict["completed"] as? String) ?? d.completed,
            skipped: (dict["skipped"] as? String) ?? d.skipped,
            minutesShort: (dict["minutesShort"] as? String) ?? d.minutesShort
        )
    }

    @available(iOS 16.2, *)
    private static func parseFeedingState(from raw: Any?) throws -> FeedingAttributes.ContentState {
        guard let dict = raw as? [String: Any] else {
            throw LiveActivityError.invalidPayload("feeding state missing")
        }
        guard let status = dict["status"] as? String,
              let dueAtSec = dict["dueAt"] as? Double else {
            throw LiveActivityError.invalidPayload("feeding state incomplete")
        }
        return FeedingAttributes.ContentState(
            status: status,
            dueAtSec: dueAtSec,
            snoozedUntilSec: dict["snoozedUntil"] as? Double,
            statusMessage: dict["statusMessage"] as? String
        )
    }
}

enum LiveActivityError: Error, LocalizedError {
    case unsupportedOS
    case notAuthorized
    case notFound
    case invalidPayload(String)

    var errorDescription: String? {
        switch self {
        case .unsupportedOS: return "Live Activities require iOS 16.2 or later."
        case .notAuthorized: return "Live Activities are disabled in Settings."
        case .notFound: return "Activity not found."
        case .invalidPayload(let detail): return "Invalid payload: \(detail)"
        }
    }
}
