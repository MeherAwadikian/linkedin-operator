import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The OpenNext Cloudflare adapter injects `output: 'standalone'` during its own
  // build on Linux. We do NOT set it here: standalone output needs symlinks,
  // which fail with EPERM on Windows without Developer Mode — keeping normal
  // `next build` working locally. The CF build runs on Linux (see DEPLOY-CLOUDFLARE.md).
  // Workspace packages ship TypeScript source; Next transpiles them.
  transpilePackages: ['@lo/core', '@lo/schemas'],
  // Pin tracing to the monorepo root (a stray parent-dir lockfile otherwise
  // makes Next infer the wrong root).
  outputFileTracingRoot: path.join(import.meta.dirname, '..', '..'),
};

export default nextConfig;
