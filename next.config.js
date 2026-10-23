/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return {
      beforeFiles: [
        // The DigitBox account API (auth, profile, billing) lives at /v1/*,
        // but Cloudflare's Next-on-Pages adapter reliably deploys the backend
        // as an Edge API route. Keep this rewrite internal so visitors never
        // see or configure a backend URL.
        { source: "/v1/:path*", destination: "/api/deepforge/v1/:path*" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    // Old portfolio URLs land on their entertainment-hub equivalents.
    return [
      { source: "/projects/eaglercraft-launcher", destination: "/projects/minecraft", permanent: false },
      { source: "/gallery", destination: "/games", permanent: false },
      { source: "/projects", destination: "/games", permanent: false },
      { source: "/appgpt", destination: "/", permanent: false },
      { source: "/beta", destination: "/", permanent: false },
      { source: "/beta/:path*", destination: "/", permanent: false },
    ];
  },
};

module.exports = nextConfig;
