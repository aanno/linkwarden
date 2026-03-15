/** @type {import('next').NextConfig} */
const { version } = require("./package.json");
const { i18n } = require("./next-i18next.config");

const nextConfig = {
  i18n,
  reactStrictMode: true,
  staticPageGenerationTimeout: 1000,
  images: {
    remotePatterns: [
      // For profile pictures (Google OAuth)
      { hostname: "*.googleusercontent.com" },
    ],

    minimumCacheTTL: 10,
  },
  transpilePackages: [
    "@linkwarden/filesystem",
    "@linkwarden/lib",
    "@linkwarden/prisma",
    "@linkwarden/router",
    "@linkwarden/types",
  ],
  env: {
    version,
  },
  webpack(config, { isServer }) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };

    // Resolve symlinks to their symlink location (not the real path).
    // This ensures workspace packages (e.g. @linkwarden/router) resolve
    // peer dependencies (e.g. next-auth) from apps/web/node_modules
    // rather than from the package's own directory where they aren't installed.
    config.resolve.symlinks = false;

    return config;
  },
};

module.exports = nextConfig;
