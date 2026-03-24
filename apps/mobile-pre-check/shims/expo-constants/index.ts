const appConfig = require("../../app.json");

export enum AppOwnership {
  Expo = "expo"
}

export enum ExecutionEnvironment {
  Bare = "bare",
  Standalone = "standalone",
  StoreClient = "storeClient"
}

export enum UserInterfaceIdiom {
  Handset = "handset",
  Tablet = "tablet",
  Desktop = "desktop",
  TV = "tv",
  Unsupported = "unsupported"
}

const expoConfig = appConfig?.expo ?? {};

const constants = {
  appOwnership: AppOwnership.Expo,
  debugMode: __DEV__,
  deviceName: "iPhone Simulator",
  deviceYearClass: null,
  executionEnvironment: ExecutionEnvironment.StoreClient,
  experienceUrl: "exp://127.0.0.1:8081",
  expoRuntimeVersion: null,
  expoVersion: "54.0.33",
  isHeadless: false,
  linkingUri: "exp://127.0.0.1:8081",
  manifest: expoConfig,
  manifest2: null,
  expoConfig,
  expoGoConfig: expoConfig,
  easConfig: null,
  sessionId: "petto-dev-session",
  statusBarHeight: 0,
  systemFonts: [],
  supportedExpoSdks: ["54.0.0"],
  platform: {
    ios: expoConfig?.ios ?? {}
  }
};

export default constants;
