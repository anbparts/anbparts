/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // O proxy /api (rewrites) corta a requisicao em 30s por padrao e devolve "Internal Server Error" em texto puro.
  // Criar anuncio (Drive + Bling + marketplace + espera do SKU) pode passar disso; sobe pra 120s.
  experimental: { proxyTimeout: 120000 },
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
    ];
  },
};

module.exports = nextConfig;
