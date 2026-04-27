import ActivityKit
import WidgetKit
import SwiftUI

@available(iOS 16.2, *)
struct PlaydateLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PlaydateAttributes.self) { context in
            PlaydateLockScreenView(context: context)
                .activityBackgroundTint(nil)
                .activitySystemActionForegroundColor(PettoTheme.accent)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    DIExpandedLeading(context: context)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    DIExpandedTrailing(context: context)
                }
                DynamicIslandExpandedRegion(.center) {
                    DIExpandedCenter(context: context)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    DIExpandedBottom(context: context)
                }
            } compactLeading: {
                Text(context.attributes.emoji)
                    .font(.system(size: 14))
            } compactTrailing: {
                CompactCountdown(
                    startsAt: context.state.startsAt,
                    status: context.state.status
                )
                .foregroundStyle(PettoTheme.accent)
            } minimal: {
                Text(context.attributes.emoji)
                    .font(.system(size: 14))
            }
            .keylineTint(PettoTheme.accent)
            .widgetURL(URL(string: "petto://playdate/\(context.attributes.playdateId)"))
        }
    }
}

@available(iOS 16.2, *)
struct PlaydateLockScreenView: View {
    let context: ActivityViewContext<PlaydateAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        let state = context.state
        let attrs = context.attributes
        let isCancelled = state.status == "cancelled"

        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    Circle()
                        .fill(PettoTheme.accent.opacity(0.15))
                    Text(attrs.emoji)
                        .font(.system(size: 22))
                }
                .frame(width: 40, height: 40)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(attrs.title)
                            .font(.system(.headline, design: .rounded).weight(.bold))
                            .foregroundStyle(PettoTheme.textPrimary(for: scheme))
                            .strikethrough(isCancelled, color: PettoTheme.cancelled)
                            .lineLimit(1)
                        if let waitlist = state.waitlistPosition {
                            WaitlistBadge(position: waitlist)
                        }
                    }
                    HStack(spacing: 8) {
                        if let city = attrs.city, !city.isEmpty {
                            HStack(spacing: 3) {
                                Image(systemName: "mappin.and.ellipse")
                                    .font(.system(size: 11, weight: .semibold))
                                Text(city)
                                    .font(.system(size: 13, weight: .medium, design: .rounded))
                                    .lineLimit(1)
                            }
                            .foregroundStyle(PettoTheme.textSecondary(for: scheme))
                        }
                        AttendeeChip(
                            count: state.attendeeCount,
                            max: state.maxPets,
                            scheme: scheme
                        )
                    }
                }

                Spacer()

                CountdownLabel(
                    startsAt: state.startsAt,
                    endsAt: state.endsAt,
                    status: state.status
                )
            }

            if !isCancelled {
                HStack(alignment: .center, spacing: 10) {
                    AvatarStack(
                        urls: state.firstAvatars,
                        total: state.attendeeCount,
                        size: 26,
                        strokeColor: PettoTheme.background(for: scheme)
                    )
                    Spacer()
                    if let msg = state.statusMessage, !msg.isEmpty {
                        Text(msg)
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                            .foregroundStyle(PettoTheme.textSecondary(for: scheme))
                    } else {
                        Link(destination: URL(string: "petto://playdate/\(attrs.playdateId)/directions")!) {
                            HStack(spacing: 4) {
                                Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                                    .font(.system(size: 11, weight: .bold))
                                Text("Yol tarifi")
                                    .font(.system(size: 12, weight: .bold, design: .rounded))
                            }
                            .foregroundStyle(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                Capsule().fill(PettoTheme.accent)
                            )
                        }
                    }
                }
                .padding(.top, 10)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(PettoTheme.background(for: scheme))
    }
}

@available(iOS 16.2, *)
struct DIExpandedLeading: View {
    let context: ActivityViewContext<PlaydateAttributes>

    var body: some View {
        ZStack {
            Circle()
                .fill(PettoTheme.accent.opacity(0.18))
            Text(context.attributes.emoji)
                .font(.system(size: 20))
        }
        .frame(width: 36, height: 36)
        .padding(.leading, 4)
    }
}

@available(iOS 16.2, *)
struct DIExpandedTrailing: View {
    let context: ActivityViewContext<PlaydateAttributes>

    var body: some View {
        CountdownLabel(
            startsAt: context.state.startsAt,
            endsAt: context.state.endsAt,
            status: context.state.status
        )
        .padding(.trailing, 4)
    }
}

@available(iOS 16.2, *)
struct DIExpandedCenter: View {
    let context: ActivityViewContext<PlaydateAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(context.attributes.title)
                .font(.system(.subheadline, design: .rounded).weight(.bold))
                .foregroundStyle(PettoTheme.textPrimary(for: scheme))
                .lineLimit(1)
            if let city = context.attributes.city, !city.isEmpty {
                Text(city)
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundStyle(PettoTheme.textSecondary(for: scheme))
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

@available(iOS 16.2, *)
struct DIExpandedBottom: View {
    let context: ActivityViewContext<PlaydateAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        HStack {
            AvatarStack(
                urls: context.state.firstAvatars,
                total: context.state.attendeeCount,
                size: 24,
                strokeColor: Color(.systemBackground)
            )
            AttendeeChip(
                count: context.state.attendeeCount,
                max: context.state.maxPets,
                scheme: scheme
            )
            Spacer()
            if let waitlist = context.state.waitlistPosition {
                WaitlistBadge(position: waitlist)
            } else {
                Link(destination: URL(string: "petto://playdate/\(context.attributes.playdateId)")!) {
                    HStack(spacing: 3) {
                        Text("Detay")
                            .font(.system(size: 12, weight: .bold, design: .rounded))
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .bold))
                    }
                    .foregroundStyle(PettoTheme.accent)
                }
            }
        }
    }
}
