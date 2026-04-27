import ActivityKit
import Foundation

@available(iOS 16.2, *)
public struct FeedingAttributes: ActivityAttributes {
    public typealias ContentState = State

    public struct Labels: Codable, Hashable {
        public var due: String
        public var fed: String
        public var skip: String
        public var snooze: String
        public var inProgress: String
        public var completed: String
        public var skipped: String
        public var minutesShort: String

        public init(
            due: String = "Mama saati",
            fed: String = "Verildi",
            skip: String = "Pas geç",
            snooze: String = "Ertele",
            inProgress: String = "Mama saati",
            completed: String = "Verildi",
            skipped: String = "Atlandı",
            minutesShort: String = "dk"
        ) {
            self.due = due
            self.fed = fed
            self.skip = skip
            self.snooze = snooze
            self.inProgress = inProgress
            self.completed = completed
            self.skipped = skipped
            self.minutesShort = minutesShort
        }
    }

    public struct State: Codable, Hashable {
        public var status: String
        public var dueAtSec: Double
        public var snoozedUntilSec: Double?
        public var statusMessage: String?

        public init(
            status: String,
            dueAtSec: Double,
            snoozedUntilSec: Double? = nil,
            statusMessage: String? = nil
        ) {
            self.status = status
            self.dueAtSec = dueAtSec
            self.snoozedUntilSec = snoozedUntilSec
            self.statusMessage = statusMessage
        }
    }

    public var scheduleId: String
    public var petId: String
    public var mealName: String
    public var foodType: String
    public var amount: String
    public var petName: String
    public var labels: Labels

    public init(
        scheduleId: String,
        petId: String,
        mealName: String,
        foodType: String,
        amount: String,
        petName: String,
        labels: Labels = Labels()
    ) {
        self.scheduleId = scheduleId
        self.petId = petId
        self.mealName = mealName
        self.foodType = foodType
        self.amount = amount
        self.petName = petName
        self.labels = labels
    }
}
