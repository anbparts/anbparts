'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

type NavItem = {
  href: string;
  icon: string;
  label: string;
};

type NavGroup = {
  section: string;
  items: NavItem[];
};

export type SidebarMode = 'phone' | 'tablet-portrait' | 'tablet-landscape' | 'desktop';

export const NAV: NavGroup[] = [
  {
    section: 'Principal',
    items: [
      { href: '/', icon: 'dashboard', label: 'Dashboard' },
      { href: '/motos', icon: 'moto', label: 'Motos' },
      { href: '/cadastro', icon: 'clipboard', label: 'Cadastro' },
      { href: '/estoque', icon: 'box', label: 'Estoque' },
      { href: '/inventario', icon: 'inventory', label: 'Inventario' },
      { href: '/empresa', icon: 'building', label: 'Empresa' },
    ],
  },
  {
    section: 'Financeiro',
    items: [
      { href: '/faturamento', icon: 'chart-bars', label: 'Fat. por Moto' },
      { href: '/faturamento/geral', icon: 'chart-line', label: 'Fat. Geral' },
      { href: '/despesas-receita', icon: 'compare', label: 'Despesas x Receita' },
      { href: '/dre', icon: 'file-text', label: 'DRE' },
      { href: '/despesas', icon: 'receipt', label: 'Despesas' },
      { href: '/prejuizos', icon: 'alert', label: 'Prejuizos' },
      { href: '/investimentos', icon: 'briefcase', label: 'Investimentos' },
    ],
  },
  {
    section: 'Bling ERP',
    items: [
      { href: '/bling/vendas', icon: 'shopping-cart', label: 'Vendas' },
      { href: '/bling/relatorio-vendas', icon: 'clipboard', label: 'Relatorio de Vendas' },
      { href: '/bling/produtos', icon: 'package-search', label: 'Produtos' },
      { href: '/bling/auditoria-automatica', icon: 'radar', label: 'Auditoria Automatica' },
    ],
  },
  {
    section: 'Mercado Livre',
    items: [
      { href: '/mercado-livre/perguntas', icon: 'message-circle', label: 'Perguntas' },
    ],
  },
  {
    section: 'Configuracoes',
    items: [
      { href: '/bling', icon: 'plug', label: 'Conf. Conexao Bling' },
      { href: '/configuracoes-gerais', icon: 'mail', label: 'Conf. E-mails' },
      { href: '/bling/config-produtos', icon: 'sliders', label: 'Conf. Produtos Bling' },
      { href: '/conf-gerais', icon: 'settings', label: 'Conf. Gerais' },
      { href: '/config-ml', icon: 'store', label: 'Config. ML' },
      { href: '/conf-nuvemshop', icon: 'cloud', label: 'Conf. Nuvemshop' },
      { href: '/import', icon: 'upload', label: 'Importar Excel' },
    ],
  },
];

function isNavActive(path: string, href: string) {
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}

function getActiveHref(path: string) {
  let bestMatch = '/';

  for (const group of NAV) {
    for (const item of group.items) {
      if (!isNavActive(path, item.href)) continue;
      if (item.href.length > bestMatch.length) {
        bestMatch = item.href;
      }
    }
  }

  return bestMatch;
}

export function getNavLabel(path: string) {
  const activeHref = getActiveHref(path);

  for (const group of NAV) {
    for (const item of group.items) {
      if (item.href === activeHref) {
        return item.label;
      }
    }
  }

  return 'ANB Parts';
}

