import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source; Next transpiles them.
  transpilePackages: ['@lo/core', '@lo/schemas'],
  // Pin tracing to the monorepo root (a stray parent-dir lockfile otherwise
  // makes Next infer the wrong root).
  outputFileTracingRoot: path.join(import.meta.dirname, '..', '..'),
};

export default nextConfig;
