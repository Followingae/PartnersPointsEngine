import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Monorepo: pin the file-tracing root to the repo root (silences the lockfile warning).
  outputFileTracingRoot: join(here, '..', '..'),
};

export default nextConfig;
