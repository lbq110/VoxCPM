import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // This app lives in a subfolder of the VoxCPM repo; pin the workspace root
  // so Turbopack doesn't pick up unrelated lockfiles further up the tree.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
