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
  // Apple requires the widget extension's CFBundleVersion to match the
  // host app exactly. EAS auto-increments the host app remotely (now at
  // 41 from prior production builds), so we have to bump the extension
  // alongside it. If the next production build pushes the host to 42, this
  // value MUST be bumped here too — otherwise EAS Build fails with
  // "CFBundleVersion of an app extension must match that of its parent".
  infoPlist: {
    CFBundleShortVersionString: "0.14.7",
    CFBundleVersion: "41",
  },
};
