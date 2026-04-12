export default {
  name: "Fetcht",
  slug: "petto-mobile",
  scheme: "petto",
  version: "0.5.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
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
      }
    }
  },
  android: {
    package: "app.petto.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#E6694A"
    }
  }
};
