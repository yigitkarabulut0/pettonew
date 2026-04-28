import Foundation

/// App Group bridge: ana Fetcht app'i ile Live Activity widget extension'ı
/// arasında auth + diagnostic state'i taşır. Group identifier her iki
/// target'in entitlements'ında bulunmak zorunda.
enum AppGroupAuth {
    static let suiteName = "group.app.petto.shared"

    private static let kAccessToken = "petto.accessToken"
    private static let kApiBaseUrl = "petto.apiBaseUrl"
    // Diagnostic: App Intent'lar her tetiklendiğinde buraya yazıyor.
    // App tarafı bunu okuyup butonların gerçekten fire'lanıp fire'lanmadığını
    // doğrulayabilir.
    private static let kIntentLog = "petto.intentLog"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    static var accessToken: String? {
        defaults?.string(forKey: kAccessToken)
    }

    static var apiBaseUrl: String? {
        defaults?.string(forKey: kApiBaseUrl)
    }

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

    /// App Intent her perform()'unda buraya tek satır yazıyor: zaman + isim
    /// + sonuç. App tarafı son N kaydı okuyup gösterebilir.
    static func recordIntent(name: String, status: String, detail: String = "") {
        guard let d = defaults else { return }
        var log = d.array(forKey: kIntentLog) as? [String] ?? []
        let ts = ISO8601DateFormatter().string(from: Date())
        let line = "[\(ts)] \(name) → \(status)\(detail.isEmpty ? "" : " — " + detail)"
        log.append(line)
        // Son 20 kayıt yeter.
        if log.count > 20 { log = Array(log.suffix(20)) }
        d.set(log, forKey: kIntentLog)
    }

    // App Intent fallback queue: extension cross-process Activity.activities'ten
    // banner'i bulamayinca burada bir is birakir. Ana app foreground'a
    // gelince bu kuyrugu okur, LA'lari kendi process'inde dismiss eder ve
    // (gerekirse) backend'e tekrar mark-given POST atar (extension ATS
    // veya network sorunu yasadiysa garanti olsun).
    private static let kPendingMedActions = "petto.pendingMedActions"
    private static let kPendingFeedActions = "petto.pendingFeedActions"

    static func enqueueMedicationAction(action: String, medicationId: String, petId: String) {
        guard let d = defaults else { return }
        var queue = d.array(forKey: kPendingMedActions) as? [[String: String]] ?? []
        queue.append([
            "action": action,
            "medicationId": medicationId,
            "petId": petId,
            "ts": ISO8601DateFormatter().string(from: Date()),
        ])
        if queue.count > 20 { queue = Array(queue.suffix(20)) }
        d.set(queue, forKey: kPendingMedActions)
    }

    static func enqueueFeedingAction(action: String, scheduleId: String, petId: String) {
        guard let d = defaults else { return }
        var queue = d.array(forKey: kPendingFeedActions) as? [[String: String]] ?? []
        queue.append([
            "action": action,
            "scheduleId": scheduleId,
            "petId": petId,
            "ts": ISO8601DateFormatter().string(from: Date()),
        ])
        if queue.count > 20 { queue = Array(queue.suffix(20)) }
        d.set(queue, forKey: kPendingFeedActions)
    }
}

enum BackendClient {
    /// Returns true on 2xx response, false otherwise (or on transport error).
    /// Diagnostic'i de App Group'a yazar.
    @discardableResult
    static func post(path: String, body: [String: Any] = [:]) async -> Bool {
        guard let token = AppGroupAuth.accessToken else {
            AppGroupAuth.recordIntent(name: "BackendClient.post", status: "no_token", detail: path)
            return false
        }
        guard let baseUrl = AppGroupAuth.apiBaseUrl else {
            AppGroupAuth.recordIntent(name: "BackendClient.post", status: "no_baseurl", detail: path)
            return false
        }
        guard let url = URL(string: baseUrl + path) else {
            AppGroupAuth.recordIntent(name: "BackendClient.post", status: "bad_url", detail: baseUrl + path)
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
                let ok = (200...299).contains(http.statusCode)
                AppGroupAuth.recordIntent(
                    name: "BackendClient.post",
                    status: ok ? "ok_\(http.statusCode)" : "fail_\(http.statusCode)",
                    detail: path
                )
                return ok
            }
            AppGroupAuth.recordIntent(name: "BackendClient.post", status: "no_http_response", detail: path)
            return false
        } catch {
            AppGroupAuth.recordIntent(
                name: "BackendClient.post",
                status: "exception",
                detail: "\(path) :: \(error.localizedDescription)"
            )
            return false
        }
    }
}
