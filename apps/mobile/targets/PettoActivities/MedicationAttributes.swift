import ActivityKit
import Foundation

@available(iOS 16.2, *)
public struct MedicationAttributes: ActivityAttributes {
    public typealias ContentState = State

    public struct Labels: Codable, Hashable {
        public var due: String          // "Doz zamanı" / "Dose time"
        public var given: String        // "Verildi" / "Given"
        public var skip: String         // "Pas geç" / "Skip"
        public var someoneElse: String  // "Başkası verdi" / "Someone else"
        public var snooze: String       // "Ertele" / "Snooze"
        public var inProgress: String   // "Doz zamanı" / "Time to give"
        public var completed: String    // "Verildi" / "Given"
        public var skipped: String      // "Atlandı" / "Skipped"
        public var minutesShort: String // "dk" / "min"

        public init(
            due: String = "Doz zamanı",
            given: String = "Verildi",
            skip: String = "Pas geç",
            someoneElse: String = "Başkası verdi",
            snooze: String = "Ertele",
            inProgress: String = "Doz zamanı",
            completed: String = "Verildi",
            skipped: String = "Atlandı",
            minutesShort: String = "dk"
        ) {
            self.due = due
            self.given = given
            self.skip = skip
            self.someoneElse = someoneElse
            self.snooze = snooze
            self.inProgress = inProgress
            self.completed = completed
            self.skipped = skipped
            self.minutesShort = minutesShort
        }
    }

    public struct State: Codable, Hashable {
        public var status: String          // "due" | "given" | "skipped" | "snoozed"
        public var dueAtSec: Double         // when dose is/was due (Unix sec)
        public var snoozedUntilSec: Double? // if snoozed, when it'll reappear
        public var statusMessage: String?   // optional banner override

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

    public var medicationId: String
    public var petId: String
    public var medicationName: String  // "Antibiyotik"
    public var dosage: String          // "5mg" / "1 tablet"
    public var petName: String         // "Bora"
    public var labels: Labels

    public init(
        medicationId: String,
        petId: String,
        medicationName: String,
        dosage: String,
        petName: String,
        labels: Labels = Labels()
    ) {
        self.medicationId = medicationId
        self.petId = petId
        self.medicationName = medicationName
        self.dosage = dosage
        self.petName = petName
        self.labels = labels
    }
}
