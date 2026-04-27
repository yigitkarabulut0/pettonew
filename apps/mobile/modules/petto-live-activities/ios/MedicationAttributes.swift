import ActivityKit
import Foundation

@available(iOS 16.2, *)
public struct MedicationAttributes: ActivityAttributes {
    public typealias ContentState = State

    public struct Labels: Codable, Hashable {
        public var due: String
        public var given: String
        public var skip: String
        public var someoneElse: String
        public var snooze: String
        public var inProgress: String
        public var completed: String
        public var skipped: String
        public var minutesShort: String

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

    public var medicationId: String
    public var petId: String
    public var medicationName: String
    public var dosage: String
    public var petName: String
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
