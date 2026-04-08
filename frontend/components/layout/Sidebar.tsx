'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  {
    section: 'Principal',
    items: [
      { href: '/', icon: 'DB', label: 'Dashboard' },
      { href: '/motos', icon: 'MT', label: 'Motos' },
      { href: '/estoque', icon: 'CX', label: 'Estoque' },
      { href: '/import', icon: 'XL', label: 'Importar Excel' },
      { href: '/inventario', icon: 'INV', label: 'Inventario' },
    ],
  },
  {
    section: 'Financeiro',
    items: [
      { href: '/faturamento', icon: 'FM', label: 'Fat. por Moto' },
      { href: '/faturamento/geral', icon: 'FG', label: 'Fat. Geral' },
      { href: '/despesas-receita', icon: 'DXR', label: 'Despesas x Receita' },
      { href: '/dre', icon: 'DRE', label: 'DRE' },
      { href: '/despesas', icon: 'DES', label: 'Despesas' },
      { href: '/prejuizos', icon: 'PRJ', label: 'Prejuizos' },
      { href: '/investimentos', icon: 'INV$', label: 'Investimentos' },
    ],
  },
  {
    section: 'Bling ERP',
    items: [
      { href: '/bling/vendas', icon: 'V', label: 'Vendas' },
      { href: '/bling/relatorio-vendas', icon: 'RV', label: 'Relatorio de Vendas' },
      { href: '/bling/produtos', icon: 'PD', label: 'Produtos' },
      { href: '/bling/auditoria-automatica', icon: 'AA', label: 'Auditoria Automatica' },
    ],
  },
  {
    section: 'Mercado Livre',
    items: [
      { href: '/mercado-livre/perguntas', icon: 'PQ', label: 'Perguntas' },
    ],
  },
  {
    section: 'Configuracoes',
    items: [
      { href: '/bling', icon: 'CB', label: 'Conf. Conexao Bling' },
      { href: '/configuracoes-gerais', icon: 'EM', label: 'Conf. E-mails' },
      { href: '/bling/config-produtos', icon: 'PB', label: 'Conf. Produtos Bling' },
      { href: '/conf-gerais', icon: 'CG', label: 'Conf. Gerais' },
    ],
  },
];

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
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #1d4ed8 0%, #0f172a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: '-0.4px',
            flexShrink: 0,
          }}
        >
          ANB
        </div>
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
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '.2px',
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
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
