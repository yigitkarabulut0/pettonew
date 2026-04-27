import WidgetKit
import SwiftUI

@main
struct PettoActivitiesBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.2, *) {
            PlaydateLiveActivity()
            MedicationLiveActivity()
            FeedingLiveActivity()
        }
    }
}
