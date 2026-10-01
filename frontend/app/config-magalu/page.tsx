'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 26, marginBottom: 18 },
  h3: { fontSize: 15, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6, letterSpacing: '-0.3px' },
  p: { fontSize: 13.5, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 14 },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 13px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  label: { fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase' as const, marginBottom: 8, display: 'block' },
  code: { background: 'var(--gray-100)', padding: '1px 6px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 },
  pre: { background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-700)', whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const, lineHeight: 1.6 },
};

export default function ConfigMagaluPage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<any>(null);
  const [environment, setEnvironment] = useState<'sandbox' | 'live'>('sandbox');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [desconectando, setDesconectando] = useState(false);

  async function load() {
    const resp = await fetch(`${API}/magalu/status`, { credentials: 'include' });
    const data = await resp.json();
    if (data.ok) {
      setStatus(data);
      setEnvironment(data.environment === 'live' ? 'live' : 'sandbox');
    }
  }

  useEffect(() => {
    load().catch(() => {}).finally(() => setLoading(false));
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('conectado') === '1') {
        window.history.replaceState({}, '', '/config-magalu');
        setTimeout(() => alert('Magalu conectado com sucesso.'), 50);
      }
      if (params.get('erro')) {
        const message = params.get('erro') || 'Falha na autorizacao do Magalu';
        window.history.replaceState({}, '', '/config-magalu');
        setTimeout(() => alert(message), 50);
      }
    }
  }, []);

  async function salvarCredenciais() {
    setSaving(true);
    try {
      const body: any = { environment };
      if (clientId) body.clientId = clientId;
      if (clientSecret) body.clientSecret = clientSecret;
      const resp = await fetch(`${API}/magalu/config`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'Erro ao salvar');
      setClientSecret('');
      await load();
      alert('Credenciais do Magalu salvas.');
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar credenciais');
    } finally {
      setSaving(false);
    }
  }

  async function conectar() {
    try {
      const resp = await fetch(`${API}/magalu/auth-url`, { credentials: 'include' });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'Erro ao gerar URL de autorizacao');
      window.location.href = data.url;
    } catch (e: any) {
      alert(e.message || 'Erro ao gerar URL de autorizacao do Magalu');
    }
  }

  async function desconectar() {
    if (!confirm('Desconectar o Magalu? Sera preciso autorizar de novo.')) return;
    setDesconectando(true);
    try {
      await fetch(`${API}/magalu/desconectar`, { method: 'POST', credentials: 'include' });
      await load();
    } finally {
      setDesconectando(false);
    }
  }

  const connected = !!status?.connected;

  if (loading) {
    return (
      <>
        <div style={s.topbar}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. Magalu</div>
        </div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Magalu</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Conexao direta com a API do Magalu (Open API / Plataforma do Grupo Magalu)</div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 6, background: connected ? '#f0fdf4' : '#f1f5f9', color: connected ? '#16a34a' : 'var(--gray-400)', border: `1px solid ${connected ? '#86efac' : 'var(--border)'}` }}>
          {connected ? '✓ Conectado' : 'Nao conectado'}
        </span>
      </div>

      <div style={{ padding: 28, maxWidth: 860 }}>
        <div style={{ ...s.card, background: '#fff7ed', borderColor: '#fed7aa' }}>
          <div style={s.h3}>⚠ Pre-requisito: criar o client via CLI IDM</div>
          <p style={s.p}>
            Diferente da Shopee, o Magalu nao tem um console web pra criar o app — o <strong>client_id</strong> e <strong>client_secret</strong> sao
            gerados numa CLI propria chamada <strong>IDM</strong> (ID Magalu), que voce roda na sua maquina. Resumo do passo a passo (doc completa em{' '}
            <code style={s.code}>developers.magalu.com</code>, secao &quot;Como Criar e Configurar um Cliente&quot;):
          </p>
          <ol style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.9, paddingLeft: 20, marginBottom: 14 }}>
            <li>Baixe a CLI IDM (pagina de Lancamentos do IDM) e faca <code style={s.code}>./idm login</code> com a conta do seller.</li>
            <li>Rode <code style={s.code}>./idm client create</code> com o redirect-uri e os escopos abaixo.</li>
            <li>Guarde o <strong>Client ID</strong> e <strong>Client Secret</strong> gerados (o secret so aparece 1 vez) e cole aqui embaixo.</li>
          </ol>
          <div style={{ marginBottom: 10 }}>
            <label style={s.label}>Redirect URI a usar no --redirect-uris</label>
            <div style={s.pre}>{status?.redirectUri}</div>
          </div>
          <div>
            <label style={s.label}>Escopos a usar no --scopes e --scopes-default</label>
            <div style={s.pre}>{status?.scopes}</div>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.h3}>Ambiente e Credenciais</div>
          <p style={s.p}>
            Hoje usamos <strong>sandbox</strong> pra validar o fluxo (onboarding de seller fake). Quando formos pra producao, troque o
            ambiente abaixo, gere um client novo via IDM com audience de producao e cole as credenciais novas — nao precisa mudar nada no codigo.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={s.label}>Ambiente ativo</label>
              <select style={{ ...s.input, cursor: 'pointer' }} value={environment} onChange={(e) => setEnvironment(e.target.value as any)}>
                <option value="sandbox">Sandbox (teste)</option>
                <option value="live">Live (producao)</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Client ID</label>
              <input style={s.input} autoComplete="off" name="magalu-client-id-nao-autofill" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={status?.clientId || 'Cole aqui o Client ID gerado pela CLI IDM'} />
            </div>
            <div>
              <label style={s.label}>Client Secret</label>
              <input style={s.input} type="password" autoComplete="new-password" name="magalu-client-secret-nao-autofill" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={status?.clientId ? 'Ja configurado. Preencha so para trocar.' : 'Cole aqui o Client Secret'} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={salvarCredenciais} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar credenciais'}
            </button>
            {!connected ? (
              <button style={{ ...s.btn, background: '#0047bb', color: '#fff' }} onClick={conectar} disabled={!status?.clientId}>
                Conectar com ID Magalu
              </button>
            ) : (
              <button style={{ ...s.btn, background: 'var(--red-light)', color: 'var(--red)', borderColor: '#fca5a5' }} onClick={desconectar} disabled={desconectando}>
                {desconectando ? 'Desconectando...' : 'Desconectar'}
              </button>
            )}
          </div>

          {status?.connectedAt && (
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 12 }}>
              Conectado em: {new Date(status.connectedAt).toLocaleString('pt-BR')}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
