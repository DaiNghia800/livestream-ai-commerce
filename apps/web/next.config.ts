import type { NextConfig } from "next";
const config: NextConfig = {
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
};
export default config;
