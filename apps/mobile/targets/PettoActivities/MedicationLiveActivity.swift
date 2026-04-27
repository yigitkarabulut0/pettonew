import ActivityKit
import WidgetKit
import SwiftUI
import AppIntents

@available(iOS 16.2, *)
struct MedicationLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MedicationAttributes.self) { context in
            MedicationLockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    MedDIExpandedLeading(context: context)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    MedDIExpandedTrailing(context: context)
                }
                DynamicIslandExpandedRegion(.center) {
                    MedDIExpandedCenter(context: context)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    MedDIExpandedBottom(context: context)
                }
            } compactLeading: {
                Image(systemName: "pills.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(PettoTheme.accentLight)
                    .symbolRenderingMode(.hierarchical)
            } compactTrailing: {
                MedDICompactTrailing(context: context)
            } minimal: {
                Image(systemName: "pills.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(PettoTheme.accentLight)
                    .symbolRenderingMode(.hierarchical)
            }
            .keylineTint(PettoTheme.accentLight)
            .widgetURL(URL(string: "petto://pet-health/\(context.attributes.petId)"))
        }
    }
}

// MARK: - Lock Screen

@available(iOS 16.2, *)
struct MedicationLockScreenView: View {
    let context: ActivityViewContext<MedicationAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        let state = context.state
        let attrs = context.attributes
        let labels = attrs.labels
        let terminal = state.status == "given" || state.status == "skipped"

        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                MedicationHero(size: 52, scheme: scheme, status: state.status)

                VStack(alignment: .leading, spacing: 4) {
                    Text(attrs.medicationName)
                        .font(.system(.headline, design: .rounded).weight(.bold))
                        .foregroundColor(PettoTheme.textPrimary(for: scheme))
                        .strikethrough(terminal, color: PettoTheme.statusCancelled)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        Text(attrs.petName)
                            .font(.system(size: 12, weight: .heavy, design: .rounded))
                            .foregroundColor(PettoTheme.accent(for: scheme))
                        Text("·")
                            .font(.system(size: 9, weight: .black))
                            .foregroundColor(PettoTheme.textTertiary(for: scheme))
                        Text(attrs.dosage)
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundColor(PettoTheme.textSecondary(for: scheme))
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 6)

                MedStatusBadge(state: state, labels: labels, scheme: scheme)
            }

            if !terminal {
                Divider()
                    .background(PettoTheme.textTertiary(for: scheme).opacity(0.25))
                    .padding(.top, 11)
                    .padding(.bottom, 9)

                MedActionRow(
                    activityId: context.activityID,
                    petId: attrs.petId,
                    medicationId: attrs.medicationId,
                    labels: labels,
                    scheme: scheme,
                    full: true
                )
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(PettoTheme.background(for: scheme))
    }
}

// MARK: - DI

@available(iOS 16.2, *)
struct MedDIExpandedLeading: View {
    let context: ActivityViewContext<MedicationAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        MedicationHero(size: 32, scheme: scheme, status: context.state.status)
            .padding(.leading, 4)
    }
}

@available(iOS 16.2, *)
struct MedDIExpandedTrailing: View {
    let context: ActivityViewContext<MedicationAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        MedStatusBadge(
            state: context.state,
            labels: context.attributes.labels,
            scheme: scheme
        )
        .padding(.trailing, 4)
    }
}

@available(iOS 16.2, *)
struct MedDIExpandedCenter: View {
    let context: ActivityViewContext<MedicationAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(context.attributes.medicationName)
                .font(.system(.subheadline, design: .rounded).weight(.bold))
                .foregroundColor(PettoTheme.textPrimary(for: scheme))
                .lineLimit(1)
            HStack(spacing: 6) {
                Text(context.attributes.petName)
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .foregroundColor(PettoTheme.accent(for: scheme))
                Text(context.attributes.dosage)
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundColor(PettoTheme.textSecondary(for: scheme))
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 6)
    }
}

@available(iOS 16.2, *)
struct MedDIExpandedBottom: View {
    let context: ActivityViewContext<MedicationAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        let terminal = context.state.status == "given" || context.state.status == "skipped"
        if terminal {
            EmptyView()
        } else {
            MedActionRow(
                activityId: context.activityID,
                petId: context.attributes.petId,
                medicationId: context.attributes.medicationId,
                labels: context.attributes.labels,
                scheme: scheme,
                full: false
            )
            .padding(.horizontal, 4)
            .padding(.bottom, 2)
        }
    }
}

@available(iOS 16.2, *)
struct MedDICompactTrailing: View {
    let context: ActivityViewContext<MedicationAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        switch context.state.status {
        case "given":
            Image(systemName: "checkmark")
                .font(.system(size: 11, weight: .heavy))
                .foregroundColor(PettoTheme.statusActive)
        case "skipped":
            Image(systemName: "xmark")
                .font(.system(size: 11, weight: .heavy))
                .foregroundColor(PettoTheme.statusCancelled)
        case "snoozed":
            Image(systemName: "moon.zzz.fill")
                .font(.system(size: 11, weight: .heavy))
                .foregroundColor(PettoTheme.statusWaitlist)
        default:
            Circle()
                .fill(PettoTheme.accent(for: scheme))
                .frame(width: 8, height: 8)
        }
    }
}

