/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['simple-git', 'ssh2', 'node-ssh', 'cpu-features', 'ssh2-sftp-client'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'ssh2': 'commonjs ssh2',
        'node-ssh': 'commonjs node-ssh',
        'cpu-features': 'commonjs cpu-features',
        'ssh2-sftp-client': 'commonjs ssh2-sftp-client',
      });
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
};

module.exports = nextConfig;
