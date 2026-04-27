import SwiftUI

/// Petto'nun Live Activity'ye özel renk paleti. Light ve dark modda
/// optimize edilmiş — turuncu marka aksanı her iki modda da kalıyor ama
/// arkaplan / metin hiyerarşisi göze yormayacak şekilde ayrı.
enum PettoTheme {
    // MARK: Brand accent
    static let accentLight = Color(red: 0.902, green: 0.412, blue: 0.290) // #E6694A
    static let accentDark  = Color(red: 1.000, green: 0.510, blue: 0.349) // #FF8259  (dark modda biraz daha sıcak ve görünür)

    static func accent(for scheme: ColorScheme) -> Color {
        scheme == .dark ? accentDark : accentLight
    }

    static func accentSoft(for scheme: ColorScheme) -> Color {
        accent(for: scheme).opacity(scheme == .dark ? 0.18 : 0.12)
    }

    // MARK: Surfaces
    static let surfaceLight  = Color(red: 1.000, green: 0.973, blue: 0.945) // #FFF8F1
    static let surfaceDark   = Color(red: 0.094, green: 0.078, blue: 0.067) // #181411

    static func background(for scheme: ColorScheme) -> Color {
        scheme == .dark ? surfaceDark : surfaceLight
    }

    static func cardSurface(for scheme: ColorScheme) -> Color {
        scheme == .dark
            ? Color.white.opacity(0.05)
            : Color(red: 0.969, green: 0.929, blue: 0.886) // #F7EDE2
    }

    // MARK: Text
    static func textPrimary(for scheme: ColorScheme) -> Color {
        scheme == .dark
            ? Color(red: 0.980, green: 0.949, blue: 0.910) // warm white
            : Color(red: 0.102, green: 0.086, blue: 0.075) // warm near-black
    }

    static func textSecondary(for scheme: ColorScheme) -> Color {
        scheme == .dark
            ? Color(red: 0.612, green: 0.557, blue: 0.510)
            : Color(red: 0.420, green: 0.376, blue: 0.345)
    }

    static func textTertiary(for scheme: ColorScheme) -> Color {
        scheme == .dark
            ? Color.white.opacity(0.30)
            : Color.black.opacity(0.30)
    }

    // MARK: Status
    static let statusActive = Color(red: 0.247, green: 0.714, blue: 0.502)   // #3FB680
    static let statusCancelled = Color(red: 0.612, green: 0.639, blue: 0.686) // #9CA3AF
    static let statusWaitlist = Color(red: 0.918, green: 0.682, blue: 0.247) // #EAAE3F
}
