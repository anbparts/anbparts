'use client';
import { useAuth, LoginPage } from '@/lib/auth';
import { Sidebar } from './Sidebar';

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { authed, login, logout, getUser } = useAuth();

  // Still checking session
  if (authed === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)' }}>
        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 13, color: 'var(--ink-muted)' }}>Carregando...</div>
      </div>
    );
  }

  // Not logged in
  if (!authed) {
    return <LoginPage onLogin={login} />;
  }

  // Logged in
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar onLogout={logout} user={getUser()} />
      <main style={{ marginLeft: 'var(--sidebar-w)', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh', width: 'calc(100vw - var(--sidebar-w))' }}>
        {children}
      </main>
    </div>
  );
}
