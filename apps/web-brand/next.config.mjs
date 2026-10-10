import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Monorepo: pin the file-tracing root to the repo root (silences the lockfile warning).
  outputFileTracingRoot: join(here, '..', '..'),
  // Security headers on every response. No framing (clickjacking), no MIME
  // sniffing, a tight referrer and a minimal permissions policy, and HSTS. A
  // full Content-Security-Policy is tracked as a follow-up so it can be tuned
  // against the app without risking a broken console.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default nextConfig;
