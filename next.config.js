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
        // DEEPFORGE keeps its public API at /v1/*, but Cloudflare's
        // Next-on-Pages adapter reliably deploys the backend as an Edge API
        // route. Keep this rewrite internal so players never see or configure
        // a backend URL.
        { source: "/v1/:path*", destination: "/api/deepforge/v1/:path*" },
        // AppGPT must be the top-level document, not a DigitBox page wrapped in
        // Layout. beforeFiles makes this win before normal Next.js page routing.
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
