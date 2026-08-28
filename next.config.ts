import type { NextConfig } from 'next';
import { securityHeaders } from './security-headers';

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
