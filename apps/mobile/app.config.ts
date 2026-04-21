export default {
  name: "Fetcht",
  slug: "petto-mobile",
  scheme: "petto",
  version: "0.11.20",
  orientation: "portrait",
  userInterfaceStyle: "light",
  // react-native-reanimated 4.x requires the new architecture, so this must
  // stay enabled. If you hit TurboModuleRegistry.getEnforcing errors, do a
  // clean rebuild (rm ios/build ios/Pods ios/Podfile.lock → pod install →
  // expo run:ios) rather than flipping this flag.
  newArchEnabled: true,
  icon: "./assets/images/icon.png",
  splash: {
    image: "./assets/images/splash.png",
    resizeMode: "contain",
    backgroundColor: "#E6694A"
  },
  experiments: {
    typedRoutes: true
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
    ]
  ],
  extra: {
    eas: {
      projectId: "a9e0171b-e3bc-4986-9b43-766757cd6b08"
    }
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "app.petto.mobile",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true
      },
      // Required so iOS wakes the JS runtime to handle the inline-reply
      // notification action while the app is suspended / terminated.
      UIBackgroundModes: ["remote-notification"]
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
