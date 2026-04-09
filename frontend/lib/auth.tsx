'use client';

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

type LoggedUser = {
  username: string;
  displayName: string;
};

export function useAuth() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<LoggedUser | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          credentials: 'include',
        });

        if (!response.ok) {
          if (active) {
            setUser(null);
            setAuthed(false);
          }
          return;
        }

        const payload = await response.json();
        if (active) {
          setUser(payload.user || null);
          setAuthed(true);
        }
      } catch {
        if (active) {
          setUser(null);
          setAuthed(false);
        }
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  async function login(userName: string, pass: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userName, pass }),
      });

      if (!response.ok) {
        setUser(null);
        setAuthed(false);
        return false;
      }

      const payload = await response.json();
      setUser(payload.user || null);
      setAuthed(true);
      return true;
    } catch {
      setUser(null);
      setAuthed(false);
      return false;
    }
  }

  async function logout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // noop
    }

    setUser(null);
    setAuthed(false);
  }

  function getUser() {
    return user?.displayName || user?.username || '';
  }

  return { authed, login, logout, getUser, user };
}

export function LoginPage({ onLogin }: { onLogin: (u: string, p: string) => Promise<boolean> }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const ok = await onLogin(user, pass);
    if (!ok) setError('Usuario ou senha incorretos');
    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'stretch',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: 420,
          background: '#0a1628',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 40px',
          flexShrink: 0,
        }}
      >
        <img
          src="/logo.jpg"
          alt="ANB Parts"
          style={{ width: 110, height: 110, borderRadius: 20, objectFit: 'cover', marginBottom: 28, background: '#fff' }}
        />
        <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: 6 }}>
          ANB Parts
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,.4)',
            fontFamily: "'JetBrains Mono', monospace",
            marginBottom: 48,
          }}
        >
          Sistema de Gestao Interna
        </div>

        <div style={{ width: '100%' }}>
          {[
            { label: 'Motos', text: 'Gestao de motos e pecas' },
            { label: 'Estoque', text: 'Controle de estoque e inventario' },
            { label: 'Bling', text: 'Integracao com Bling ERP' },
            { label: 'Financeiro', text: 'Faturamento, DRE e despesas' },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid rgba(255,255,255,.06)',
                fontSize: 13,
                color: 'rgba(255,255,255,.55)',
              }}
            >
              <span
                style={{
                  minWidth: 58,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: 'rgba(255,255,255,.38)',
                }}
              >
                {item.label}
              </span>
              {item.text}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          padding: 40,
        }}
      >
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', letterSpacing: '-0.4px', marginBottom: 6 }}>
              Bem-vindo de volta
            </div>
            <div style={{ fontSize: 13.5, color: '#94a3b8' }}>
              Entre com suas credenciais para acessar o sistema.
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#475569', display: 'block', marginBottom: 6 }}>
                Usuario
              </label>
              <input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="Digite seu usuario"
                autoFocus
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  width: '100%',
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 14,
                  outline: 'none',
                  color: '#1e293b',
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#475569', display: 'block', marginBottom: 6 }}>
                Senha
              </label>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="Digite sua senha"
                style={{
                  width: '100%',
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 14,
                  outline: 'none',
                  color: '#1e293b',
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  background: '#fee2e2',
                  border: '1px solid #fca5a5',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 13,
                  color: '#dc2626',
                  marginBottom: 18,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !user || !pass}
              style={{
                width: '100%',
                background: '#1e56a0',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '11px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: loading || !user || !pass ? 0.6 : 1,
              }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div
            style={{
              marginTop: 32,
              fontSize: 11,
              color: '#94a3b8',
              textAlign: 'center',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            ANB Parts © {new Date().getFullYear()}
          </div>
        </div>
      </div>
    </div>
  );
}
