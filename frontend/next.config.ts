import type { NextConfig } from 'next';
import { isLoopbackUrl, parseStrapiUrl } from './lib/strapi-url';

const strapiUrl = parseStrapiUrl(process.env.STRAPI_URL ?? 'http://localhost:1337');
const strapiIsLoopback = isLoopbackUrl(strapiUrl);

if (strapiUrl.protocol !== 'http:' && strapiUrl.protocol !== 'https:') {
  throw new Error(`STRAPI_URL must use http or https, got "${strapiUrl.protocol}" in "${strapiUrl.href}".`);
}

const nextConfig: NextConfig = {
  images: {
    // Strapi's local upload provider serves files from its own origin. Without
    // this, next/image refuses the URL outright rather than rendering it.
    // Derived from STRAPI_URL (not hardcoded) so the pattern always matches
    // whatever origin imageUrl() in lib/media.ts actually emits — see
    // lib/strapi-url.ts for the shared parsing.
    remotePatterns: [
      {
        protocol: strapiUrl.protocol.slice(0, -1) as 'http' | 'https',
        hostname: strapiUrl.hostname,
        port: strapiUrl.port,
        pathname: '/uploads/**',
      },
    ],
    // Next 16 additionally blocks any upstream that resolves to a private/loopback
    // IP as an SSRF guard. That's only ever true when the configured Strapi
    // upstream is itself loopback (local dev, and our verify-*.sh scripts, which
    // run real production builds against localhost:1337). Deriving the flag from
    // the same parsed STRAPI_URL as remotePatterns means the two can never
    // disagree, and it turns itself off the moment Strapi is remote.
    dangerouslyAllowLocalIP: strapiIsLoopback,
  },
};

export default nextConfig;
