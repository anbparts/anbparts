'use client';
import { useState, useEffect } from 'react';

const USERS: Record<string, string> = {
  bruno:   process.env.NEXT_PUBLIC_PASS_BRUNO   || 'anb2024',
  nelson:  process.env.NEXT_PUBLIC_PASS_NELSON  || 'anb2024',
  alex:    process.env.NEXT_PUBLIC_PASS_ALEX    || 'anb2024',
};

export function useAuth() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const session = sessionStorage.getItem('anb_session');
    setAuthed(session === 'ok');
  }, []);

  function login(user: string, pass: string): boolean {
    if (USERS[user.toLowerCase()] && USERS[user.toLowerCase()] === pass) {
      sessionStorage.setItem('anb_session', 'ok');
      sessionStorage.setItem('anb_user', user);
      setAuthed(true);
      return true;
    }
    return false;
  }

  function logout() {
    sessionStorage.removeItem('anb_session');
    sessionStorage.removeItem('anb_user');
    setAuthed(false);
  }

  function getUser() {
    return typeof window !== 'undefined' ? sessionStorage.getItem('anb_user') || '' : '';
  }

  return { authed, login, logout, getUser };
}

export function LoginPage({ onLogin }: { onLogin: (u: string, p: string) => boolean }) {
  const [user, setUser]   = useState('');
  const [pass, setPass]   = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setTimeout(() => {
      const ok = onLogin(user, pass);
      if (!ok) setError('Usuário ou senha incorretos');
      setLoading(false);
    }, 400);
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--gray-50)', fontFamily: 'Geist, sans-serif',
    }}>
      <div style={{
        background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16,
        padding: '40px 36px', width: '100%', maxWidth: 380,
        boxShadow: '0 4px 24px rgba(0,0,0,.08)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 40, height: 40, background: 'var(--ink)', borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--white)', fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 500,
          }}>ANB</div>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' }}>ANB Parts</div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Gestão de Peças</div>
          </div>
        </div>

        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 600, marginBottom: 6, letterSpacing: '-0.3px' }}>
          Entrar no sistema
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 28 }}>
          Acesso restrito — use suas credenciais
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)', display: 'block', marginBottom: 5 }}>
              Usuário
            </label>
            <input
              style={{
                width: '100%', background: 'var(--white)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 14px', fontSize: 14, fontFamily: 'Geist, sans-serif',
                outline: 'none', color: 'var(--ink)', transition: '150ms',
              }}
              placeholder="Ex: bruno"
              value={user}
              onChange={e => setUser(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div style={{ marginBottom: 22 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)', display: 'block', marginBottom: 5 }}>
              Senha
            </label>
            <input
              type="password"
              style={{
                width: '100%', background: 'var(--white)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 14px', fontSize: 14, fontFamily: 'Geist, sans-serif',
                outline: 'none', color: 'var(--ink)', transition: '150ms',
              }}
              placeholder="••••••••"
              value={pass}
              onChange={e => setPass(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', background: loading ? 'var(--gray-400)' : 'var(--ink)', color: 'var(--white)',
              border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Geist, sans-serif',
              transition: '150ms',
            }}
          >
            {loading ? 'Verificando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
