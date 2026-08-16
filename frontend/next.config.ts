import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Strapi's local upload provider serves files from its own origin. Without
    // this, next/image refuses the URL outright rather than rendering it.
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '1337', pathname: '/uploads/**' },
    ],
  },
};

export default nextConfig;
