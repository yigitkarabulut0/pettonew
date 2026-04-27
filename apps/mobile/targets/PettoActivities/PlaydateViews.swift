import SwiftUI

// MARK: - Hero pet bubble
//
// Tek görsel imzamız: warm-orange tinted bir daire içinde pati ikonu.
// Köşede minik canlılık noktası ("şu an aktif" hissini verir, animate olur).
// Boyut çağrılanca scale edilir (lock screen'de büyük, DI expanded'da orta).

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
                            PettoTheme.accent(for: scheme).opacity(scheme == .dark ? 0.30 : 0.18),
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
                    .frame(width: size * 0.20, height: size * 0.20)
                    .overlay(
                        Circle()
                            .stroke(PettoTheme.background(for: scheme), lineWidth: size * 0.04)
                    )
                    .offset(x: size * 0.36, y: size * 0.36)
            }
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Big countdown
//
// Lock screen'in ana göstergesi. Başlamadan önce iri geri sayım, başladıktan
// sonra geçen süre. İptal durumunda tamamen kaybolur (yerine status pill
// koyulur).

@available(iOS 16.2, *)
struct PlaydateCountdown: View {
    let startsAt: Date
    let endsAt: Date?
    let status: String
    let scheme: ColorScheme
    let alignment: HorizontalAlignment
    let largeFontSize: CGFloat

    var body: some View {
        VStack(alignment: alignment, spacing: 2) {
            switch status {
            case "in_progress":
                Text(timerInterval: startsAt...(endsAt ?? Date().addingTimeInterval(3600)),
                     pauseTime: nil,
                     countsDown: false,
                     showsHours: false)
                    .font(.system(size: largeFontSize, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(PettoTheme.statusActive)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text("DEVAM EDİYOR")
                    .font(.system(size: 9, weight: .heavy, design: .rounded))
                    .tracking(0.8)
                    .foregroundColor(PettoTheme.textTertiary(for: scheme))
            default:
                Text(timerInterval: Date()...startsAt,
                     pauseTime: nil,
                     countsDown: true,
                     showsHours: false)
                    .font(.system(size: largeFontSize, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(PettoTheme.accent(for: scheme))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text("KALA")
                    .font(.system(size: 9, weight: .heavy, design: .rounded))
                    .tracking(0.8)
                    .foregroundColor(PettoTheme.textTertiary(for: scheme))
            }
        }
    }
}

// MARK: - Status pill
//
// "İptal edildi" / "Bitti" gibi terminal durumlarda countdown yerine bu girer.

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
//
// Lock screen'in alt sırası: lokasyon ve katılımcı sayısı için.

@available(iOS 16.2, *)
struct MetaItem: View {
    let icon: String
    let text: String
    let scheme: ColorScheme

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(PettoTheme.textSecondary(for: scheme))
            Text(text)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundColor(PettoTheme.textSecondary(for: scheme))
                .lineLimit(1)
        }
    }
}

// MARK: - Waitlist badge

@available(iOS 16.2, *)
struct WaitlistBadge: View {
    let position: Int

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "hourglass")
                .font(.system(size: 10, weight: .heavy))
            Text("\(position). sırada")
                .font(.system(size: 11, weight: .heavy, design: .rounded))
        }
        .foregroundColor(.white)
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(
            Capsule().fill(PettoTheme.statusWaitlist)
        )
    }
}

// MARK: - Compact DI mini-pill
//
// Compact trailing icin: küçük, dar, monospaced. "47m" / "BAŞLADI" / "❌"
// gibi 4 karakter altı.

@available(iOS 16.2, *)
struct DICompactValue: View {
    let startsAt: Date
    let status: String
    let scheme: ColorScheme

    var body: some View {
        switch status {
        case "in_progress":
            HStack(spacing: 3) {
                Circle()
                    .fill(PettoTheme.statusActive)
                    .frame(width: 6, height: 6)
                Text("CANLI")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .tracking(0.4)
                    .foregroundColor(PettoTheme.statusActive)
            }
        case "cancelled", "ended":
            Image(systemName: "xmark")
                .font(.system(size: 11, weight: .heavy))
                .foregroundColor(PettoTheme.statusCancelled)
        default:
            Text(timerInterval: Date()...startsAt,
                 pauseTime: nil,
                 countsDown: true,
                 showsHours: false)
                .font(.system(size: 13, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundColor(PettoTheme.accent(for: scheme))
        }
    }
}
