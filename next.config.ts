import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/matrix", destination: "/", permanent: true },
      { source: "/matrix/beta", destination: "/beta", permanent: true },
      { source: "/matrix/oauth/start", destination: "/auth/matrix/start", permanent: false },
      { source: "/matrix/signout", destination: "/auth/matrix/signout", permanent: false },
    ];
  },
};

export default nextConfig;
