/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return {
      // AppGPT must be the top-level document, not a DigitBox page wrapped in
      // Layout. beforeFiles makes this win before normal Next.js page routing.
      beforeFiles: [
        { source: "/appgpt", destination: "/appgpt/index.html" },
      ],
      afterFiles: [
        // Let the Digitbox AI API be reached at /ai/api/... as well as /api/ai/...
        { source: "/ai/api/:path*", destination: "/api/ai/:path*" },
      ],
      fallback: [],
    };
  },
};

module.exports = nextConfig;
