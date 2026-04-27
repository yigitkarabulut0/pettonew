import SwiftUI

enum PettoTheme {
    static let accent = Color(red: 0.902, green: 0.412, blue: 0.290)
    static let accentSoft = Color(red: 0.957, green: 0.549, blue: 0.157)
    static let cream = Color(red: 1.0, green: 0.969, blue: 0.941)
    static let inProgress = Color(red: 0.247, green: 0.714, blue: 0.502)
    static let cancelled = Color(red: 0.612, green: 0.639, blue: 0.686)

    static func background(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(.systemBackground) : cream
    }

    static func textPrimary(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Color.white : Color(red: 0.094, green: 0.094, blue: 0.106)
    }

    static func textSecondary(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Color.white.opacity(0.66) : Color(red: 0.388, green: 0.408, blue: 0.451)
    }
}
