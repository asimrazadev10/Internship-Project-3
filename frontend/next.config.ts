import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Strapi's local upload provider serves files from its own origin. Without
    // this, next/image refuses the URL outright rather than rendering it.
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '1337', pathname: '/uploads/**' },
    ],
    // Next 16 additionally blocks any upstream that resolves to a private/loopback
    // IP as an SSRF guard, which localhost:1337 always does in local dev. The
    // remotePatterns allowlist above already restricts which host/path may be
    // fetched, so this is safe for this fixed, non-user-controlled origin.
    dangerouslyAllowLocalIP: true,
  },
};

export default nextConfig;