// MARK: - Shared subviews

@available(iOS 16.2, *)
struct MedicationHero: View {
    let size: CGFloat
    let scheme: ColorScheme
    let status: String

    var body: some View {
        let icon: String
        let color: Color
        switch status {
        case "given":
            icon = "checkmark"
            color = PettoTheme.statusActive
        case "skipped":
            icon = "xmark"
            color = PettoTheme.statusCancelled
        case "snoozed":
            icon = "moon.zzz.fill"
            color = PettoTheme.statusWaitlist
        default:
            icon = "pills.fill"
            color = PettoTheme.accent(for: scheme)
        }

        return ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [
                            color.opacity(scheme == .dark ? 0.32 : 0.20),
                            color.opacity(scheme == .dark ? 0.18 : 0.08),
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            Image(systemName: icon)
                .font(.system(size: size * 0.46, weight: .heavy))
                .foregroundColor(color)
                .symbolRenderingMode(.hierarchical)
        }
        .frame(width: size, height: size)
    }
}

@available(iOS 16.2, *)
struct MedStatusBadge: View {
    let state: MedicationAttributes.ContentState
    let labels: MedicationAttributes.Labels
    let scheme: ColorScheme

    var body: some View {
        switch state.status {
        case "given":
            StatusPill(label: labels.completed, color: PettoTheme.statusActive)
        case "skipped":
            StatusPill(label: labels.skipped, color: PettoTheme.statusCancelled)
        case "snoozed":
            VStack(alignment: .trailing, spacing: 1) {
                if let until = state.snoozedUntil {
                    Text(timerInterval: Date()...until,
                         pauseTime: nil,
                         countsDown: true,
                         showsHours: false)
                        .font(.system(size: 18, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(PettoTheme.statusWaitlist)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .fixedSize()
                }
                Text(labels.snooze.uppercased())
                    .font(.system(size: 9, weight: .heavy, design: .rounded))
                    .tracking(0.7)
                    .foregroundColor(PettoTheme.textTertiary(for: scheme))
            }
        default:
            VStack(alignment: .trailing, spacing: 1) {
                Image(systemName: "bell.fill")
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundColor(PettoTheme.accent(for: scheme))
                Text(labels.due.uppercased())
                    .font(.system(size: 9, weight: .heavy, design: .rounded))
                    .tracking(0.7)
                    .foregroundColor(PettoTheme.textTertiary(for: scheme))
            }
        }
    }
}

// MARK: - Action row
//
// iOS 17+ → Button(intent:) — uygulamayı açmaz, App Intent extension
// process'inde çalışır.
// iOS 16.2-16.6 → fallback: Link with deep link, açıkken uygulama log atar.

@available(iOS 16.2, *)
struct MedActionRow: View {
    let activityId: String
    let petId: String
    let medicationId: String
    let labels: MedicationAttributes.Labels
    let scheme: ColorScheme
    let full: Bool

    var body: some View {
        HStack(spacing: 6) {
            if #available(iOS 17.0, *) {
                Button(intent: MarkMedicationGivenIntent(
                    activityId: activityId,
                    petId: petId,
                    medicationId: medicationId
                )) {
                    actionLabel(icon: "checkmark.circle.fill", text: labels.given, primary: true)
                }
                .buttonStyle(.plain)

                if full {
                    Button(intent: SomeoneElseMedicationIntent(
                        activityId: activityId,
                        petId: petId,
                        medicationId: medicationId
                    )) {
                        actionLabel(icon: "person.2.fill", text: labels.someoneElse, primary: false)
                    }
                    .buttonStyle(.plain)
                }

                Button(intent: SnoozeMedicationIntent(activityId: activityId)) {
                    actionLabel(icon: "moon.zzz.fill", text: labels.snooze, primary: false)
                }
                .buttonStyle(.plain)

                Button(intent: SkipMedicationIntent(activityId: activityId)) {
                    actionLabel(icon: "xmark", text: labels.skip, primary: false)
                }
                .buttonStyle(.plain)
            } else {
                // iOS 16 fallback — sadece deep link tap, açar log atar.
                Link(destination: URL(string: "petto://medication/\(medicationId)/given")!) {
                    actionLabel(icon: "checkmark.circle.fill", text: labels.given, primary: true)
                }
                Link(destination: URL(string: "petto://medication/\(medicationId)/skip")!) {
                    actionLabel(icon: "xmark", text: labels.skip, primary: false)
                }
            }
        }
    }

    @ViewBuilder
    private func actionLabel(icon: String, text: String, primary: Bool) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: full ? 11 : 10, weight: .heavy))
            Text(text)
                .font(.system(size: full ? 12 : 10, weight: .heavy, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .foregroundColor(primary ? .white : PettoTheme.accent(for: scheme))
        .padding(.horizontal, full ? 11 : 8)
        .padding(.vertical, full ? 7 : 5)
        .background(
            Capsule()
                .fill(primary ? PettoTheme.accent(for: scheme) : PettoTheme.accent(for: scheme).opacity(0.12))
        )
    }
}
