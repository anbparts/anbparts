'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 26, marginBottom: 18 },
  h3: { fontSize: 15, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6, letterSpacing: '-0.3px' },
  p: { fontSize: 13.5, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 14 },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 5, display: 'block' },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 13px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)', boxSizing: 'border-box' as const },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  badge: (ok: boolean) => ({ fontSize: 12, fontWeight: 600, color: ok ? 'var(--green)' : 'var(--amber)', background: ok ? '#f0fdf4' : '#fffbeb', border: `1px solid ${ok ? '#86efac' : '#fcd34d'}`, padding: '4px 12px', borderRadius: 20 }),
};

export default function ConfNuvemshopPage() {
  const [loading, setLoading] = useState(true);
  const [appId, setAppId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [storeId, setStoreId] = useState('');
  const [configured, setConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testando, setTestando] = useState(false);
  const [testeResult, setTesteResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await fetch(`${API}/nuvemshop/config`, { credentials: 'include' }).then(r => r.json());
      setAppId(data.appId || '');
      setClientSecret(data.clientSecret || '');
      setAccessToken(data.accessToken || '');
      setStoreId(data.storeId || '');
      setConfigured(!!data.configured);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function salvar() {
    setSaving(true);
    setTesteResult(null);
    try {
      const resp = await fetch(`${API}/nuvemshop/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appId, clientSecret, accessToken, storeId }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'Erro ao salvar');
      await load();
      alert('Credenciais salvas!');
    } catch (e: any) { alert(`Erro: ${e.message}`); }
    setSaving(false);
  }

  async function testar() {
    setTestando(true);
    setTesteResult(null);
    try {
      const resp = await fetch(`${API}/nuvemshop/testar-conexao`, { method: 'POST', credentials: 'include' });
      const data = await resp.json();
      if (data.ok) {
        setTesteResult({ ok: true, msg: `Conectado! Loja: ${data.loja} (Store ID: ${data.storeId})` });
      } else {
        setTesteResult({ ok: false, msg: data.error || 'Falha na conexao' });
      }
    } catch (e: any) { setTesteResult({ ok: false, msg: e.message }); }
    setTestando(false);
  }

  if (loading) {
    return (
      <>
        <div style={s.topbar}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. Nuvemshop</div>
        </div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Nuvemshop</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Credenciais de acesso à API da Nuvemshop</div>
        </div>
        <span style={s.badge(configured)}>{configured ? '✓ Conectado' : 'Nao configurado'}</span>
      </div>

      <div style={{ padding: 28, maxWidth: 980 }}>

        {/* Credenciais */}
        <div style={s.card}>
          <div style={s.h3}>Credenciais do aplicativo</div>
          <div style={s.p}>Preencha os dados do seu App Nuvemshop. O Access Token não expira — só invalida se você gerar um novo ou desinstalar o app.</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={s.label}>App ID</label>
              <input style={s.input} placeholder="Ex: 29803" value={appId} onChange={(e) => setAppId(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Store ID</label>
              <input style={s.input} placeholder="Ex: 5831954" value={storeId} onChange={(e) => setStoreId(e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={s.label}>Client Secret</label>
            <input
              style={s.input}
              type="password"
              placeholder={clientSecret === '********' ? '(já configurado — deixe em branco para manter)' : 'Cole o Client Secret'}
              value={clientSecret === '********' ? '' : clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={s.label}>Access Token</label>
            <input
              style={s.input}
              type="password"
              placeholder={accessToken === '********' ? '(já configurado — deixe em branco para manter)' : 'Cole o Access Token permanente'}
              value={accessToken === '********' ? '' : accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', opacity: saving ? 0.7 : 1 }} onClick={salvar} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar credenciais'}
            </button>
            <button style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-700)', opacity: testando ? 0.7 : 1 }} onClick={testar} disabled={testando}>
              {testando ? 'Testando...' : 'Testar conexao'}
            </button>
          </div>

          {testeResult && (
            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: testeResult.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${testeResult.ok ? '#86efac' : '#fecaca'}`, fontSize: 13, color: testeResult.ok ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
              {testeResult.ok ? '✓ ' : '✗ '}{testeResult.msg}
            </div>
          )}
        </div>

        {/* Como configurar */}
        <div style={s.card}>
          <div style={s.h3}>Como configurar</div>
          <div style={s.p}>Para integrar com a API da Nuvemshop, você precisa de um App criado no portal de parceiros e instalado na sua loja.</div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
            {[
              { n: 1, t: <>Acesse <strong>partners.nuvemshop.com.br</strong> e crie um aplicativo</> },
              { n: 2, t: <>Copie o <strong>App ID</strong> e o <strong>Client Secret</strong> gerados</> },
              { n: 3, t: <>Instale o app na sua loja acessando: <code style={{ background: 'var(--gray-100)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>tiendanube.com/apps/&#123;APP_ID&#125;/authorize</code></> },
              { n: 4, t: <>Execute o curl fornecido pela Nuvemshop para obter o <strong>Access Token</strong> permanente</> },
              { n: 5, t: <>O <strong>Store ID</strong> é retornado junto com o Access Token (campo <code style={{ background: 'var(--gray-100)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>user_id</code>)</> },
            ].map(({ n, t }) => (
              <div key={n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ minWidth: 24, height: 24, borderRadius: '50%', background: 'var(--gray-800)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
                <span style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.6 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Dicas */}
        <div style={{ ...s.card, background: 'var(--gray-50)' }}>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', lineHeight: 1.9 }}>
            <strong style={{ color: 'var(--gray-500)' }}>Dicas</strong><br />
            • O Access Token não expira — só invalida se você gerar um novo ou desinstalar o app<br />
            • Store ID = user_id retornado no momento da autenticação<br />
            • A integração com status real de anúncios da Nuvemshop usa esses dados (Bloco 2)
          </div>
        </div>

      </div>
    </>
  );
}
