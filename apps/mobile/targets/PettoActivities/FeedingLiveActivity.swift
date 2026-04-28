import ActivityKit
import WidgetKit
import SwiftUI
import AppIntents

@available(iOS 16.2, *)
struct FeedingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FeedingAttributes.self) { context in
            FeedingLockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    FeedDIExpandedLeading(context: context)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    FeedDIExpandedTrailing(context: context)
                }
                DynamicIslandExpandedRegion(.center) {
                    FeedDIExpandedCenter(context: context)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    FeedDIExpandedBottom(context: context)
                }
            } compactLeading: {
                Image(systemName: "fork.knife")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(PettoTheme.accentLight)
                    .symbolRenderingMode(.hierarchical)
            } compactTrailing: {
                FeedDICompactTrailing(context: context)
            } minimal: {
                Image(systemName: "fork.knife")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(PettoTheme.accentLight)
                    .symbolRenderingMode(.hierarchical)
            }
            .keylineTint(PettoTheme.accentLight)
            .widgetURL(URL(string: "petto://calories/\(context.attributes.petId)"))
        }
    }
}

@available(iOS 16.2, *)
struct FeedingLockScreenView: View {
    let context: ActivityViewContext<FeedingAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        let state = context.state
        let attrs = context.attributes
        let labels = attrs.labels
        let terminal = state.status == "fed" || state.status == "skipped"

        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                FeedingHero(size: 52, scheme: scheme, status: state.status)

                VStack(alignment: .leading, spacing: 4) {
                    Text(attrs.mealName)
                        .font(.system(.headline, design: .rounded).weight(.bold))
                        .foregroundColor(PettoTheme.textPrimary(for: scheme))
                        .strikethrough(terminal, color: PettoTheme.statusCancelled)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        Text(attrs.petName)
                            .font(.system(size: 13, weight: .heavy, design: .rounded))
                            .foregroundColor(PettoTheme.accent(for: scheme))
                            .lineLimit(1)
                        if !attrs.amount.isEmpty {
                            Text("·")
                                .font(.system(size: 9, weight: .black))
                                .foregroundColor(PettoTheme.textTertiary(for: scheme))
                            Text(attrs.amount)
                                .font(.system(size: 12, weight: .medium, design: .rounded))
                                .foregroundColor(PettoTheme.textSecondary(for: scheme))
                                .lineLimit(1)
                        }
                    }
                }

                Spacer(minLength: 6)

                FeedStatusBadge(state: state, labels: labels, scheme: scheme)
            }

            if !terminal {
                Divider()
                    .background(PettoTheme.textTertiary(for: scheme).opacity(0.25))
                    .padding(.top, 12)
                    .padding(.bottom, 10)

                FeedActionRow(
                    activityId: context.activityID,
                    petId: attrs.petId,
                    scheduleId: attrs.scheduleId,
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

@available(iOS 16.2, *)
struct FeedDIExpandedLeading: View {
    let context: ActivityViewContext<FeedingAttributes>
    @Environment(\.colorScheme) var scheme
    var body: some View {
        FeedingHero(size: 32, scheme: scheme, status: context.state.status)
            .padding(.leading, 4)
    }
}

@available(iOS 16.2, *)
struct FeedDIExpandedTrailing: View {
    let context: ActivityViewContext<FeedingAttributes>
    @Environment(\.colorScheme) var scheme
    var body: some View {
        FeedStatusBadge(
            state: context.state,
            labels: context.attributes.labels,
            scheme: scheme
        )
        .padding(.trailing, 4)
    }
}

@available(iOS 16.2, *)
struct FeedDIExpandedCenter: View {
    let context: ActivityViewContext<FeedingAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(context.attributes.mealName)
                .font(.system(.subheadline, design: .rounded).weight(.bold))
                .foregroundColor(PettoTheme.textPrimary(for: scheme))
                .lineLimit(1)
            HStack(spacing: 6) {
                Text(context.attributes.petName)
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .foregroundColor(PettoTheme.accent(for: scheme))
                if !context.attributes.amount.isEmpty {
                    Text(context.attributes.amount)
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundColor(PettoTheme.textSecondary(for: scheme))
                        .lineLimit(1)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 6)
    }
}

@available(iOS 16.2, *)
struct FeedDIExpandedBottom: View {
    let context: ActivityViewContext<FeedingAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        let terminal = context.state.status == "fed" || context.state.status == "skipped"
        if terminal {
            EmptyView()
        } else {
            FeedActionRow(
                activityId: context.activityID,
                petId: context.attributes.petId,
                scheduleId: context.attributes.scheduleId,
                labels: context.attributes.labels,
                scheme: scheme,
                full: false
            )
            .padding(.horizontal, 4)
            .padding(.bottom, 4)
            .padding(.top, 2)
        }
    }
}

@available(iOS 16.2, *)
struct FeedDICompactTrailing: View {
    let context: ActivityViewContext<FeedingAttributes>
    @Environment(\.colorScheme) var scheme
    var body: some View {
        switch context.state.status {
        case "fed":
            Image(systemName: "checkmark")
                .font(.system(size: 11, weight: .heavy))
                .foregroundColor(PettoTheme.statusActive)
        case "skipped":
            Image(systemName: "xmark")
                .font(.system(size: 11, weight: .heavy))
                .foregroundColor(PettoTheme.statusCancelled)
        default:
            Text(context.attributes.petName)
                .font(.system(size: 12, weight: .heavy, design: .rounded))
                .foregroundColor(PettoTheme.accent(for: scheme))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: 64, alignment: .trailing)
        }
    }
}

