'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { isDetranAllowedUser } from '@/lib/detran-access';

export default function DetranLayout({ children }: { children: React.ReactNode }) {
  const { authed, user } = useAuth();
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  if (authed === null) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div
          style={{
            background: 'var(--white)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: '18px 20px',
            boxShadow: 'var(--shadow-sm)',
            color: 'var(--ink-muted)',
            fontSize: 13,
          }}
        >
          Validando acesso ao modulo Detran...
        </div>
      </div>
    );
  }

  if (!isDetranAllowedUser(user)) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isPhone ? 14 : 28,
          background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 620,
            background: 'var(--white)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: isPhone ? '18px 18px 14px' : '22px 24px 16px',
              borderBottom: '1px solid var(--border)',
              background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '.14em',
                color: 'var(--blue-500)',
                fontFamily: 'Geist Mono, monospace',
              }}
            >
              Modulo Restrito
            </div>
            <div
              style={{
                marginTop: 8,
                fontFamily: 'Fraunces, serif',
                fontSize: isPhone ? 24 : 28,
                lineHeight: 1.1,
                color: 'var(--ink)',
              }}
            >
              Area Detran liberada somente para o Bruno
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 13,
                lineHeight: 1.7,
                color: 'var(--ink-muted)',
              }}
            >
              O menu e as telas da POC do SISDEV ficam escondidos para os demais usuarios enquanto a integracao ainda esta em fase inicial.
            </div>
          </div>

          <div style={{ padding: isPhone ? 18 : 24, display: 'grid', gap: 12 }}>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '12px 14px',
                background: 'var(--gray-50)',
                fontSize: 13,
                lineHeight: 1.7,
                color: 'var(--ink)',
              }}
            >
              Usuario atual: <strong>{user?.displayName || user?.username || 'Nao identificado'}</strong>
            </div>

            <div
              style={{
                border: '1px dashed var(--border)',
                borderRadius: 12,
                padding: '12px 14px',
                fontSize: 13,
                lineHeight: 1.7,
                color: 'var(--ink-muted)',
              }}
            >
              Quando a automacao do SISDEV estiver madura, a gente pode ampliar esse acesso para outros perfis com mais tranquilidade.
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link
                href="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px 16px',
                  borderRadius: 10,
                  background: 'var(--ink)',
                  color: '#fff',
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Voltar ao dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
