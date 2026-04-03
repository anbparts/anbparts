'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/',                  icon: '⊞', label: 'Dashboard'     },
  { href: '/motos',             icon: '🏍', label: 'Motos'         },
  { href: '/estoque',           icon: '📦', label: 'Estoque'       },
  { href: '/faturamento',       icon: '📊', label: 'Fat. por Moto' },
  { href: '/faturamento/geral', icon: '💰', label: 'Fat. Geral'    },
];

export function Sidebar({ onLogout, user }: { onLogout?: () => void; user?: string }) {
  const path = usePathname();

  return (
    <aside style={{
      width: 'var(--sidebar-w)', minHeight: '100vh',
      background: 'var(--white)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, background: 'var(--ink)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--white)', fontFamily: 'Fraunces, serif', fontSize: 14, fontWeight: 500,
          }}>ANB</div>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>ANB Parts</div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace', letterSpacing: '0.5px' }}>Gestão de Peças</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 10, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '1.2px', textTransform: 'uppercase', padding: '0 8px', marginBottom: 6 }}>Menu</div>
        {nav.map(item => {
          const active = item.href === '/' ? path === '/' : path.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
              borderRadius: 6, fontSize: 13.5, fontWeight: active ? 500 : 400,
              color: active ? 'var(--ink)' : 'var(--ink-soft)',
              background: active ? 'var(--gray-100)' : 'transparent',
              textDecoration: 'none', transition: '150ms ease',
            }}>
              <span style={{ width: 20, textAlign: 'center', fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
        <Link href="/import" style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
          borderRadius: 6, fontSize: 13.5, fontWeight: 400,
          color: path === '/import' ? 'var(--ink)' : 'var(--ink-soft)',
          background: path === '/import' ? 'var(--gray-100)' : 'transparent',
          textDecoration: 'none', transition: '150ms ease',
        }}>
          <span style={{ width: 20, textAlign: 'center', fontSize: 15 }}>📥</span>
          Importar Excel
        </Link>
      </nav>

      {/* User + Logout */}
      <div style={{ padding: '14px 12px', borderTop: '1px solid var(--border)' }}>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>
                {user[0]}
              </div>
              <span style={{ fontSize: 13, color: 'var(--ink-soft)', textTransform: 'capitalize' }}>{user}</span>
            </div>
            <button onClick={onLogout} title="Sair" style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--ink-muted)', fontSize: 16, padding: 4, borderRadius: 4,
            }}>⎋</button>
          </div>
        )}
      </div>
    </aside>
  );
}
