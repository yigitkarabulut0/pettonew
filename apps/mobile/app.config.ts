export default {
  name: "Petto",
  slug: "petto-mobile",
  scheme: "petto",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  experiments: {
    typedRoutes: true
  },
  plugins: [
    "expo-router",
    "expo-image",
    "expo-image-picker",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Petto uses your current location to show nearby pet matches."
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
      ITSAppUsesNonExemptEncryption: false
    }
  },
  android: {
    package: "app.petto.mobile",
    adaptiveIcon: {
      backgroundColor: "#E6694A"
    }
  }
};
