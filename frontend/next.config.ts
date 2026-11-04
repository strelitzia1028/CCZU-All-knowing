import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'export',
  outputFileTracingRoot: path.resolve(__dirname, '..'),
  trailingSlash: true,
  transpilePackages: ['@cczu/shared'],
  webpack: (config, { dev }) => {
    if (dev && config.cache && config.cache.type === 'filesystem') {
      config.cache.cacheDirectory = path.resolve(
        'node_modules/.cache/next-webpack',
      );
    }
    return config;
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
