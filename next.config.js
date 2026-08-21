/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      // Serve AppGPT as a top-level document so Telegram Mini App APIs work normally
      // while keeping the clean public URL https://digitbox.dev/appgpt.
      { source: "/appgpt", destination: "/appgpt/index.html" },
      // Let the Digitbox AI API be reached at /ai/api/... as well as /api/ai/...
      { source: "/ai/api/:path*", destination: "/api/ai/:path*" },
    ];
  },
};

module.exports = nextConfig;