function SidebarIcon({ name, active, size = 16 }: { name: string; active: boolean; size?: number }) {
  const color = active ? '#ffffff' : 'rgba(255,255,255,.74)';
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  const icons: Record<string, JSX.Element> = {
    dashboard: <svg {...common}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
    moto: <svg {...common}><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" /><path d="M6 18h6l3-8h4" /><path d="M10 10h4l2 4" /></svg>,
    box: <svg {...common}><path d="M3 7 12 3l9 4-9 4-9-4Z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></svg>,
    upload: <svg {...common}><path d="M12 16V5" /><path d="m7 10 5-5 5 5" /><path d="M4 19h16" /></svg>,
    inventory: <svg {...common}><path d="M20 7 12 3 4 7" /><path d="M4 7v10l8 4 8-4V7" /><path d="M9 11h6" /></svg>,
    building: <svg {...common}><path d="M4 21V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14" /><path d="M16 11h4a1 1 0 0 1 1 1v9" /><path d="M8 9h2" /><path d="M8 13h2" /><path d="M8 17h2" /><path d="M12 9h2" /><path d="M12 13h2" /><path d="M12 17h2" /><path d="M9 21v-3h2v3" /></svg>,
    'chart-bars': <svg {...common}><path d="M5 20V10" /><path d="M12 20V4" /><path d="M19 20v-7" /></svg>,
    'chart-line': <svg {...common}><path d="M3 17 9 11l4 4 8-8" /><path d="M21 7v6h-6" /></svg>,
    compare: <svg {...common}><path d="M9 3H5a2 2 0 0 0-2 2v4" /><path d="M15 21h4a2 2 0 0 0 2-2v-4" /><path d="m3 9 3-3 3 3" /><path d="m21 15-3 3-3-3" /></svg>,
    'file-text': <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h6" /></svg>,
    receipt: <svg {...common}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M8 8h8" /><path d="M8 12h8" /></svg>,
    alert: <svg {...common}><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /></svg>,
    briefcase: <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 12h18" /></svg>,
    'shopping-cart': <svg {...common}><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /><path d="M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H7" /></svg>,
    clipboard: <svg {...common}><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3" /><path d="M8 11h8" /><path d="M8 15h5" /></svg>,
    'package-search': <svg {...common}><path d="M3 7 12 3l9 4-9 4-9-4Z" /><path d="M3 7v10l9 4 9-4V7" /><circle cx="18" cy="18" r="2.5" /><path d="m20 20 2 2" /></svg>,
    radar: <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="M12 12 18 6" /></svg>,
    'message-circle': <svg {...common}><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.7-.8L3 21l1.8-5.4a8.4 8.4 0 0 1-.8-3.6A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z" /></svg>,
    plug: <svg {...common}><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M7 8h10v3a5 5 0 0 1-10 0V8Z" /></svg>,
    mail: <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>,
    sliders: <svg {...common}><path d="M4 21v-7" /><path d="M4 10V3" /><path d="M12 21v-4" /><path d="M12 13V3" /><path d="M20 21v-9" /><path d="M20 8V3" /><path d="M1 14h6" /><path d="M9 13h6" /><path d="M17 8h6" /></svg>,
    store: <svg {...common}><path d="M4 10h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10Z" /><path d="M3 10 5 4h14l2 6" /><path d="M9 14h6" /></svg>,
    cloud: <svg {...common}><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10Z" /></svg>,
    settings: <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.54V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.54 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.54-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.54-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.06 3.4l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.54V2a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.54h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V8c0 .68.4 1.3 1.03 1.58.16.07.33.1.51.1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.32Z" /></svg>,
  };

  return icons[name] || <span style={{ width: 16, height: 16 }} />;
}

function ControlIcon({ name }: { name: 'menu' | 'close' | 'collapse' | 'expand' | 'logout' }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  const icons: Record<string, JSX.Element> = {
    menu: <svg {...common}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>,
    close: <svg {...common}><path d="M6 6 18 18" /><path d="m18 6-12 12" /></svg>,
    collapse: <svg {...common}><path d="M15 18 9 12l6-6" /><path d="M19 5v14" /></svg>,
    expand: <svg {...common}><path d="m9 18 6-6-6-6" /><path d="M5 5v14" /></svg>,
    logout: <svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>,
  };

  return icons[name];
}

type SidebarProps = {
  onLogout?: () => void;
  user?: string;
  mode?: SidebarMode;
  open?: boolean;
  onClose?: () => void;
  onToggle?: () => void;
};

