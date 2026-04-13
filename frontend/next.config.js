/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL;

    if (!backendUrl) {
      return [];
    }

    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl.replace(/\/$/, '')}/:path*`,
      },
      {
        source: '/api-proxy/:path*',
        destination: `${backendUrl.replace(/\/$/, '')}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
