import ActivityKit
import WidgetKit
import SwiftUI

// Single source of truth for the Petto Playdate Live Activity. Provides
// four presentations from one config:
//   • Lock Screen banner — sıcak, minimal, geri sayıma odaklı
//   • Dynamic Island compact — patik + monospace dakika (şerit kadar dar)
//   • Dynamic Island expanded — 4 region: hero / countdown / başlık / aksiyon
//   • Dynamic Island minimal — tek pati glyph

@available(iOS 16.2, *)
struct PlaydateLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PlaydateAttributes.self) { context in
            PlaydateLockScreenView(context: context)
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
                DICompactLeading()
            } compactTrailing: {
                DICompactTrailingView(context: context)
            } minimal: {
                DIMinimalView()
            }
            .keylineTint(PettoTheme.accentLight)
            .widgetURL(URL(string: "petto://playdate/\(context.attributes.playdateId)"))
        }
    }
}

// MARK: - Lock Screen Banner
//
// Düzen:
//   ┌─────────────────────────────────────────────────────────────┐
//   │  ●●●  PATI BULUŞMASI                              47        │
//   │  🐾   Levent · 4 dost                             KALA      │
//   │       ─────────────                               ────      │
//   │       [Yol Tarifi →]                                        │
//   └─────────────────────────────────────────────────────────────┘
//
// Üç sütun: hero (56pt), title+meta (esnek), countdown (sağda).
// Alt satır: aksiyon butonu. İptal/bitti durumunda büyük status pill girer.

@available(iOS 16.2, *)
struct PlaydateLockScreenView: View {
    let context: ActivityViewContext<PlaydateAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        let state = context.state
        let attrs = context.attributes
        let terminal = state.status == "cancelled" || state.status == "ended"

        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                HeroPetBubble(
                    size: 52,
                    scheme: scheme,
                    showLiveDot: state.status == "in_progress",
                    isCancelled: terminal
                )

                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(attrs.title)
                            .font(.system(.headline, design: .rounded).weight(.bold))
                            .foregroundStyle(PettoTheme.textPrimary(for: scheme))
                            .strikethrough(terminal, color: PettoTheme.statusCancelled)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                        if let waitlist = state.waitlistPosition, !terminal {
                            WaitlistBadge(position: waitlist)
                        }
                    }
                    HStack(spacing: 10) {
                        if let city = attrs.city, !city.isEmpty {
                            MetaItem(icon: "mappin.and.ellipse", text: city, scheme: scheme)
                        }
                        MetaItem(
                            icon: "pawprint.fill",
                            text: "\(state.attendeeCount)/\(state.maxPets) dost",
                            scheme: scheme
                        )
                    }
                }

                Spacer(minLength: 8)

                Group {
                    if terminal {
                        StatusPill(
                            label: state.status == "cancelled" ? "İptal" : "Bitti",
                            color: PettoTheme.statusCancelled
                        )
                    } else {
                        PlaydateCountdown(
                            startsAt: state.startsAt,
                            endsAt: state.endsAt,
                            status: state.status,
                            scheme: scheme,
                            alignment: .trailing,
                            largeFontSize: 28
                        )
                    }
                }
            }

            if !terminal {
                Divider()
                    .background(PettoTheme.textTertiary(for: scheme).opacity(0.3))
                    .padding(.top, 12)
                    .padding(.bottom, 10)

                HStack(spacing: 10) {
                    if let msg = state.statusMessage, !msg.isEmpty {
                        Text(msg)
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                            .foregroundStyle(PettoTheme.textSecondary(for: scheme))
                            .lineLimit(1)
                        Spacer()
                    } else {
                        Spacer()
                    }
                    Link(destination: URL(string: "petto://playdate/\(attrs.playdateId)/directions")!) {
                        HStack(spacing: 5) {
                            Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                                .font(.system(size: 11, weight: .heavy))
                            Text("Yol Tarifi")
                                .font(.system(size: 12, weight: .heavy, design: .rounded))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 6)
                        .background(
                            Capsule().fill(PettoTheme.accent(for: scheme))
                        )
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(PettoTheme.background(for: scheme))
    }
}

// MARK: - Dynamic Island compact

@available(iOS 16.2, *)
struct DICompactLeading: View {
    @Environment(\.colorScheme) var scheme

    var body: some View {
        Image(systemName: "pawprint.fill")
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(PettoTheme.accent(for: scheme))
            .symbolRenderingMode(.hierarchical)
    }
}

@available(iOS 16.2, *)
struct DICompactTrailingView: View {
    let context: ActivityViewContext<PlaydateAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        DICompactValue(
            startsAt: context.state.startsAt,
            status: context.state.status,
            scheme: scheme
        )
    }
}

