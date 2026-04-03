import type { Metadata } from 'next';
import './globals.css';
import { AuthWrapper } from '@/components/layout/AuthWrapper';

export const metadata: Metadata = {
  title: 'ANB Parts — Gestão de Peças',
  description: 'Sistema de gestão de peças ANB Motos',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthWrapper>{children}</AuthWrapper>
      </body>
    </html>
  );
}
