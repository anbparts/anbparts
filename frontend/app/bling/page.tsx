'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
const s: any = {
  topbar: {
    height: 'var(--topbar-h)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px',
    background: 'var(--white)',
    borderBottom: '1px solid var(--border)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 50,
  },
  card: {
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 26,
    marginBottom: 18,
  },
  h3: { fontSize: 15, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6, letterSpacing: '-0.3px' },
  p: { fontSize: 13.5, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: 500, color: 'var(--gray-600)', display: 'block', marginBottom: 5 },
  input: {
    width: '100%',
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: 7,
    padding: '9px 13px',
    fontSize: 14,
    fontFamily: 'Inter, sans-serif',
    outline: 'none',
    color: 'var(--gray-800)',
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '9px 18px',
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid transparent',
    fontFamily: 'Inter, sans-serif',
  },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500 },
  step: { display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 16 },
  stepN: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: 'var(--blue-500)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    marginTop: 1,
  },
};

export default function BlingConfigPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [connStatus, setConnStatus] = useState<any>(null);

  useEffect(() => {
    load();
    if (window.location.search.includes('connected=true')) {
      window.history.replaceState({}, '', '/bling');
    }
  }, []);

  async function load() {
    setLoading(true);
    try {
      setConfig(await fetch(`${API}/bling/config`).then((r) => r.json()));
    } catch {
      setConfig(null);
    }
    setLoading(false);
  }

  async function saveCredentials() {
    if (!clientId || !clientSecret) return;
    setSaving(true);
    try {
      await fetch(`${API}/bling/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      setClientId('');
      setClientSecret('');
      await load();
    } catch {
      alert('Erro ao salvar');
    }
    setSaving(false);
  }

  async function connectBling() {
    const data = await fetch(`${API}/bling/auth-url`).then((r) => r.json());
    if (data.url) window.location.href = data.url;
    else alert(data.error || 'Erro ao gerar URL');
  }

  async function testConn() {
    setConnStatus({ loading: true });
    try {
      setConnStatus(await fetch(`${API}/bling/status`).then((r) => r.json()));
    } catch {
      setConnStatus({ ok: false, error: 'Sem resposta' });
    }
  }

  async function disconnect() {
    if (!confirm('Desconectar o Bling?')) return;
    await fetch(`${API}/bling/disconnect`, { method: 'DELETE' });
    setConnStatus(null);
    await load();
  }

  if (loading) {
    return (
      <>
        <div style={s.topbar}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. Conexao Bling</div>
        </div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  const connected = config?.hasTokens;

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Conexao Bling</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Credenciais OAuth e conexao do Bling</div>
        </div>
        <div>
          {connected ? (
            <span style={{ ...s.badge, background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #86efac' }}>
              OK Bling conectado
            </span>
          ) : config?.clientId ? (
            <span style={{ ...s.badge, background: 'var(--amber-light)', color: 'var(--amber)', border: '1px solid #fcd34d' }}>
              Aguardando autorizacao
            </span>
          ) : (
            <span style={{ ...s.badge, background: 'var(--gray-100)', color: 'var(--gray-400)', border: '1px solid var(--border)' }}>
              Nao configurado
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: 28, maxWidth: 680 }}>
        <div style={s.card}>
          <div style={s.h3}>Como configurar</div>
          <p style={s.p}>A API do Bling usa OAuth 2.0. Crie um aplicativo no painel do Bling:</p>
          {[
            { n: 1, t: <>No Bling: <strong>Preferencias -> Todas as Configuracoes -> Cadastro de Aplicativos -> CRIAR NOVO</strong></> },
            { n: 2, t: <>Nome: <strong>ANB Parts</strong> · URL de Redirecionamento: <code style={{ background: 'var(--gray-100)', padding: '1px 6px', borderRadius: 4, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{API}/bling/callback</code></> },
            { n: 3, t: <>Escopos: marque <strong>Produtos</strong> e <strong>Pedidos de Venda</strong>. Salve.</> },
            { n: 4, t: <>Copie o <strong>Client ID</strong> e <strong>Client Secret</strong> e cole abaixo.</> },
          ].map(({ n, t }) => (
            <div key={n} style={s.step}>
              <div style={s.stepN}>{n}</div>
              <div style={{ fontSize: 13.5, color: 'var(--gray-600)', lineHeight: 1.7 }}>{t}</div>
            </div>
          ))}
        </div>

        <div style={s.card}>
          <div style={s.h3}>Credenciais do aplicativo</div>
          {config?.clientId && (
            <div style={{ background: 'var(--green-light)', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--green)' }}>
              Client ID: <strong>{config.clientId}</strong>
              {config.connectedAt && (
                <span style={{ marginLeft: 8, color: 'var(--gray-400)', fontSize: 12 }}>
                  · {new Date(config.connectedAt).toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={s.label}>Client ID</label>
              <input style={s.input} autoComplete="off" placeholder="Cole aqui o Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Client Secret</label>
              <input style={s.input} type="password" autoComplete="new-password" placeholder="Cole aqui o Client Secret" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
            </div>
          </div>
          <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={saveCredentials} disabled={saving || !clientId || !clientSecret}>
            {saving ? 'Salvando...' : 'Salvar credenciais'}
          </button>
        </div>

        {config?.clientId && (
          <div style={s.card}>
            <div style={s.h3}>Autorizacao OAuth</div>
            <p style={s.p}>Clique em <strong>Conectar com Bling</strong> para autorizar. Voce sera redirecionado ao Bling e voltara automaticamente.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {!connected ? (
                <button style={{ ...s.btn, background: '#FF6900', color: '#fff' }} onClick={connectBling}>Conectar com Bling</button>
              ) : (
                <>
                  <button style={{ ...s.btn, background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #86efac' }} onClick={testConn}>
                    {connStatus?.loading ? 'Testando...' : 'Testar conexao'}
                  </button>
                  <button style={{ ...s.btn, background: 'var(--red-light)', color: 'var(--red)', border: '1px solid #fca5a5' }} onClick={disconnect}>
                    Desconectar
                  </button>
                </>
              )}
            </div>
            {connStatus && !connStatus.loading && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: connStatus.ok ? 'var(--green-light)' : 'var(--red-light)', border: `1px solid ${connStatus.ok ? '#86efac' : '#fca5a5'}`, borderRadius: 8, fontSize: 13, color: connStatus.ok ? 'var(--green)' : 'var(--red)' }}>
                {connStatus.ok ? 'Conexao OK' : `Erro: ${connStatus.error}`}
              </div>
            )}
          </div>
        )}

        <div style={{ ...s.card, background: 'var(--gray-50)' }}>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', lineHeight: 1.9 }}>
            • URL de callback no Bling:{' '}
            <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>
              {API}/bling/callback
            </code>
            <br />
            • Configure o de/para de SKU em <a href="/bling/config-produtos" style={{ color: 'var(--blue-500)' }}>Conf. Produtos Bling</a> antes de importar
          </div>
        </div>
      </div>
    </>
  );
}
