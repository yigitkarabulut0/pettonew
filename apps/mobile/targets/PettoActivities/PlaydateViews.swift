import SwiftUI

@available(iOS 16.2, *)
struct CountdownLabel: View {
    let startsAt: Date
    let endsAt: Date?
    let status: String

    var body: some View {
        switch status {
        case "in_progress":
            HStack(spacing: 4) {
                Circle()
                    .fill(PettoTheme.inProgress)
                    .frame(width: 6, height: 6)
                Text(timerInterval: startsAt...(endsAt ?? Date().addingTimeInterval(3600)),
                     pauseTime: nil,
                     countsDown: false,
                     showsHours: true)
                    .monospacedDigit()
                    .font(.system(.subheadline, design: .rounded).weight(.semibold))
            }
        case "cancelled":
            Text("İptal edildi")
                .font(.system(.subheadline, design: .rounded).weight(.semibold))
                .foregroundStyle(PettoTheme.cancelled)
        case "ended":
            Text("Bitti")
                .font(.system(.subheadline, design: .rounded).weight(.semibold))
                .foregroundStyle(PettoTheme.cancelled)
        default:
            HStack(spacing: 3) {
                Image(systemName: "clock.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(PettoTheme.accent)
                Text(timerInterval: Date()...startsAt,
                     pauseTime: nil,
                     countsDown: true,
                     showsHours: true)
                    .monospacedDigit()
                    .font(.system(.subheadline, design: .rounded).weight(.bold))
                    .foregroundStyle(PettoTheme.accent)
            }
        }
    }
}

@available(iOS 16.2, *)
struct CompactCountdown: View {
    let startsAt: Date
    let status: String

    var body: some View {
        if status == "upcoming" {
            Text(timerInterval: Date()...startsAt,
                 pauseTime: nil,
                 countsDown: true,
                 showsHours: false)
                .monospacedDigit()
                .font(.system(size: 13, weight: .bold, design: .rounded))
        } else if status == "in_progress" {
            Image(systemName: "circle.fill")
                .font(.system(size: 8))
                .foregroundStyle(PettoTheme.inProgress)
        } else {
            Image(systemName: "checkmark")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(PettoTheme.cancelled)
        }
    }
}

struct AvatarStack: View {
    let urls: [String]
    let total: Int
    let size: CGFloat
    let strokeColor: Color

    var body: some View {
        HStack(spacing: -size * 0.28) {
            ForEach(Array(urls.prefix(3).enumerated()), id: \.offset) { _, url in
                AvatarBubble(url: url, size: size, stroke: strokeColor)
            }
            if total > urls.count {
                ZStack {
                    Circle()
                        .fill(PettoTheme.accentSoft.opacity(0.18))
                    Circle()
                        .stroke(strokeColor, lineWidth: 1.5)
                    Text("+\(total - urls.count)")
                        .font(.system(size: size * 0.36, weight: .bold, design: .rounded))
                        .foregroundStyle(PettoTheme.accent)
                }
                .frame(width: size, height: size)
            }
        }
    }
}

struct AvatarBubble: View {
    let url: String
    let size: CGFloat
    let stroke: Color

    var body: some View {
        ZStack {
            Circle()
                .fill(PettoTheme.accentSoft.opacity(0.25))
            if let nsurl = URL(string: url) {
                AsyncImage(url: nsurl) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Image(systemName: "pawprint.fill")
                        .font(.system(size: size * 0.45))
                        .foregroundStyle(PettoTheme.accent)
                }
                .clipShape(Circle())
            } else {
                Image(systemName: "pawprint.fill")
                    .font(.system(size: size * 0.45))
                    .foregroundStyle(PettoTheme.accent)
            }
            Circle()
                .stroke(stroke, lineWidth: 1.5)
        }
        .frame(width: size, height: size)
    }
}

@available(iOS 16.2, *)
struct AttendeeChip: View {
    let count: Int
    let max: Int
    let scheme: ColorScheme

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "pawprint.fill")
                .font(.system(size: 10, weight: .semibold))
            Text("\(count)/\(max)")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .monospacedDigit()
        }
        .foregroundStyle(PettoTheme.textSecondary(for: scheme))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(PettoTheme.accent.opacity(0.10))
        )
    }
}

@available(iOS 16.2, *)
struct WaitlistBadge: View {
    let position: Int

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "hourglass")
                .font(.system(size: 10, weight: .bold))
            Text("Sıra #\(position)")
                .font(.system(size: 11, weight: .bold, design: .rounded))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(PettoTheme.accent)
        )
    }
}
