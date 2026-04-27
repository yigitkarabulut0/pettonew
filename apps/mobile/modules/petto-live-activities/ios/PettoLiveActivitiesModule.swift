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
            emoji: (dict["emoji"] as? String) ?? "🐾"
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
