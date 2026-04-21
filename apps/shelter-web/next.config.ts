import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["@petto/contracts", "@petto/design-tokens"],
  turbopack: {
    root: path.resolve(rootDirectory, "../..")
  }
};

export default nextConfig;
