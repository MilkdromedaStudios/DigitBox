/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      // Let the Digitbox AI API be reached at /ai/api/... as well as /api/ai/...
      { source: "/ai/api/:path*", destination: "/api/ai/:path*" },
    ];
  },
};

module.exports = nextConfig;
