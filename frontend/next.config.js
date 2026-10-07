/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // O proxy /api (rewrites) corta a requisicao em 30s por padrao e devolve "Internal Server Error" em texto puro.
  // Criar anuncio (Drive + Bling + marketplace + espera do SKU, que no Magalu chega a 90s) pode passar disso; sobe pra 180s.
  experimental: { proxyTimeout: 180000 },
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
