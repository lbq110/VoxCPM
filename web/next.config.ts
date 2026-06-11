import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // The dev-tools badge sits exactly on top of the reader's 目录 button.
  devIndicators: false,
  // This app lives in a subfolder of the VoxCPM repo; pin the workspace root
  // so Turbopack doesn't pick up unrelated lockfiles further up the tree.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
