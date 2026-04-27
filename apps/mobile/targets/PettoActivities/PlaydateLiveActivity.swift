import ActivityKit
import WidgetKit
import SwiftUI

// Single source of truth for the Petto Playdate Live Activity.
//
// Üç sunum:
//   • Lock Screen banner — cinematic, hero-led, geri sayıma odaklı
//   • Dynamic Island compact — minimal: sadece pati + dar bir status
//   • Dynamic Island expanded — Apple Maps tarzı 4 region hiyerarşisi
//   • Dynamic Island minimal — tek pati glyph
//
// Tüm string'ler `context.attributes.labels`'den okunur — i18next'in
// snapshotu. Cihaz dili değişince yeni activity'ler yeni dilde başlar.

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
// Cinematic 3-zone layout:
//   ┌────────────────────────────────────────────┐
//   │  ╭──╮                              47      │
//   │  │🐾│  Pati Buluşması              KALA    │
//   │  ╰──╯  Levent · 4 dost                      │
//   │  ─────────────────────────────────────     │
//   │                          [↗ Yol Tarifi]    │
//   └────────────────────────────────────────────┘
//
// 16pt yatay / 12pt dikey safe padding. İptal/bitti hâli countdown yerine
// büyük status pill koyup alt aksiyon barını gizler.

@available(iOS 16.2, *)
struct PlaydateLockScreenView: View {
    let context: ActivityViewContext<PlaydateAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        let state = context.state
        let attrs = context.attributes
        let labels = attrs.labels
        let terminal = state.status == "cancelled" || state.status == "ended"

        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                HeroPetBubble(
                    size: 52,
                    scheme: scheme,
                    showLiveDot: state.status == "in_progress",
                    isCancelled: terminal
                )

                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(attrs.title)
                            .font(.system(.headline, design: .rounded).weight(.bold))
                            .foregroundColor(PettoTheme.textPrimary(for: scheme))
                            .strikethrough(terminal, color: PettoTheme.statusCancelled)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                        if let waitlist = state.waitlistPosition, !terminal {
                            WaitlistBadge(position: waitlist, queueLabel: labels.queue)
                        }
                    }
                    HStack(spacing: 8) {
                        if let city = attrs.city, !city.isEmpty {
                            MetaItem(icon: "mappin.and.ellipse", text: city, scheme: scheme)
                        }
                        MetaItem(
                            icon: "pawprint.fill",
                            text: "\(state.attendeeCount) \(labels.friends)",
                            scheme: scheme
                        )
                    }
                }

                Spacer(minLength: 6)

                if terminal {
                    StatusPill(
                        label: state.status == "cancelled" ? labels.cancelled : labels.ended,
                        color: PettoTheme.statusCancelled
                    )
                } else {
                    PlaydateCountdown(
                        startsAt: state.startsAt,
                        endsAt: state.endsAt,
                        status: state.status,
                        labels: labels,
                        scheme: scheme,
                        alignment: .trailing,
                        largeFontSize: 30,
                        widthCap: 92
                    )
                }
            }

            if !terminal {
                Divider()
                    .background(PettoTheme.textTertiary(for: scheme).opacity(0.25))
                    .padding(.top, 11)
                    .padding(.bottom, 9)

                HStack(spacing: 10) {
                    if let msg = state.statusMessage, !msg.isEmpty {
                        Text(msg)
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                            .foregroundColor(PettoTheme.textSecondary(for: scheme))
                            .lineLimit(1)
                    } else {
                        Text("\(attrs.hostName) · \(labels.playdateBy)")
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundColor(PettoTheme.textTertiary(for: scheme))
                            .lineLimit(1)
                    }
                    Spacer(minLength: 6)
                    DirectionsButton(
                        url: URL(string: "petto://playdate/\(attrs.playdateId)/directions")!,
                        label: labels.directions,
                        scheme: scheme,
                        compact: false
                    )
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(PettoTheme.background(for: scheme))
    }
}

// MARK: - Dynamic Island compact
//
// Hep aynı, EN DAR şerit. Apple'ın compact regions'ı zaten dar; biz de
// sayı değil sembol veya tek satır timer kullanıyoruz.

@available(iOS 16.2, *)
struct DICompactLeading: View {
    @Environment(\.colorScheme) var scheme

