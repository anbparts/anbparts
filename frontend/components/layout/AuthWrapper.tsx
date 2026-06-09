'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LoginPage, useAuth } from '@/lib/auth';
import { API_BASE } from '@/lib/api-base';
import { GlobalSensitiveNumberMask } from '@/lib/company-values';
import { canAccessPage, isBruno } from '@/lib/permissions';
import { getNavLabel, NAV, Sidebar, type SidebarMode } from './Sidebar';

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

function AccessBlockedPanel({
  pathname,
  user,
  mode,
}: {
  pathname: string;
  user: any;
  mode: SidebarMode;
}) {
  const isDashboard = pathname === '/';
  const isCompact = mode === 'phone';
  const allowedPages = NAV
    .flatMap((group) => {
      if (group.requiresBruno && !isBruno(user) && !user?.isAdmin) return [];
      return group.items;
    })
    .filter((item) => item.href !== '/' && canAccessPage(user, item.href))
    .slice(0, 6);

  return (
    <div
      style={{
        flex: 1,
        minHeight: '100%',
        padding: isCompact ? 16 : 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 920,
          background: '#fff',
          border: '1px solid #dbe3ef',
          borderRadius: isCompact ? 16 : 20,
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.10)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isCompact ? '1fr' : 'minmax(0, 1fr) 260px',
            gap: isCompact ? 0 : 24,
          }}
        >
          <div style={{ padding: isCompact ? 22 : 32 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 11px',
                borderRadius: 999,
                background: '#ecfdf5',
                color: '#047857',
                fontSize: 12,
                fontWeight: 800,
                marginBottom: 18,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: '#10b981',
                  display: 'inline-block',
                }}
              />
              Acesso ativo
            </div>

            <h1
              style={{
                margin: 0,
                fontFamily: 'Fraunces, serif',
                fontSize: isCompact ? 30 : 42,
                lineHeight: 1.05,
                fontWeight: 700,
                color: '#0f172a',
              }}
            >
              {isDashboard ? 'SISTEMA ANB PARTS' : 'Acesso bloqueado'}
            </h1>

            <p
              style={{
                margin: '14px 0 0',
                maxWidth: 620,
                color: '#475569',
                fontSize: isCompact ? 14 : 15,
                lineHeight: 1.7,
              }}
            >
              {isDashboard
                ? 'Seu usuario entrou normalmente, mas o Dashboard nao esta liberado para este perfil.'
                : 'Seu usuario nao tem permissao para acessar esta pagina.'}
            </p>

            <div
              style={{
                marginTop: 18,
                padding: '14px 16px',
                borderRadius: 14,
                border: '1px solid #bfdbfe',
                background: '#eff6ff',
                color: '#1e3a8a',
                fontSize: 13,
                lineHeight: 1.6,
                fontWeight: 600,
              }}
            >
              Use o menu lateral para abrir as paginas liberadas ou solicite ao Bruno a permissao do Dashboard.
            </div>

            {allowedPages.length ? (
              <div style={{ marginTop: 22 }}>
                <div
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    color: '#64748b',
                    fontWeight: 800,
                    marginBottom: 10,
                  }}
                >
                  Paginas liberadas
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isCompact ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 10,
                  }}
                >
                  {allowedPages.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '12px 14px',
                        borderRadius: 12,
                        border: '1px solid #e2e8f0',
                        color: '#0f172a',
                        background: '#fff',
                        textDecoration: 'none',
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      <span>{item.label}</span>
                      <span aria-hidden="true" style={{ color: '#2563eb' }}>›</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  marginTop: 22,
                  padding: '14px 16px',
                  borderRadius: 14,
                  border: '1px solid #fed7aa',
                  background: '#fff7ed',
                  color: '#9a3412',
                  fontSize: 13,
                  lineHeight: 1.6,
                  fontWeight: 700,
                }}
              >
                Nenhuma pagina foi liberada para este usuario ainda.
              </div>
            )}
          </div>

          {!isCompact ? (
            <aside
              style={{
                background: '#0f172a',
                color: '#fff',
                padding: 28,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 24,
              }}
            >
              <div>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    background: '#1d4ed8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: 20,
                    marginBottom: 18,
                  }}
                >
                  ANB
                </div>
                <div style={{ fontSize: 18, lineHeight: 1.3, fontWeight: 800 }}>
                  Ambiente interno protegido
                </div>
                <div style={{ marginTop: 10, color: '#cbd5e1', fontSize: 13, lineHeight: 1.6 }}>
                  Perfil de acesso aplicado para {user?.displayName || user?.username || 'usuario'}.
                </div>
              </div>

              <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.6 }}>
                Permissoes de pagina e processo sao controladas em Configuracoes.
              </div>
            </aside>
          ) : null}
        </div>
      </section>
    </div>
  );
}

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  description: string;
  href: string;
  meta?: string;
  createdAt?: string;
  read: boolean;
};

