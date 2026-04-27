export default {
  name: "Fetcht",
  slug: "petto-mobile",
  scheme: "petto",
  version: "0.14.8",
  orientation: "portrait",
  userInterfaceStyle: "light",
  // react-native-reanimated 4.x requires the new architecture, so this must
  // stay enabled. If you hit TurboModuleRegistry.getEnforcing errors, do a
  // clean rebuild (rm ios/build ios/Pods ios/Podfile.lock → pod install →
  // expo run:ios) rather than flipping this flag.
  newArchEnabled: true,
  icon: "./assets/images/icon.png",
  // Native splash intentionally has no image — we render a custom animated
  // splash from JS (components/animated-splash.tsx) the moment the bundle
  // loads. Keeping the static logo here would show TWO splashes back-to-back
  // (logo flash → animation). Matching the background colour to the
  // animated splash makes the hand-off seamless: a single solid orange
  // screen, then the animation fades in on the same colour.
  splash: {
    backgroundColor: "#F48C28"
  },
  experiments: {
    typedRoutes: true
  },
  // Tells expo-modules-autolinking to scan ./modules for local Expo native
  // modules. Without this, our petto-live-activities module under
  // apps/mobile/modules/ is invisible to autolinking — the JS side falls
  // back to the noop module and Live Activities silently disable.
  autolinking: {
    nativeModulesDir: "./modules"
  },
  plugins: [
    "expo-router",
    "expo-image",
    "expo-image-picker",
    // Explicit expo-notifications config so we can colour the Android
    // badge accent and (later) wire a monochrome notification icon. The
    // category registration for inline reply is done at runtime in
    // lib/notification-actions.ts.
    [
      "expo-notifications",
      {
        color: "#E6694A"
      }
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Fetcht uses your current location to show nearby pet matches."
      }
    ],
    // Generates the PettoActivities iOS extension target (Live Activities +
    // Dynamic Island). Targets are auto-discovered from `targets/` via each
    // expo-target.config.js. The local petto-live-activities Expo module
    // does NOT need a plugin entry — Expo autolinking picks it up from
    // apps/mobile/modules/ on prebuild.
    "@bacons/apple-targets"
  ],
  extra: {
    eas: {
      projectId: "a9e0171b-e3bc-4986-9b43-766757cd6b08"
    }
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "app.petto.mobile",
    // Apple Developer Team ID — read by @bacons/apple-targets to wire the
    // PettoActivities widget extension's signing.
    appleTeamId: "5C2NRK938T",
    // Shared App Group lets the main app and the PettoActivities widget
    // extension exchange data (e.g. cached avatars). The same group id is
    // declared in targets/PettoActivities/expo-target.config.js.
    entitlements: {
      "com.apple.security.application-groups": ["group.app.petto.shared"]
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true
      },
      // Required so iOS wakes the JS runtime to handle the inline-reply
      // notification action while the app is suspended / terminated.
      // Live Activities additionally use this for push-driven updates.
      UIBackgroundModes: ["remote-notification"],
      // Enables Live Activities and lets the app start them while in the
      // foreground. Push-to-start works without this flag, but a foreground
      // request requires it.
      NSSupportsLiveActivities: true
    }
  },
  android: {
    package: "app.petto.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#E6694A"
    },
    // POST_NOTIFICATIONS is auto-added on Android 13+ via the plugin; we
    // list it explicitly for clarity alongside the existing vibration and
    // boot-receiver permissions used by notification channels.
    permissions: ["POST_NOTIFICATIONS", "VIBRATE", "RECEIVE_BOOT_COMPLETED"]
  }
};
