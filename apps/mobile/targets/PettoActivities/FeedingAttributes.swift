import ActivityKit
import Foundation

@available(iOS 16.2, *)
public struct FeedingAttributes: ActivityAttributes {
    public typealias ContentState = State

    public struct Labels: Codable, Hashable {
        public var due: String          // "Mama saati"
        public var fed: String          // "Verildi"
        public var skip: String         // "Pas geç"
        public var snooze: String       // "Ertele"
        public var inProgress: String   // "Mama saati"
        public var completed: String    // "Verildi"
        public var skipped: String      // "Atlandı"
        public var minutesShort: String // "dk"

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
        public var status: String           // "due" | "fed" | "skipped" | "snoozed"
        public var dueAtSec: Double
        public var snoozedUntilSec: Double?
        public var statusMessage: String?

        public var dueAt: Date { Date(timeIntervalSince1970: dueAtSec) }
        public var snoozedUntil: Date? {
            snoozedUntilSec.map { Date(timeIntervalSince1970: $0) }
        }

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
    public var mealName: String      // "Akşam yemeği"
    public var foodType: String      // "Royal Canin"
    public var amount: String        // "100g"
    public var petName: String       // "Bora"
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
