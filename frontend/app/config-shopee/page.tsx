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
};

export default function ConfigShopeePage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<any>(null);
  const [environment, setEnvironment] = useState<'sandbox' | 'live'>('sandbox');
  const [savingEnv, setSavingEnv] = useState(false);
  const [desconectando, setDesconectando] = useState(false);

  async function load() {
    const resp = await fetch(`${API}/shopee/status`, { credentials: 'include' });
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
        window.history.replaceState({}, '', '/config-shopee');
        setTimeout(() => alert('Shopee conectada com sucesso.'), 50);
      }
      if (params.get('erro')) {
        const message = params.get('erro') || 'Falha na autorizacao da Shopee';
        window.history.replaceState({}, '', '/config-shopee');
        setTimeout(() => alert(message), 50);
      }
    }
  }, []);

  async function salvarAmbiente() {
    setSavingEnv(true);
    try {
      const resp = await fetch(`${API}/shopee/config`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'Erro ao salvar');
      await load();
      alert('Ambiente da Shopee salvo. Se trocou de ambiente, autorize de novo no Partner Console abaixo.');
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar ambiente');
    } finally {
      setSavingEnv(false);
    }
  }

  async function desconectar() {
    if (!confirm('Desconectar a Shopee? Sera preciso autorizar de novo pelo Partner Console.')) return;
    setDesconectando(true);
    try {
      await fetch(`${API}/shopee/desconectar`, { method: 'POST', credentials: 'include' });
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
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. Shopee</div>
        </div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Shopee</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Conexao direta com a API da Shopee (Open Platform)</div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 6, background: connected ? '#f0fdf4' : '#f1f5f9', color: connected ? '#16a34a' : 'var(--gray-400)', border: `1px solid ${connected ? '#86efac' : 'var(--border)'}` }}>
          {connected ? '✓ Conectado' : 'Nao conectado'}
        </span>
      </div>

      <div style={{ padding: 28, maxWidth: 820 }}>
        <div style={s.card}>
          <div style={s.h3}>Ambiente</div>
          <p style={s.p}>
            Hoje usamos <strong>sandbox</strong> (loja de teste) pra validar o fluxo inteiro antes do Go-Live. Quando a Shopee aprovar a
            revisao de producao, basta trocar pra <strong>live</strong> aqui e autorizar de novo — nao precisa mudar nada no codigo.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={s.label}>Ambiente ativo</label>
              <select style={{ ...s.input, cursor: 'pointer' }} value={environment} onChange={(e) => setEnvironment(e.target.value as any)}>
                <option value="sandbox">Sandbox (teste)</option>
                <option value="live">Live (producao)</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Shop ID conectado</label>
              <div style={{ ...s.input, background: 'var(--gray-50)', color: 'var(--gray-500)' }}>{status?.shopId || '—'}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={salvarAmbiente} disabled={savingEnv}>
              {savingEnv ? 'Salvando...' : 'Salvar ambiente'}
            </button>
            {connected && (
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

        <div style={s.card}>
          <div style={s.h3}>Como autorizar</div>
          <p style={s.p}>
            A Shopee (app tipo <em>Seller In House System</em>) nao usa uma URL de autorizacao gerada por nos — a autorizacao sai de
            dentro do <strong>Shopee Partner Console</strong> ({environment === 'live' ? 'ambiente de producao' : 'ambiente de teste/sandbox'}):
          </p>
          <ol style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.9, paddingLeft: 20, marginBottom: 14 }}>
            <li>Entre no Partner Console da Shopee ({environment === 'live' ? 'open.shopee.com.br' : 'ambiente sandbox'}).</li>
            <li>App List → selecione o app (ANB Parts Integration) → <strong>Authorize</strong>.</li>
            <li>Confirme a loja (shop) que vai ser conectada.</li>
            <li>A Shopee redireciona automaticamente pro nosso callback abaixo, que finaliza a conexao sozinho.</li>
          </ol>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
            Callback OAuth: <code style={{ background: 'var(--gray-100)', padding: '1px 6px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace' }}>{API}/shopee/callback</code>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 6 }}>
            Partner ID e Partner Key ficam configurados direto no servidor (variaveis de ambiente <code>SHOPEE_PARTNER_ID</code> / <code>SHOPEE_PARTNER_KEY</code>), nao precisam ser preenchidos aqui.
          </div>
        </div>
      </div>
    </>
  );
}
