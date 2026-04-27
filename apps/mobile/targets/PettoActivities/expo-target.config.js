/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: "widget",
  name: "PettoActivities",
  bundleIdentifier: "app.petto.mobile.PettoActivities",
  deploymentTarget: "16.2",
  // Apple requires the widget extension's CFBundleVersion / Short version
  // to match the host app exactly. EAS auto-increments the host remotely
  // (currently at 41 from prior production builds). apple-targets v4 reads
  // these top-level `version` / `buildNumber` fields and writes them into
  // the extension's Info.plist; using `infoPlist.CFBundleVersion` did NOT
  // override the default of '1', producing the EAS Build mismatch warning.
  // If the next production build pushes the host to 42, bump `buildNumber`
  // here too — otherwise iOS will refuse to load the extension.
  version: "0.14.7",
  buildNumber: "41",
  entitlements: {
    "com.apple.security.application-groups": ["group.app.petto.shared"],
  },
  frameworks: ["ActivityKit", "WidgetKit", "SwiftUI"],
};
