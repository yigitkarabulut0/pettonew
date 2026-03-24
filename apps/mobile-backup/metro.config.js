const path = require("path");
const fs = require("fs");
const { getDefaultConfig } = require("expo/metro-config");
const { resolve } = require("metro-resolver");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  path.resolve(workspaceRoot, "packages/contracts"),
  path.resolve(workspaceRoot, "packages/design-tokens")
].filter(fs.existsSync);

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules")
].filter(fs.existsSync);

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "expo-modules-core": path.resolve(projectRoot, "shims/expo-modules-core"),
  "expo-constants": path.resolve(projectRoot, "shims/expo-constants"),
  react: path.resolve(workspaceRoot, "node_modules/react"),
  "react/jsx-runtime": path.resolve(workspaceRoot, "node_modules/react/jsx-runtime.js"),
  "react/jsx-dev-runtime": path.resolve(workspaceRoot, "node_modules/react/jsx-dev-runtime.js")
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "expo-modules-core") {
    return {
      filePath: path.resolve(projectRoot, "shims/expo-modules-core/index.ts"),
      type: "sourceFile"
    };
  }

  if (moduleName === "expo-constants") {
    return {
      filePath: path.resolve(projectRoot, "shims/expo-constants/index.ts"),
      type: "sourceFile"
    };
  }

  if (moduleName === "react") {
    return {
      filePath: path.resolve(workspaceRoot, "node_modules/react/index.js"),
      type: "sourceFile"
    };
  }

  if (moduleName === "react/jsx-runtime") {
    return {
      filePath: path.resolve(workspaceRoot, "node_modules/react/jsx-runtime.js"),
      type: "sourceFile"
    };
  }

  if (moduleName === "react/jsx-dev-runtime") {
    return {
      filePath: path.resolve(workspaceRoot, "node_modules/react/jsx-dev-runtime.js"),
      type: "sourceFile"
    };
  }

  return resolve(context, moduleName, platform);
};

config.resolver.unstable_enableSymlinks = true;

module.exports = config;
