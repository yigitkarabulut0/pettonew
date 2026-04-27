import ActivityKit
import Foundation

@available(iOS 16.2, *)
public struct PlaydateAttributes: ActivityAttributes {
    public typealias ContentState = State

    /// Times are stored as seconds-since-1970 doubles instead of `Date`.
    /// ActivityKit's default JSONDecoder treats `Date` as seconds-since
    /// -reference-date (2001-01-01) which silently mangles Unix-epoch
    /// timestamps coming in over `liveactivity` APNs pushes. Storing the
    /// raw double sidesteps that mismatch — views build a `Date` locally.
    public struct State: Codable, Hashable {
        public var status: String
        public var startsAtSec: Double
        public var endsAtSec: Double?
        public var attendeeCount: Int
        public var maxPets: Int
        public var firstAvatars: [String]
        public var waitlistPosition: Int?
        public var statusMessage: String?

        public var startsAt: Date { Date(timeIntervalSince1970: startsAtSec) }
        public var endsAt: Date? {
            endsAtSec.map { Date(timeIntervalSince1970: $0) }
        }

        public init(
            status: String,
            startsAtSec: Double,
            endsAtSec: Double? = nil,
            attendeeCount: Int,
            maxPets: Int,
            firstAvatars: [String] = [],
            waitlistPosition: Int? = nil,
            statusMessage: String? = nil
        ) {
            self.status = status
            self.startsAtSec = startsAtSec
            self.endsAtSec = endsAtSec
            self.attendeeCount = attendeeCount
            self.maxPets = maxPets
            self.firstAvatars = firstAvatars
            self.waitlistPosition = waitlistPosition
            self.statusMessage = statusMessage
        }
    }

    public var playdateId: String
    public var title: String
    public var city: String?
    public var hostName: String
    public var hostAvatar: String?
    public var emoji: String

    public init(
        playdateId: String,
        title: String,
        city: String? = nil,
        hostName: String,
        hostAvatar: String? = nil,
        emoji: String = "🐾"
    ) {
        self.playdateId = playdateId
        self.title = title
        self.city = city
        self.hostName = hostName
        self.hostAvatar = hostAvatar
        self.emoji = emoji
    }
}
