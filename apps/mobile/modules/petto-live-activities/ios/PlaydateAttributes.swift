import ActivityKit
import Foundation

@available(iOS 16.2, *)
public struct PlaydateAttributes: ActivityAttributes {
    public typealias ContentState = State

    public struct Labels: Codable, Hashable {
        public var left: String
        public var inProgress: String
        public var cancelled: String
        public var ended: String
        public var live: String
        public var friends: String
        public var queue: String
        public var directions: String
        public var directionsShort: String
        public var playdateBy: String

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

    public struct State: Codable, Hashable {
        public var status: String
        public var startsAtSec: Double
        public var endsAtSec: Double?
        public var attendeeCount: Int
        public var maxPets: Int
        public var firstAvatars: [String]
        public var waitlistPosition: Int?
        public var statusMessage: String?

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
