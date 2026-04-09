'use client';

import { useLayoutEffect } from 'react';
import { LoginPage, useAuth } from '@/lib/auth';
import { Sidebar } from './Sidebar';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333').replace(/\/$/, '');

function resolveRequestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { authed, login, logout, user } = useAuth();

  useLayoutEffect(() => {
    if (!authed || typeof window === 'undefined') return undefined;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = resolveRequestUrl(input);
      const isBackendRequest = url.startsWith(API_BASE);

      const response = await originalFetch(input as any, isBackendRequest
        ? { ...init, credentials: 'include' }
        : init);

      if (isBackendRequest && response.status === 401) {
        void logout();
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [authed, logout]);

  if (authed === null) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--gray-50)',
        }}
      >
        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 13, color: 'var(--ink-muted)' }}>
          Carregando...
        </div>
      </div>
    );
  }

  if (!authed) {
    return <LoginPage onLogin={login} />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar onLogout={() => { void logout(); }} user={user?.displayName || user?.username || ''} />
      <main
        style={{
          marginLeft: 'var(--sidebar-w)',
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          width: 'calc(100vw - var(--sidebar-w))',
        }}
      >
        {children}
      </main>
    </div>
  );
}
