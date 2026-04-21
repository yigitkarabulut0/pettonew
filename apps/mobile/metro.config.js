const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules")
];

config.resolver.unstable_enableSymlinks = true;

// Deduplicate native-registering packages across the pnpm workspace.
// Without this, Metro ended up bundling two copies of react-native-screens
// (one from apps/mobile/node_modules, another from
// @react-navigation/bottom-tabs/node_modules/…), which triggered
// "Invariant Violation: Tried to register two views with the same name
// RNSScreen" at runtime. Forcing every import to resolve to the local
// copy makes native view registration idempotent.
const NATIVE_SINGLETONS = [
  "react-native",
  "react-native-screens",
  "react-native-gesture-handler",
  "react-native-safe-area-context",
  "react-native-reanimated",
  "react-native-worklets",
  "react-native-maps",
  "react-native-svg"
];

config.resolver.extraNodeModules = NATIVE_SINGLETONS.reduce((acc, pkg) => {
  const localPath = path.resolve(projectRoot, "node_modules", pkg);
  const workspacePath = path.resolve(workspaceRoot, "node_modules", pkg);
  if (require("fs").existsSync(localPath)) {
    acc[pkg] = localPath;
  } else if (require("fs").existsSync(workspacePath)) {
    acc[pkg] = workspacePath;
  }
  return acc;
}, {});

// Block nested node_modules/{singleton} paths so hoisted-package
// duplicates under @react-navigation/* can't sneak in as a second
// instance.
const blockPattern = new RegExp(
  `(<rootDir>|${workspaceRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})` +
    `/node_modules/.+/node_modules/(` +
    NATIVE_SINGLETONS.map((p) => p.replace(/\//g, "\\/")).join("|") +
    `)/.*`
);
config.resolver.blockList = Array.isArray(config.resolver.blockList)
  ? [...config.resolver.blockList, blockPattern]
  : [blockPattern];

module.exports = config;
