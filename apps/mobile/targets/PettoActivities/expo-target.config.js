/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: "widget",
  name: "PettoActivities",
  bundleIdentifier: "app.petto.mobile.PettoActivities",
  deploymentTarget: "16.2",
  entitlements: {
    "com.apple.security.application-groups": ["group.app.petto.shared"],
  },
  frameworks: ["ActivityKit", "WidgetKit", "SwiftUI"],
};
