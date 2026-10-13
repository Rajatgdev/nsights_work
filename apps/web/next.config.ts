import type { NextConfig } from 'next';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load the monorepo-root .env so the web app (API routes, db client) sees it.
config({ path: resolve(process.cwd(), '../../.env') });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are TS source; transpile them.
  transpilePackages: [
    '@nsights/shared',
    '@nsights/db',
    '@nsights/calc',
    '@nsights/charts',
    '@nsights/export',
    '@nsights/commentary',
    '@nsights/auth',
    '@nsights/billing',
    '@nsights/ui',
  ],
  // Keep native/server-only deps out of the client bundle.
  serverExternalPackages: ['@resvg/resvg-js', 'bullmq', 'stripe'],
  webpack: (config) => {
    // Workspace packages author relative imports with `.js` extensions
    // (valid for NodeNext/ESM). Teach webpack to resolve `.js` → `.ts`/`.tsx`
    // so transpilePackages can bundle them.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
