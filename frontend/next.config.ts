import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    // Linting is not part of the hackathon build gate; keep `next build` fast and deterministic.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
