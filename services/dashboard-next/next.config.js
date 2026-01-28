/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Skip type checking during Docker builds (SKIP_TYPE_CHECK=true)
  typescript: {
    ignoreBuildErrors: process.env.SKIP_TYPE_CHECK === 'true',
  },
  eslint: {
    ignoreDuringBuilds: process.env.SKIP_TYPE_CHECK === 'true',
  },
  experimental: {
    serverComponentsExternalPackages: ['simple-git', 'ssh2', 'node-ssh', 'cpu-features', 'ssh2-sftp-client', 'ioredis', 'stripe-replit-sync'],
    instrumentationHook: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'ssh2': 'commonjs ssh2',
        'node-ssh': 'commonjs node-ssh',
        'cpu-features': 'commonjs cpu-features',
        'ssh2-sftp-client': 'commonjs ssh2-sftp-client',
        'ioredis': 'commonjs ioredis',
        'stripe-replit-sync': 'commonjs stripe-replit-sync',
      });
    } else {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        dns: false,
        fs: false,
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/terminal-ws/:path*',
        destination: 'http://localhost:3001/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
