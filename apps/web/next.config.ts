import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  env: {
    PUBLIC_ASSET_BASE_URL: process.env.PUBLIC_ASSET_BASE_URL,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "liveorder-dev-realtime-images.s3.ap-southeast-1.amazonaws.com",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/shop",
        destination: "/admin",
        permanent: false,
      },
      {
        source: "/shop/:path*",
        destination: "/admin/:path*",
        permanent: false,
      },
    ];
  },
};

export default config;