export function Sidebar({
  onLogout,
  user,
  mode = 'desktop',
  open = true,
  onClose,
  onToggle,
}: SidebarProps) {
  const path = usePathname();
  const router = useRouter();
  const activeHref = getActiveHref(path);
  const isDrawer = mode === 'phone' || mode === 'tablet-portrait';
  const isTabletLandscape = mode === 'tablet-landscape';
  const isDesktop = mode === 'desktop';
  const isPhone = mode === 'phone';
  const expanded = isDrawer ? open : isTabletLandscape ? open : true;
  const sidebarWidth = isTabletLandscape ? (expanded ? 252 : 88) : 252;
  const showBackdrop = isDrawer && open;
  const initial = (user || 'A')[0]?.toUpperCase() || 'A';
  const compactDesktop = isDesktop && expanded;
  const desktopNavFontSize = compactDesktop ? 13 : 13.5;
  const desktopNavHeight = compactDesktop ? 36 : 42;
  const desktopIconBox = compactDesktop ? 24 : 26;
  const desktopIconSize = compactDesktop ? 14 : 16;
  const drawerViewportHeight = isPhone ? '100svh' : isDrawer ? '100dvh' : '100vh';
  const drawerSafeTop = 'env(safe-area-inset-top, 0px)';
  const drawerSafeBottom = 'env(safe-area-inset-bottom, 0px)';
  const drawerNavBottomPadding = isPhone
    ? `calc(${drawerSafeBottom} + 34px)`
    : `calc(${drawerSafeBottom} + 20px)`;
  const drawerFooterBottomPadding = isPhone
    ? `calc(${drawerSafeBottom} + 16px)`
    : `calc(${drawerSafeBottom} + 10px)`;

  const handleNavigate = (href: string) => {
    const isCurrentRoute = href === activeHref;

    if (isDrawer && isCurrentRoute) {
      onClose?.();
      return;
    }

    if (isTabletLandscape && expanded && isCurrentRoute) {
      onClose?.();
    }
  };

  return (
    <>
      {showBackdrop ? (
        <button
          aria-label="Fechar menu"
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            border: 'none',
            padding: 0,
            zIndex: 109,
            cursor: 'pointer',
          }}
        />
      ) : null}

      <aside
        style={{
          width: sidebarWidth,
          minHeight: drawerViewportHeight,
          height: drawerViewportHeight,
          maxHeight: drawerViewportHeight,
          background: 'linear-gradient(180deg, #08111f 0%, #0a1628 100%)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: isDrawer ? 'auto' : 0,
          zIndex: 110,
          transform: isDrawer ? (open ? 'translateX(0)' : 'translateX(calc(-100% - 20px))') : 'translateX(0)',
          transition: 'transform 220ms ease, width 220ms ease',
          boxShadow: isDrawer && open ? '0 18px 50px rgba(2, 6, 23, 0.28)' : '0 12px 30px rgba(2, 6, 23, 0.12)',
          fontFamily: "'Inter', system-ui, sans-serif",
          borderRight: '1px solid rgba(255,255,255,.06)',
          pointerEvents: isDrawer && !open ? 'none' : 'auto',
          overflow: 'hidden',
          paddingTop: isDrawer ? drawerSafeTop : 0,
          paddingBottom: isDrawer ? drawerSafeBottom : 0,
        }}
      >
        <div
          style={{
            padding: expanded
              ? compactDesktop
                ? '14px 14px'
                : '18px 16px'
              : '16px 10px',
            borderBottom: '1px solid rgba(255,255,255,.08)',
            display: 'flex',
            flexDirection: expanded ? 'row' : 'column',
            alignItems: 'center',
            gap: expanded ? (compactDesktop ? 10 : 12) : 10,
            flexShrink: 0,
          }}
        >
          <img
            src="/logo.jpg"
            alt="ANB Parts"
            style={{
              width: expanded ? (compactDesktop ? 42 : 46) : 42,
              height: expanded ? (compactDesktop ? 42 : 46) : 42,
              borderRadius: compactDesktop ? 10 : 12,
              objectFit: 'cover',
              display: 'block',
              flexShrink: 0,
              background: '#fff',
            }}
          />

          {expanded ? (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: compactDesktop ? 15 : 16, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                ANB Parts
              </div>
              <div
                style={{
                  fontSize: compactDesktop ? 10 : 11,
                  color: 'rgba(255,255,255,.42)',
                  fontFamily: "'JetBrains Mono', monospace",
                  marginTop: compactDesktop ? 1 : 2,
                }}
              >
                Gestao Interna
              </div>
            </div>
          ) : null}

          {mode !== 'desktop' ? (
            <button
              onClick={isDrawer ? onClose : onToggle}
              title={
                isDrawer
                  ? 'Fechar menu'
                  : expanded
                  ? 'Minimizar menu'
                  : 'Expandir menu'
              }
              style={{
                marginLeft: expanded ? 'auto' : 0,
                width: 34,
                height: 34,
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,.1)',
                background: 'rgba(255,255,255,.08)',
                color: 'rgba(255,255,255,.86)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <ControlIcon name={isDrawer ? 'close' : expanded ? 'collapse' : 'expand'} />
            </button>
          ) : null}
        </div>

        <nav
          className="sidebar-scroll-area"
          style={{
            flex: 1,
            padding: expanded
              ? compactDesktop
                ? '8px 10px 10px'
                : '10px 10px 14px'
              : '10px 8px 14px',
            paddingBottom: isDrawer ? drawerNavBottomPadding : undefined,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          {NAV.map((group, groupIndex) => (
            <div key={group.section}>
              {expanded ? (
                <div
                  style={{
                    fontSize: compactDesktop ? 9.5 : 10,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: 'rgba(255,255,255,.3)',
                    letterSpacing: '1.2px',
                    textTransform: 'uppercase',
                    padding: compactDesktop ? '8px 8px 3px' : '10px 8px 4px',
                  }}
                >
                  {group.section}
                </div>
              ) : groupIndex > 0 ? (
                <div
                  style={{
                    height: 1,
                    margin: compactDesktop ? '8px 12px 6px' : '10px 12px 8px',
                    background: 'rgba(255,255,255,.08)',
                  }}
                />
              ) : null}

              {group.items.map((item) => {
                const active = item.href === activeHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    onClick={(event) => {
                      if (item.href !== activeHref) {
                        if (isDrawer || isTabletLandscape) {
                          event.preventDefault();
                          router.push(item.href);
                        }
                        return;
                      }

                      handleNavigate(item.href);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: expanded ? 'flex-start' : 'center',
                      gap: expanded ? 10 : 0,
                      padding: expanded
                        ? compactDesktop
                          ? '7px 10px'
                          : '9px 10px'
                        : '10px 0',
                      borderRadius: compactDesktop ? 10 : 12,
                      marginBottom: compactDesktop ? 1 : 4,
                      fontSize: expanded ? desktopNavFontSize : 13.5,
                      fontWeight: active ? 600 : 400,
                      color: active ? '#fff' : 'rgba(255,255,255,.66)',
                      background: active ? 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)' : 'transparent',
                      textDecoration: 'none',
                      transition: 'all 150ms ease',
                      minHeight: expanded ? desktopNavHeight : 42,
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <span
                      style={{
                        minWidth: expanded ? desktopIconBox : 26,
                        width: expanded ? desktopIconBox : 26,
                        height: expanded ? desktopIconBox : 26,
                        borderRadius: compactDesktop ? 7 : 8,
                        background: active ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.08)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <SidebarIcon name={item.icon} active={active} size={expanded ? desktopIconSize : 16} />
                    </span>
                    {expanded ? item.label : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div
          style={{
            padding: expanded
              ? compactDesktop
                ? '10px 10px'
                : '12px 10px'
              : '12px 8px',
            paddingBottom: isDrawer ? drawerFooterBottomPadding : undefined,
            borderTop: '1px solid rgba(255,255,255,.08)',
            flexShrink: 0,
          }}
        >
          {user ? (
            expanded ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: compactDesktop ? '8px 10px' : '10px 12px',
                  borderRadius: compactDesktop ? 12 : 14,
                  background: 'rgba(255,255,255,.06)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div
                    style={{
                      width: compactDesktop ? 30 : 34,
                      height: compactDesktop ? 30 : 34,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: compactDesktop ? 12 : 13,
                      fontWeight: 700,
                      color: '#fff',
                      textTransform: 'uppercase',
                      flexShrink: 0,
                    }}
                  >
                    {initial}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: compactDesktop ? 11 : 12, color: 'rgba(255,255,255,.42)' }}>Usuario</div>
                    <div
                      style={{
                        fontSize: compactDesktop ? 12 : 13,
                        fontWeight: 600,
                        color: 'rgba(255,255,255,.84)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        textTransform: 'capitalize',
                      }}
                    >
                      {user}
                    </div>
                  </div>
                </div>
                <button
                  onClick={onLogout}
                  title="Sair"
                  style={{
                    background: 'rgba(255,255,255,.08)',
                    border: '1px solid rgba(255,255,255,.1)',
                    borderRadius: compactDesktop ? 9 : 10,
                    cursor: 'pointer',
                    color: 'rgba(255,255,255,.72)',
                    width: compactDesktop ? 32 : 36,
                    height: compactDesktop ? 32 : 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <ControlIcon name="logout" />
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div
                  title={user}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#fff',
                    textTransform: 'uppercase',
                  }}
                >
                  {initial}
                </div>
                <button
                  onClick={onLogout}
                  title="Sair"
                  style={{
                    background: 'rgba(255,255,255,.08)',
                    border: '1px solid rgba(255,255,255,.1)',
                    borderRadius: 12,
                    cursor: 'pointer',
                    color: 'rgba(255,255,255,.72)',
                    width: 40,
                    height: 40,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ControlIcon name="logout" />
                </button>
              </div>
            )
          ) : null}
        </div>
      </aside>
    </>
  );
}
