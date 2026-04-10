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
  const [isCompact, setIsCompact] = useState(false);
  const highlights = [
    { label: 'Motos', text: 'Cadastro, desmontagem e acompanhamento visual do patio' },
    { label: 'Estoque', text: 'Controle de pecas, localizacao, DETRAN e inventario' },
    { label: 'Bling', text: 'Importacao, auditoria e operacao integrada com ERP' },
    { label: 'Financeiro', text: 'Vendas, DRE, despesas e visao diaria do caixa' },
  ];

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const media = window.matchMedia('(max-width: 860px)');
    const sync = () => setIsCompact(media.matches);

    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

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
        minHeight: '100dvh',
        background: 'linear-gradient(180deg, #eef4fb 0%, #f8fafc 100%)',
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: 'clamp(16px, 3vw, 28px)',
      }}
    >
      <div
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          minHeight: 'calc(100dvh - clamp(32px, 6vw, 56px))',
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: 'clamp(16px, 3vw, 28px)',
          alignItems: 'stretch',
        }}
      >
        <section
          style={{
            order: 1,
            background: 'linear-gradient(155deg, #091425 0%, #132b4d 55%, #1d467c 100%)',
            borderRadius: 28,
            padding: isCompact ? '18px 18px 16px' : 'clamp(28px, 5vw, 48px)',
            color: '#fff',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 28px 60px rgba(15, 23, 42, 0.16)',
            minHeight: isCompact ? 'auto' : 'min(720px, 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: isCompact ? 'center' : 'space-between',
            gap: isCompact ? 0 : 28,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 'auto -70px -90px auto',
              width: 260,
              height: 260,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,255,255,.14) 0%, rgba(255,255,255,0) 70%)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: '-80px auto auto -60px',
              width: 220,
              height: 220,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(96,165,250,.18) 0%, rgba(96,165,250,0) 72%)',
              pointerEvents: 'none',
            }}
          />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                background: 'rgba(255,255,255,.08)',
                border: '1px solid rgba(255,255,255,.10)',
                borderRadius: 18,
                padding: '12px 14px',
                marginBottom: isCompact ? 0 : 28,
                backdropFilter: 'blur(8px)',
                width: isCompact ? '100%' : 'auto',
                justifyContent: isCompact ? 'center' : 'flex-start',
              }}
            >
              <img
                src="/logo.jpg"
                alt="ANB Parts"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  objectFit: 'cover',
                  background: '#fff',
                  flexShrink: 0,
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: 12,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,.62)',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  ANB Parts
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px', marginTop: 2 }}>
                  Sistema de gestao interna
                </div>
              </div>
            </div>

            {!isCompact ? (
            <div style={{ maxWidth: 520 }}>
              <div
                style={{
                  fontSize: 'clamp(31px, 4vw, 46px)',
                  lineHeight: 1.04,
                  fontWeight: 700,
                  letterSpacing: '-1.2px',
                  marginBottom: 16,
                }}
              >
                Operacao centralizada para equipe, estoque e vendas.
              </div>
              <div
                style={{
                  fontSize: 'clamp(14px, 1.7vw, 16px)',
                  lineHeight: 1.8,
                  color: 'rgba(255,255,255,.74)',
                }}
              >
                Acesse o ambiente interno da ANB Parts em qualquer dispositivo para acompanhar as rotinas do dia, filtrar operacoes e manter o fluxo comercial organizado.
              </div>
            </div>
            ) : null}
          </div>

          {!isCompact ? (
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 14,
            }}
          >
            {highlights.map((item) => (
              <div
                key={item.label}
                style={{
                  background: 'rgba(255,255,255,.07)',
                  border: '1px solid rgba(255,255,255,.10)',
                  borderRadius: 18,
                  padding: '16px 16px 15px',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '.12em',
                    color: 'rgba(255,255,255,.56)',
                    fontFamily: "'JetBrains Mono', monospace",
                    marginBottom: 8,
                  }}
                >
                  {item.label}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,.88)' }}>
                  {item.text}
                </div>
              </div>
            ))}
          </div>
          ) : null}
        </section>

        <section
          style={{
            order: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 0,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 460,
              background: 'rgba(255,255,255,.92)',
              border: '1px solid rgba(148,163,184,.20)',
              borderRadius: 28,
              padding: 'clamp(24px, 4vw, 38px)',
              boxShadow: '0 24px 50px rgba(15, 23, 42, 0.10)',
            }}
          >
            <div style={{ marginBottom: 30 }}>
              <div
                style={{
                  fontSize: 12,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: '#94a3b8',
                  fontFamily: "'JetBrains Mono', monospace",
                  marginBottom: 10,
                }}
              >
                Login seguro
              </div>
              <div
                style={{
                  fontSize: 'clamp(28px, 4vw, 34px)',
                  lineHeight: 1.08,
                  fontWeight: 700,
                  color: '#0f172a',
                  letterSpacing: '-0.9px',
                  marginBottom: 10,
                }}
              >
                Bem-vindo de volta
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.75, color: '#64748b' }}>
                Entre com suas credenciais para acessar o sistema da ANB Parts no celular, tablet ou notebook.
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 8 }}>
                  Usuario
                </label>
                <input
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="Digite seu usuario"
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{
                    width: '100%',
                    background: '#fff',
                    border: '1px solid #dbe3ef',
                    borderRadius: 14,
                    padding: '14px 16px',
                    fontSize: 16,
                    lineHeight: 1.4,
                    outline: 'none',
                    color: '#0f172a',
                    boxShadow: 'inset 0 1px 2px rgba(15,23,42,.03)',
                  }}
                />
              </div>

              <div style={{ marginBottom: 22 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 8 }}>
                  Senha
                </label>
                <input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  style={{
                    width: '100%',
                    background: '#fff',
                    border: '1px solid #dbe3ef',
                    borderRadius: 14,
                    padding: '14px 16px',
                    fontSize: 16,
                    lineHeight: 1.4,
                    outline: 'none',
                    color: '#0f172a',
                    boxShadow: 'inset 0 1px 2px rgba(15,23,42,.03)',
                  }}
                />
              </div>

              {error && (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 14,
                    padding: '12px 14px',
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: '#b91c1c',
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
                  background: '#1d4ed8',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 14,
                  padding: '15px 20px',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                  opacity: loading || !user || !pass ? 0.65 : 1,
                  boxShadow: '0 14px 28px rgba(29,78,216,.18)',
                  WebkitAppearance: 'none',
                }}
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>

              <div
                style={{
                  marginTop: 18,
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  gap: 10,
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: '#94a3b8',
                }}
              >
                <span>Acesso interno protegido</span>
                <span>ANB Parts {new Date().getFullYear()}</span>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
