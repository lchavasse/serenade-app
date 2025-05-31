import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'serenade-app-swap-lach.s3.eu-west-2.amazonaws.com',
        pathname: '/images/**',
      },
    ],
  },
};

export default nextConfig;