    var body: some View {
        Image(systemName: "pawprint.fill")
            .font(.system(size: 14, weight: .bold))
            .foregroundColor(PettoTheme.accent(for: scheme))
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
            labels: context.attributes.labels,
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
            .foregroundColor(PettoTheme.accent(for: scheme))
            .symbolRenderingMode(.hierarchical)
    }
}

// MARK: - Dynamic Island expanded
//
// Apple Maps tarzı 4 region kompozisyon:
//   ┌─────────────────────────────────────────┐
//   │  ╭──╮  Pati Buluşması           47       │
//   │  │🐾│  Levent · 4/6 dost        KALA     │
//   │  ╰──╯                                    │
//   │   Yigit'in buluşması        [↗ Yol]     │
//   └─────────────────────────────────────────┘
//
// Leading: küçük hero (32pt, 4pt padding-left)
// Trailing: countdown stack (right-aligned, 22pt)
// Center: title + meta
// Bottom: subtitle + Yol pill

@available(iOS 16.2, *)
struct DIExpandedLeading: View {
    let context: ActivityViewContext<PlaydateAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        HeroPetBubble(
            size: 32,
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
        let labels = context.attributes.labels
        let state = context.state

        Group {
            switch state.status {
            case "cancelled":
                StatusPill(label: labels.cancelled, color: PettoTheme.statusCancelled)
            case "ended":
                StatusPill(label: labels.ended, color: PettoTheme.statusCancelled)
            case "in_progress":
                // Tek satır CANLI pill — trailing region dar, alt label
                // koymak farklı dillerde ("Em andamento" vs "Canlı")
                // taşıyordu. Pill içinde dar ve sabit görünür.
                HStack(spacing: 4) {
                    Circle()
                        .fill(PettoTheme.statusActive)
                        .frame(width: 6, height: 6)
                    Text(labels.live.uppercased())
                        .font(.system(size: 10, weight: .heavy, design: .rounded))
                        .tracking(0.4)
                        .foregroundColor(PettoTheme.statusActive)
                        .lineLimit(1)
                }
            default:
                // Sadece sayı — alt label yok. Lock screen'de "KALA"
                // yazısı vardı; expanded trailing region dar olduğu için
                // sayı + label stack'i her dilde aynı düzgün durmuyordu.
                Text(timerInterval: Date()...state.startsAt,
                     pauseTime: nil,
                     countsDown: true,
                     showsHours: false)
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(PettoTheme.accent(for: scheme))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .fixedSize()
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
        let labels = context.attributes.labels
        VStack(alignment: .leading, spacing: 2) {
            Text(context.attributes.title)
                .font(.system(.subheadline, design: .rounded).weight(.bold))
                .foregroundColor(PettoTheme.textPrimary(for: scheme))
                .lineLimit(1)
            HStack(spacing: 6) {
                if let city = context.attributes.city, !city.isEmpty {
                    Text(city)
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundColor(PettoTheme.textSecondary(for: scheme))
                        .lineLimit(1)
                    Text("·")
                        .font(.system(size: 9, weight: .black))
                        .foregroundColor(PettoTheme.textTertiary(for: scheme))
                }
                Text("\(context.state.attendeeCount) \(labels.friends)")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .foregroundColor(PettoTheme.textSecondary(for: scheme))
                    .lineLimit(1)
                    .monospacedDigit()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 6)
    }
}

@available(iOS 16.2, *)
struct DIExpandedBottom: View {
    let context: ActivityViewContext<PlaydateAttributes>
    @Environment(\.colorScheme) var scheme

    var body: some View {
        let labels = context.attributes.labels
        let terminal = context.state.status == "cancelled" || context.state.status == "ended"

        if terminal {
            EmptyView()
        } else {
            HStack(spacing: 8) {
                if let waitlist = context.state.waitlistPosition {
                    WaitlistBadge(position: waitlist, queueLabel: labels.queue)
                } else {
                    Text("\(context.attributes.hostName) · \(labels.playdateBy)")
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundColor(PettoTheme.textSecondary(for: scheme))
                        .lineLimit(1)
                }
                Spacer()
                DirectionsButton(
                    url: URL(string: "petto://playdate/\(context.attributes.playdateId)/directions")!,
                    label: labels.directionsShort,
                    scheme: scheme,
                    compact: true
                )
            }
            .padding(.horizontal, 4)
            .padding(.bottom, 2)
        }
    }
}
