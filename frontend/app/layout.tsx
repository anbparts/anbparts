import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';

export const metadata: Metadata = {
  title: 'ANB Parts — Gestão de Peças',
  description: 'Sistema de gestão de peças ANB Motos',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <main style={{ marginLeft: 'var(--sidebar-w)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
