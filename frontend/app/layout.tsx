import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthWrapper } from '@/components/layout/AuthWrapper';
import { CompanyValueVisibilityProvider } from '@/lib/company-values';

export const metadata: Metadata = {
  title: 'ANB Parts — Sistema de Gestão',
  description: 'Sistema interno de gestão de peças ANB Parts',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <CompanyValueVisibilityProvider>
          <AuthWrapper>{children}</AuthWrapper>
        </CompanyValueVisibilityProvider>
      </body>
    </html>
  );
}