@available(iOS 16.2, *)
struct DIMinimalView: View {
    @Environment(\.colorScheme) var scheme

    var body: some View {
        Image(systemName: "pawprint.fill")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(PettoTheme.accent(for: scheme))
            .symbolRenderingMode(.hierarchical)
    }
}

// MARK: - Dynamic Island expanded
//
// Apple'ın 4 region modeli: leading / trailing / center / bottom.
// Hero küçük (32pt), title kompakt, countdown büyük, aksiyon altta tek satır.

@available(iOS 16.2, *)
struct DIExpandedLeading: View {
    let context: ActivityViewContext<PlaydateAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        HeroPetBubble(
            size: 36,
            scheme: scheme,
            showLiveDot: context.state.status == "in_progress",
            isCancelled: context.state.status == "cancelled"
        )
        .padding(.leading, 4)
    }
}

@available(iOS 16.2, *)
struct DIExpandedTrailing: View {
    let context: ActivityViewContext<PlaydateAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        Group {
            switch context.state.status {
            case "cancelled":
                StatusPill(label: "İptal", color: PettoTheme.statusCancelled)
            case "ended":
                StatusPill(label: "Bitti", color: PettoTheme.statusCancelled)
            default:
                PlaydateCountdown(
                    startsAt: context.state.startsAt,
                    endsAt: context.state.endsAt,
                    status: context.state.status,
                    scheme: scheme,
                    alignment: .trailing,
                    largeFontSize: 22
                )
            }
        }
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
            HStack(spacing: 8) {
                if let city = context.attributes.city, !city.isEmpty {
                    Text(city)
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundStyle(PettoTheme.textSecondary(for: scheme))
                        .lineLimit(1)
                }
                Text("•")
                    .font(.system(size: 9, weight: .black))
                    .foregroundStyle(PettoTheme.textTertiary(for: scheme))
                Text("\(context.state.attendeeCount)/\(context.state.maxPets)")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .foregroundStyle(PettoTheme.textSecondary(for: scheme))
                    .monospacedDigit()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 8)
    }
}

@available(iOS 16.2, *)
struct DIExpandedBottom: View {
    let context: ActivityViewContext<PlaydateAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        let terminal = context.state.status == "cancelled" || context.state.status == "ended"

        HStack {
            if let waitlist = context.state.waitlistPosition, !terminal {
                WaitlistBadge(position: waitlist)
            } else {
                Text(context.attributes.hostName)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(PettoTheme.textSecondary(for: scheme))
                    + Text("'in pati buluşması")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundStyle(PettoTheme.textTertiary(for: scheme))
            }
            Spacer()
            if !terminal {
                Link(destination: URL(string: "petto://playdate/\(context.attributes.playdateId)/directions")!) {
                    HStack(spacing: 5) {
                        Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                            .font(.system(size: 10, weight: .heavy))
                        Text("Yol")
                            .font(.system(size: 11, weight: .heavy, design: .rounded))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(
                        Capsule().fill(PettoTheme.accent(for: scheme))
                    )
                }
            }
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 2)
    }
}
