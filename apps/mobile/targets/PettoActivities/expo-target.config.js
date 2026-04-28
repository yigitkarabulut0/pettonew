/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: "widget",
  name: "PettoActivities",
  bundleIdentifier: "app.petto.mobile.PettoActivities",
  deploymentTarget: "16.2",
  // Apple requires the widget extension's CFBundleVersion / Short version
  // to match the host app exactly. These values are placeholders — they
  // are overwritten at prebuild time by `plugins/withSyncedExtensionVersions`
  // which reads the host's actual Info.plist and copies the values here.
  // Don't bother bumping these manually; the plugin keeps them in sync.
  version: "0.0.0",
  buildNumber: "0",
  entitlements: {
    "com.apple.security.application-groups": ["group.app.petto.shared"],
  },
  // AppIntents framework, Live Activity action button'larındaki
  // `Button(intent:)` çağrılarının extension process'inde direkt
  // çalışabilmesi için açıkça link'lenmeli.
  frameworks: ["ActivityKit", "WidgetKit", "SwiftUI", "AppIntents"],
  // Widget extension Info.plist override'ı. Ana app'in NSAllowsArbitraryLoads
  // ayarı extension'a otomatik geçmiyor; App Intent'larımız backend'e
  // http://148.230.123.242 ile ulaştığı için (HTTPS değil) bu izni
  // extension'da da açıkça vermek zorundayız, yoksa URLSession exception
  // atıyor (NSAppTransportSecurity policy denied).
  infoPlist: {
    NSAppTransportSecurity: {
      NSAllowsArbitraryLoads: true,
    },
  },
};
