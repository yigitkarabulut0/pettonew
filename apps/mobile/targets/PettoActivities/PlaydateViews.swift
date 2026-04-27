import SwiftUI

// MARK: - Hero pet bubble
//
// Tek görsel imzamız: warm-orange tinted gradient daire içinde pati ikonu.
// Köşede minik canlılık noktası (devam eden playdate'lerde). Boyut çağrılana
// göre scale edilir (lock screen 52pt, DI expanded 32pt).

@available(iOS 16.2, *)
struct HeroPetBubble: View {
    let size: CGFloat
    let scheme: ColorScheme
    let showLiveDot: Bool
    let isCancelled: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [
                            PettoTheme.accent(for: scheme).opacity(scheme == .dark ? 0.32 : 0.20),
                            PettoTheme.accent(for: scheme).opacity(scheme == .dark ? 0.18 : 0.08),
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Image(systemName: "pawprint.fill")
                .font(.system(size: size * 0.46, weight: .medium))
                .foregroundColor(
                    isCancelled
                        ? PettoTheme.statusCancelled
                        : PettoTheme.accent(for: scheme)
                )
                .symbolRenderingMode(.hierarchical)

            if showLiveDot && !isCancelled {
                Circle()
                    .fill(PettoTheme.statusActive)
                    .frame(width: size * 0.22, height: size * 0.22)
                    .overlay(
                        Circle()
                            .stroke(PettoTheme.background(for: scheme), lineWidth: size * 0.05)
                    )
                    .offset(x: size * 0.34, y: size * 0.34)
            }
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Big right-side countdown
//
// Lock screen'in sağ kolonu ve DI expanded trailing region'ı için. Two-line
// dikey stack: büyük sayı + altında 9pt heavy tracked label ("kala", "live",
// vb). Status'a göre renk değişir.
//
// `widthCap`: trailing region dar olursa (DI expanded'da ~70pt) sayıyı zorla
// scale edebilir. 0 → kap yok. minimumScaleFactor de güvenlik ağı.

@available(iOS 16.2, *)
struct PlaydateCountdown: View {
    let startsAt: Date
    let endsAt: Date?
    let status: String
    let labels: PlaydateAttributes.Labels
    let scheme: ColorScheme
    let alignment: HorizontalAlignment
    let largeFontSize: CGFloat
    let widthCap: CGFloat // 0 = no cap

    var body: some View {
        VStack(alignment: alignment, spacing: 1) {
            switch status {
            case "in_progress":
                timerText(
                    startsAt...(endsAt ?? Date().addingTimeInterval(3600)),
                    countsDown: false,
                    color: PettoTheme.statusActive
                )
                Text(labels.inProgress.uppercased())
                    .font(.system(size: 9, weight: .heavy, design: .rounded))
                    .tracking(0.7)
                    .foregroundColor(PettoTheme.textTertiary(for: scheme))
                    .lineLimit(1)
            default:
                timerText(
                    Date()...startsAt,
                    countsDown: true,
                    color: PettoTheme.accent(for: scheme)
                )
                Text(labels.left.uppercased())
                    .font(.system(size: 9, weight: .heavy, design: .rounded))
                    .tracking(0.7)
                    .foregroundColor(PettoTheme.textTertiary(for: scheme))
                    .lineLimit(1)
            }
        }
    }

    @ViewBuilder
    private func timerText(_ interval: ClosedRange<Date>, countsDown: Bool, color: Color) -> some View {
        let txt = Text(timerInterval: interval,
                       pauseTime: nil,
                       countsDown: countsDown,
                       showsHours: false)
            .font(.system(size: largeFontSize, weight: .heavy, design: .rounded))
            .monospacedDigit()
            .foregroundColor(color)

        if widthCap > 0 {
            txt
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(maxWidth: widthCap, alignment: alignment == .leading ? .leading : .trailing)
        } else {
            txt
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }
}

// MARK: - Status pill
//
// Terminal durumlar için (iptal / bitti). Countdown yerine girer.

@available(iOS 16.2, *)
struct StatusPill: View {
    let label: String
    let color: Color

    var body: some View {
        Text(label.uppercased())
            .font(.system(size: 11, weight: .heavy, design: .rounded))
            .tracking(0.6)
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                Capsule().fill(color)
            )
    }
}

// MARK: - Meta row icon+text

@available(iOS 16.2, *)
struct MetaItem: View {
    let icon: String
    let text: String
    let scheme: ColorScheme

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(PettoTheme.textSecondary(for: scheme))
            Text(text)
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundColor(PettoTheme.textSecondary(for: scheme))
                .lineLimit(1)
        }
    }
}

// MARK: - Waitlist badge

@available(iOS 16.2, *)
struct WaitlistBadge: View {
    let position: Int
    let queueLabel: String

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "hourglass")
                .font(.system(size: 9, weight: .heavy))
            Text("\(position). \(queueLabel)")
                .font(.system(size: 10, weight: .heavy, design: .rounded))
        }
        .foregroundColor(.white)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule().fill(PettoTheme.statusWaitlist)
        )
    }
}

// MARK: - Compact DI value
//
// EXTRA DAR. Hep aynı genişlikte, max 38pt. Status'a göre:
//   • upcoming → MM:SS countdown (scaled to fit, monospaced)
//   • in_progress → 6pt yeşil dot + "CANLI" (sadece dot eğer dar ise)
//   • cancelled / ended → ✕ ikon

@available(iOS 16.2, *)
struct DICompactValue: View {
    let startsAt: Date
    let status: String
    let labels: PlaydateAttributes.Labels
    let scheme: ColorScheme

    var body: some View {
        switch status {
        case "in_progress":
            Circle()
                .fill(PettoTheme.statusActive)
                .frame(width: 8, height: 8)
        case "cancelled", "ended":
            Image(systemName: "xmark")
                .font(.system(size: 11, weight: .heavy))
                .foregroundColor(PettoTheme.statusCancelled)
        default:
            Text(timerInterval: Date()...startsAt,
                 pauseTime: nil,
                 countsDown: true,
                 showsHours: false)
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundColor(PettoTheme.accent(for: scheme))
                .lineLimit(1)
                .minimumScaleFactor(0.55)
                .frame(maxWidth: 36, alignment: .trailing)
        }
    }
}

// MARK: - Yol Tarifi pill button
//
// Hem lock screen alt sırasında hem DI expanded bottom region'da
// kullanılır. Sadece label / icon size değişir.

@available(iOS 16.2, *)
struct DirectionsButton: View {
    let url: URL
    let label: String
    let scheme: ColorScheme
    let compact: Bool

    var body: some View {
        Link(destination: url) {
            HStack(spacing: 4) {
                Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                    .font(.system(size: compact ? 10 : 11, weight: .heavy))
                Text(label)
                    .font(.system(size: compact ? 11 : 12, weight: .heavy, design: .rounded))
            }
            .foregroundColor(.white)
            .padding(.horizontal, compact ? 9 : 11)
            .padding(.vertical, compact ? 5 : 6)
            .background(
                Capsule().fill(PettoTheme.accent(for: scheme))
            )
        }
    }
}
