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
  frameworks: ["ActivityKit", "WidgetKit", "SwiftUI"],
};
