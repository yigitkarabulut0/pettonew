import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.dev",
      },
      {
        protocol: "https",
        hostname: "petto-public.**.r2.cloudflarestorage.com",
      },
    ],
  },
  transpilePackages: ["@petto/ui", "@petto/types"],
};

export default nextConfig;
