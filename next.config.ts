import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Environment variables that should be available at build time
  env: {
    AI_CONFIDENCE_THRESHOLD: process.env.AI_CONFIDENCE_THRESHOLD,
    USE_MOCK_DATA: process.env.USE_MOCK_DATA,
    DEBUG_AI_RESPONSES: process.env.DEBUG_AI_RESPONSES,
  },

  // Image optimization settings
  images: {
    domains: ["localhost"],
    remotePatterns: [
      // Add any remote patterns needed for your deployment
    ],
  },

  // TypeScript strict mode
  typescript: {
    tsconfigPath: "./tsconfig.json",
  },

  // ESLint configuration
  eslint: {
    ignoreDuringBuilds: false,
  },

  turbopack: {
    // Enable or disable Turbopack features as needed
    // Example: experimental features can be toggled here
  },

  // Webpack configuration for better module resolution
  // webpack: (config, { isServer }) => {
  //   // Handle server-only imports
  //   if (isServer) {
  //     config.resolve.alias = {
  //       ...config.resolve.alias,
  //       '@/lib/server': require('path').resolve(__dirname, 'src/lib/server'),
  //     };
  //   }

  //   return config;
  // },
};

export default nextConfig;