function NotificationsBox({ sidebarOffset, inline }: { sidebarOffset: number; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  async function loadNotifications() {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/notificacoes`, { credentials: 'include', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data.ok === false) return;
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnread(Number(data.unread || 0));
    } catch {
      // silencioso para nao atrapalhar o uso do sistema
    } finally {
      setLoading(false);
    }
  }

  async function markUnreadAsRead(currentItems: NotificationItem[]) {
    const ids = currentItems.filter((item) => !item.read).map((item) => item.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item)));
    setUnread(0);
    try {
      await fetch(`${API_BASE}/notificacoes/read`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // na proxima leitura o backend corrige o estado
    }
  }

  useEffect(() => {
    void loadNotifications();
    const timer = window.setInterval(() => { void loadNotifications(); }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  const left = sidebarOffset > 0 ? Math.max(12, sidebarOffset - 62) : 64;

  return (
    <div style={inline ? { position: 'relative', flexShrink: 0 } : { position: 'fixed', top: 18, left, zIndex: 140 }}>
      <button
        type="button"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) void markUnreadAsRead(items);
        }}
        title={unread > 0 ? `${unread} notificacao(oes) nova(s)` : 'Notificacoes'}
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          border: unread > 0 ? '1px solid #fecaca' : '1px solid rgba(148,163,184,.25)',
          background: unread > 0 ? '#dc2626' : '#fff',
          color: unread > 0 ? '#fff' : '#0f172a',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 14px 32px rgba(15, 23, 42, 0.14)',
          position: 'relative',
        }}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 ? (
          <span
            style={{
              position: 'absolute',
              top: -5,
              right: -5,
              minWidth: 18,
              height: 18,
              borderRadius: 999,
              background: '#fff',
              color: '#dc2626',
              fontSize: 10,
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #fecaca',
              padding: '0 4px',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          style={{
            ...(inline
              ? { position: 'fixed', top: 68, right: 12, left: 12, zIndex: 200 }
              : { marginTop: 10 }),
            width: inline ? 'auto' : 'min(360px, calc(100vw - 24px))',
            maxHeight: 'min(520px, calc(100vh - 80px))',
            overflow: 'hidden',
            borderRadius: 16,
            border: '1px solid #dbe3ef',
            background: '#fff',
            boxShadow: '0 24px 70px rgba(15, 23, 42, 0.18)',
          }}
        >
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>Notificacoes</div>
              <div style={{ marginTop: 2, fontSize: 12, color: '#64748b' }}>
                {loading ? 'Atualizando...' : `${items.length} pendencia(s) ativa(s)`}
              </div>
            </div>
            <button type="button" onClick={() => { void loadNotifications(); }} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, padding: '6px 9px', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
              Atualizar
            </button>
          </div>

          <div style={{ maxHeight: 430, overflowY: 'auto' }}>
            {!items.length ? (
              <div style={{ padding: 18, color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
                Nenhuma notificacao ativa para seu usuario.
              </div>
            ) : (
              items.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  style={{
                    display: 'block',
                    textDecoration: 'none',
                    padding: '12px 16px',
                    borderBottom: '1px solid #f1f5f9',
                    background: item.read ? '#fff' : '#fff7f7',
                    color: '#0f172a',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, lineHeight: 1.35 }}>{item.title}</div>
                    {!item.read ? <span style={{ color: '#dc2626', fontSize: 11, fontWeight: 900 }}>Novo</span> : null}
                  </div>
                  <div style={{ marginTop: 5, fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>{item.description || '-'}</div>
                  {item.meta ? <div style={{ marginTop: 5, fontSize: 11, color: '#2563eb', fontWeight: 800 }}>{item.meta}</div> : null}
                </a>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
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
        const payload = await response.clone().json().catch(() => null);
        const message = String(payload?.error || '');
        if (/sess[aã]o invalida|sess[aã]o expirada|login novamente/i.test(message)) {
          void logout();
        }
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
  const canOpenCurrentPage = canAccessPage(user, pathname || '/');

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
      {!headerVisible && <NotificationsBox sidebarOffset={sidebarOffset} />}

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

            <NotificationsBox sidebarOffset={0} inline />

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
          <GlobalSensitiveNumberMask>
            {canOpenCurrentPage ? children : <AccessBlockedPanel pathname={pathname || '/'} user={user} mode={sidebarMode} />}
          </GlobalSensitiveNumberMask>
        </main>
      </div>
    </div>
  );
}
