'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LoginPage, useAuth } from '@/lib/auth';
import { API_BASE } from '@/lib/api-base';
import { GlobalSensitiveNumberMask } from '@/lib/company-values';
import { getNavLabel, Sidebar, type SidebarMode } from './Sidebar';

const DESKTOP_SIDEBAR_WIDTH = 252;
const TABLET_RAIL_WIDTH = 88;

function resolveRequestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function ShellButtonIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { authed, login, logout, user } = useAuth();
  const pathname = usePathname();
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('desktop');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useLayoutEffect(() => {
    if (!authed || typeof window === 'undefined') return undefined;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = resolveRequestUrl(input);
      const isBackendRequest = API_BASE.startsWith('/')
        ? url.startsWith(API_BASE)
          || (typeof window !== 'undefined' && url.startsWith(`${window.location.origin}${API_BASE}`))
        : url.startsWith(API_BASE);

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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const phoneMedia = window.matchMedia('(max-width: 767px)');
    const tabletPortraitMedia = window.matchMedia('(pointer: coarse) and (min-width: 768px) and (max-width: 1024px) and (orientation: portrait)');
    const tabletLandscapeMedia = window.matchMedia('(pointer: coarse) and (min-width: 900px) and (max-width: 1600px) and (orientation: landscape)');

    const syncMode = () => {
      if (phoneMedia.matches) {
        setSidebarMode('phone');
        return;
      }

      if (tabletPortraitMedia.matches) {
        setSidebarMode('tablet-portrait');
        return;
      }

      if (tabletLandscapeMedia.matches) {
        setSidebarMode('tablet-landscape');
        return;
      }

      setSidebarMode('desktop');
    };

    syncMode();
    phoneMedia.addEventListener('change', syncMode);
    tabletPortraitMedia.addEventListener('change', syncMode);
    tabletLandscapeMedia.addEventListener('change', syncMode);

    return () => {
      phoneMedia.removeEventListener('change', syncMode);
      tabletPortraitMedia.removeEventListener('change', syncMode);
      tabletLandscapeMedia.removeEventListener('change', syncMode);
    };
  }, []);

  useEffect(() => {
    setSidebarOpen(sidebarMode === 'desktop');
  }, [sidebarMode]);

  useEffect(() => {
    if (sidebarMode === 'desktop') return;
    setSidebarOpen(false);
  }, [pathname, sidebarMode]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const isOverlayMode = sidebarMode === 'phone' || sidebarMode === 'tablet-portrait';
    if (!isOverlayMode) {
      document.body.style.overflow = '';
      return undefined;
    }

    document.body.style.overflow = sidebarOpen ? 'hidden' : '';

    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarMode, sidebarOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (sidebarMode === 'desktop' || !sidebarOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sidebarMode, sidebarOpen]);

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

  const isDesktop = sidebarMode === 'desktop';
  const isTabletLandscape = sidebarMode === 'tablet-landscape';
  const sidebarOffset = isDesktop
    ? DESKTOP_SIDEBAR_WIDTH
    : isTabletLandscape
    ? (sidebarOpen ? DESKTOP_SIDEBAR_WIDTH : TABLET_RAIL_WIDTH)
    : 0;
  const headerVisible = !isDesktop;
  const currentLabel = getNavLabel(pathname || '/', user);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)' }}>
      <Sidebar
        onLogout={() => { void logout(); }}
        user={user?.displayName || user?.username || ''}
        authUser={user}
        mode={sidebarMode}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onToggle={() => setSidebarOpen((value) => !value)}
      />

      <div
        style={{
          marginLeft: sidebarOffset,
          minWidth: 0,
          maxWidth: '100%',
          minHeight: '100vh',
          overflowX: 'clip',
          transition: 'margin-left 220ms ease',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {headerVisible ? (
          <header
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 80,
              minHeight: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              padding: sidebarMode === 'phone' ? '12px 14px' : '14px 18px',
              background: 'rgba(248, 250, 252, 0.9)',
              backdropFilter: 'blur(12px)',
              borderBottom: '1px solid rgba(226,232,240,.92)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <button
                onClick={() => setSidebarOpen((value) => !value)}
                title={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  border: '1px solid rgba(148,163,184,.22)',
                  background: '#fff',
                  color: '#0f172a',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  boxShadow: '0 8px 20px rgba(15, 23, 42, 0.06)',
                }}
              >
                <ShellButtonIcon open={sidebarOpen} />
              </button>

              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '.12em',
                    color: '#94a3b8',
                    fontFamily: "'JetBrains Mono', monospace",
                    marginBottom: 3,
                  }}
                >
                  Navegacao
                </div>
                <div
                  style={{
                    fontSize: sidebarMode === 'phone' ? 17 : 18,
                    lineHeight: 1.2,
                    fontWeight: 700,
                    color: '#0f172a',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {currentLabel}
                </div>
              </div>
            </div>

            <div
              title={user?.displayName || user?.username || ''}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 10px',
                borderRadius: 999,
                background: '#fff',
                border: '1px solid rgba(148,163,184,.18)',
                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.05)',
                flexShrink: 0,
                maxWidth: sidebarMode === 'phone' ? 56 : 220,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}
              >
                {(user?.displayName || user?.username || 'A')[0]?.toUpperCase() || 'A'}
              </div>

              {sidebarMode !== 'phone' ? (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#334155',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textTransform: 'capitalize',
                  }}
                >
                  {user?.displayName || user?.username || ''}
                </span>
              ) : null}
            </div>
          </header>
        ) : null}

        <main
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: headerVisible ? 'calc(100vh - 64px)' : '100vh',
          }}
        >
          <GlobalSensitiveNumberMask>{children}</GlobalSensitiveNumberMask>
        </main>
      </div>
    </div>
  );
}
