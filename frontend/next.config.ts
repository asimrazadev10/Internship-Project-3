import type { NextConfig } from 'next';

const strapiUrl = process.env.STRAPI_URL ?? 'http://localhost:1337';
const strapiIsLoopback = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(strapiUrl);

const nextConfig: NextConfig = {
  images: {
    // Strapi's local upload provider serves files from its own origin. Without
    // this, next/image refuses the URL outright rather than rendering it.
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '1337', pathname: '/uploads/**' },
    ],
    // Next 16 additionally blocks any upstream that resolves to a private/loopback
    // IP as an SSRF guard. That's only ever true when the configured Strapi
    // upstream is itself loopback (local dev, and our verify-*.sh scripts, which
    // run real production builds against localhost:1337). Deriving the flag from
    // STRAPI_URL means it turns itself off the moment Strapi is remote, so it
    // can't be left on by accident in a production config.
    dangerouslyAllowLocalIP: strapiIsLoopback,
  },
};

export default nextConfig;
