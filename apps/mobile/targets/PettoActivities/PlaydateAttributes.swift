import ActivityKit
import Foundation

@available(iOS 16.2, *)
public struct PlaydateAttributes: ActivityAttributes {
    public typealias ContentState = State

    /// All translated strings the views render. Set once at start time —
    /// attributes don't change for the life of the activity. JS side fills
    /// this based on i18next current language so the lock screen / Dynamic
    /// Island always match the device locale.
    public struct Labels: Codable, Hashable {
        public var left: String          // "kala" / "left"
        public var inProgress: String    // "Devam ediyor" / "In progress"
        public var cancelled: String     // "İptal" / "Cancelled"
        public var ended: String         // "Bitti" / "Ended"
        public var live: String          // "Canlı" / "Live"
        public var friends: String       // "dost" / "friends"
        public var queue: String         // "sırada" / "in queue"
        public var directions: String    // "Yol Tarifi" / "Directions"
        public var directionsShort: String // "Yol" / "Map"
        public var playdateBy: String    // "{host}'un buluşması" / "{host}'s playdate"

        public init(
            left: String = "kala",
            inProgress: String = "Devam ediyor",
            cancelled: String = "İptal",
            ended: String = "Bitti",
            live: String = "Canlı",
            friends: String = "dost",
            queue: String = "sırada",
            directions: String = "Yol Tarifi",
            directionsShort: String = "Yol",
            playdateBy: String = "buluşması"
        ) {
            self.left = left
            self.inProgress = inProgress
            self.cancelled = cancelled
            self.ended = ended
            self.live = live
            self.friends = friends
            self.queue = queue
            self.directions = directions
            self.directionsShort = directionsShort
            self.playdateBy = playdateBy
        }
    }

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
    public var labels: Labels

    public init(
        playdateId: String,
        title: String,
        city: String? = nil,
        hostName: String,
        hostAvatar: String? = nil,
        emoji: String = "🐾",
        labels: Labels = Labels()
    ) {
        self.playdateId = playdateId
        self.title = title
        self.city = city
        self.hostName = hostName
        self.hostAvatar = hostAvatar
        self.emoji = emoji
        self.labels = labels
    }
}
