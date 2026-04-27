import Foundation

/// Bridges auth + API base URL between the main Fetcht app and the Live
/// Activity widget extension via the shared App Group container. Main app
/// writes on login (and clears on logout); App Intents in the extension
/// read here when they need to make backend requests on the user's behalf.
///
/// Keys are namespaced under `petto.*` so they don't collide with other
/// future App Group entries.
enum AppGroupAuth {
    static let suiteName = "group.app.petto.shared"

    private static let kAccessToken = "petto.accessToken"
    private static let kApiBaseUrl = "petto.apiBaseUrl"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    static var accessToken: String? {
        defaults?.string(forKey: kAccessToken)
    }

    static var apiBaseUrl: String? {
        defaults?.string(forKey: kApiBaseUrl)
    }

    /// Set both atomically. Called from the JS side via the native module.
    static func write(accessToken: String?, apiBaseUrl: String?) {
        let d = defaults
        if let t = accessToken {
            d?.set(t, forKey: kAccessToken)
        } else {
            d?.removeObject(forKey: kAccessToken)
        }
        if let u = apiBaseUrl {
            d?.set(u, forKey: kApiBaseUrl)
        } else {
            d?.removeObject(forKey: kApiBaseUrl)
        }
    }

    static func clear() {
        let d = defaults
        d?.removeObject(forKey: kAccessToken)
        d?.removeObject(forKey: kApiBaseUrl)
    }
}

/// Minimal HTTP client for App Intents. Intentionally tiny — no retries,
/// no JSON decoding (we only need success/failure). Failure is silent —
/// the main app will reconcile state on next foreground.
enum BackendClient {
    @discardableResult
    static func post(path: String, body: [String: Any] = [:]) async -> Bool {
        guard
            let token = AppGroupAuth.accessToken,
            let baseUrl = AppGroupAuth.apiBaseUrl,
            let url = URL(string: baseUrl + path)
        else {
            return false
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !body.isEmpty,
           let data = try? JSONSerialization.data(withJSONObject: body) {
            req.httpBody = data
        }

        do {
            let (_, response) = try await URLSession.shared.data(for: req)
            if let http = response as? HTTPURLResponse {
                return (200...299).contains(http.statusCode)
            }
            return false
        } catch {
            return false
        }
    }
}