@available(iOS 16.2, *)
struct FeedingHero: View {
    let size: CGFloat
    let scheme: ColorScheme
    let status: String

    var body: some View {
        let icon: String
        let color: Color
        switch status {
        case "fed":
            icon = "checkmark"
            color = PettoTheme.statusActive
        case "skipped":
            icon = "xmark"
            color = PettoTheme.statusCancelled
        default:
            icon = "fork.knife"
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
struct FeedStatusBadge: View {
    let state: FeedingAttributes.ContentState
    let labels: FeedingAttributes.Labels
    let scheme: ColorScheme

    var body: some View {
        switch state.status {
        case "fed":
            StatusPill(label: labels.completed, color: PettoTheme.statusActive)
        case "skipped":
            StatusPill(label: labels.skipped, color: PettoTheme.statusCancelled)
        default:
            VStack(alignment: .trailing, spacing: 2) {
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

@available(iOS 16.2, *)
struct FeedActionRow: View {
    let activityId: String
    let petId: String
    let scheduleId: String
    let labels: FeedingAttributes.Labels
    let scheme: ColorScheme
    let full: Bool

    var body: some View {
        HStack(spacing: 8) {
            if #available(iOS 17.0, *) {
                Button(intent: MarkFeedingDoneIntent(
                    activityId: activityId,
                    petId: petId,
                    scheduleId: scheduleId
                )) {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: full ? 16 : 13, weight: .heavy))
                        Text(labels.fed)
                            .font(.system(size: full ? 15 : 12, weight: .heavy, design: .rounded))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, full ? 11 : 8)
                    .padding(.horizontal, full ? 14 : 10)
                    .background(
                        Capsule().fill(PettoTheme.accent(for: scheme))
                    )
                }
                .buttonStyle(.plain)

                Button(intent: SkipFeedingIntent(activityId: activityId)) {
                    HStack(spacing: 5) {
                        Image(systemName: "xmark")
                            .font(.system(size: full ? 13 : 11, weight: .heavy))
                        Text(labels.skip)
                            .font(.system(size: full ? 14 : 12, weight: .heavy, design: .rounded))
                            .lineLimit(1)
                    }
                    .foregroundColor(PettoTheme.accent(for: scheme))
                    .padding(.vertical, full ? 11 : 8)
                    .padding(.horizontal, full ? 16 : 12)
                    .background(
                        Capsule()
                            .fill(PettoTheme.accent(for: scheme).opacity(0.14))
                    )
                }
                .buttonStyle(.plain)
            } else {
                Link(destination: URL(string: "petto://feeding/\(scheduleId)/log-now")!) {
                    Text(labels.fed)
                        .font(.system(size: 14, weight: .heavy, design: .rounded))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Capsule().fill(PettoTheme.accent(for: scheme)))
                }
                Link(destination: URL(string: "petto://feeding/\(scheduleId)/skip")!) {
                    Text(labels.skip)
                        .font(.system(size: 14, weight: .heavy, design: .rounded))
                        .foregroundColor(PettoTheme.accent(for: scheme))
                        .padding(.vertical, 10)
                        .padding(.horizontal, 16)
                        .background(Capsule().fill(PettoTheme.accent(for: scheme).opacity(0.14)))
                }
            }
        }
    }
}
