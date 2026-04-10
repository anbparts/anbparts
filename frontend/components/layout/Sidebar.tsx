'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  {
    section: 'Principal',
    items: [
      { href: '/', icon: 'dashboard', label: 'Dashboard' },
      { href: '/motos', icon: 'moto', label: 'Motos' },
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
      { href: '/import', icon: 'upload', label: 'Importar Excel' },
    ],
  },
];

function SidebarIcon({ name, active }: { name: string; active: boolean }) {
  const color = active ? '#ffffff' : 'rgba(255,255,255,.72)';
  const common = {
    width: 16,
    height: 16,
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
    settings: <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.54V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.54 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.54-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.54-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.06 3.4l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.54V2a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.54h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V8c0 .68.4 1.3 1.03 1.58.16.07.33.1.51.1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.32Z" /></svg>,
  };

  return icons[name] || <span style={{ width: 16, height: 16 }} />;
}

export function Sidebar({ onLogout, user }: { onLogout?: () => void; user?: string }) {
  const path = usePathname();

  return (
    <aside
      style={{
        width: 'var(--sidebar-w)',
        minHeight: '100vh',
        background: 'var(--blue-900)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 100,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          padding: '18px 16px',
          borderBottom: '1px solid rgba(255,255,255,.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <img
          src="/logo.jpg"
          alt="ANB Parts"
          style={{
            width: 46,
            height: 46,
            borderRadius: 10,
            objectFit: 'cover',
            display: 'block',
            flexShrink: 0,
            background: '#fff',
          }}
        />
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
            ANB Parts
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,.4)',
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 2,
            }}
          >
            Gestao Interna
          </div>
        </div>
      </div>

      <nav
        style={{
          flex: 1,
          padding: '10px 10px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {NAV.map((group) => (
          <div key={group.section}>
            <div
              style={{
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                color: 'rgba(255,255,255,.3)',
                letterSpacing: '1.2px',
                textTransform: 'uppercase',
                padding: '10px 8px 4px',
              }}
            >
              {group.section}
            </div>
            {group.items.map((item) => {
              const active = path === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    marginBottom: 1,
                    fontSize: 13.5,
                    fontWeight: active ? 500 : 400,
                    color: active ? '#fff' : 'rgba(255,255,255,.6)',
                    background: active ? 'var(--blue-500)' : 'transparent',
                    textDecoration: 'none',
                    transition: 'all 150ms',
                  }}
                >
                  <span
                    style={{
                      minWidth: 26,
                      height: 20,
                      borderRadius: 6,
                      background: active ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.08)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <SidebarIcon name={item.icon} active={active} />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
        {user && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(255,255,255,.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'var(--blue-500)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#fff',
                  textTransform: 'uppercase',
                }}
              >
                {user[0]}
              </div>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', textTransform: 'capitalize' }}>{user}</span>
            </div>
            <button
              onClick={onLogout}
              title="Sair"
              style={{
                background: 'rgba(255,255,255,.08)',
                border: '1px solid rgba(255,255,255,.1)',
                borderRadius: 6,
                cursor: 'pointer',
                color: 'rgba(255,255,255,.5)',
                fontSize: 14,
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              S
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
