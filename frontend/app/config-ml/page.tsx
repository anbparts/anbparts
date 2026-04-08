'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 26, marginBottom: 18 },
  h3: { fontSize: 15, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6, letterSpacing: '-0.3px' },
  p: { fontSize: 13.5, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 14 },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 13px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

export default function ConfigMlPage() {
  const [loading, setLoading] = useState(true);
  const [mercadoLivreConfig, setMercadoLivreConfig] = useState<any>(null);
  const [mercadoLivreClientId, setMercadoLivreClientId] = useState('');
  const [mercadoLivreClientSecret, setMercadoLivreClientSecret] = useState('');
  const [mercadoPagoClientId, setMercadoPagoClientId] = useState('');
  const [mercadoPagoClientSecret, setMercadoPagoClientSecret] = useState('');
  const [mercadoPagoAccessToken, setMercadoPagoAccessToken] = useState('');
  const [savingMercadoLivre, setSavingMercadoLivre] = useState(false);
  const [savingMercadoPago, setSavingMercadoPago] = useState(false);
  const [syncingMercadoPagoReports, setSyncingMercadoPagoReports] = useState(false);
  const [mercadoLivreStatus, setMercadoLivreStatus] = useState<any>(null);
  const [mercadoPagoStatus, setMercadoPagoStatus] = useState<any>(null);

  async function load() {
    const mlConfig = await api.mercadoLivre.getConfig();
    setMercadoLivreConfig(mlConfig);
    setMercadoLivreClientId('');
    setMercadoLivreClientSecret('');
    setMercadoPagoClientId('');
    setMercadoPagoClientSecret('');
    setMercadoPagoAccessToken('');
  }

  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mercadoLivre') === 'connected') {
        window.history.replaceState({}, '', '/config-ml');
      }
      if (params.get('mercadoPago') === 'connected') {
        window.history.replaceState({}, '', '/config-ml');
        setTimeout(() => alert('Mercado Pago conectado com sucesso.'), 50);
      }
      if (params.get('mercadoPago') === 'error') {
        const message = params.get('message') || 'Falha na autorizacao do Mercado Pago';
        window.history.replaceState({}, '', '/config-ml');
        setTimeout(() => alert(message), 50);
      }
    }
  }, []);

  async function salvarMercadoLivre() {
    if (!mercadoLivreClientId || !mercadoLivreClientSecret) {
      alert('Preencha o Client ID e o Client Secret do Mercado Livre');
      return;
    }

    setSavingMercadoLivre(true);
    try {
      await api.mercadoLivre.saveConfig({
        clientId: mercadoLivreClientId,
        clientSecret: mercadoLivreClientSecret,
      });
      await load();
      alert('Credenciais do Mercado Livre salvas.');
    } catch (error: any) {
      alert(error.message || 'Erro ao salvar configuracao do Mercado Livre');
    } finally {
      setSavingMercadoLivre(false);
    }
  }

  async function salvarMercadoPago() {
    if (!mercadoPagoClientId || !mercadoPagoClientSecret || !mercadoPagoAccessToken) {
      alert('Preencha o Client ID, o Client Secret e o Access Token do Mercado Pago');
      return;
    }

    setSavingMercadoPago(true);
    try {
      await api.mercadoLivre.saveConfig({
        mercadoPagoClientId,
        mercadoPagoClientSecret,
        mercadoPagoAccessToken,
      });
      await load();
      alert('Credenciais do Mercado Pago salvas.');
    } catch (error: any) {
      alert(error.message || 'Erro ao salvar configuracao do Mercado Pago');
    } finally {
      setSavingMercadoPago(false);
    }
  }

  async function conectarMercadoLivre() {
    try {
      const data = await api.mercadoLivre.authUrl();
      if (data?.url && typeof window !== 'undefined') {
        window.location.href = data.url;
      }
    } catch (error: any) {
      alert(error.message || 'Erro ao gerar URL de autorizacao do Mercado Livre');
    }
  }

  async function testarMercadoLivre() {
    setMercadoLivreStatus({ loading: true });
    try {
      setMercadoLivreStatus(await api.mercadoLivre.status());
    } catch (error: any) {
      setMercadoLivreStatus({ ok: false, error: error.message || 'Sem resposta' });
    }
  }

  async function desconectarMercadoLivre() {
    if (!confirm('Desconectar o Mercado Livre?')) return;
    await api.mercadoLivre.disconnect();
    setMercadoLivreStatus(null);
    await load();
  }

  async function testarMercadoPago() {
    setMercadoPagoStatus({ loading: true });
    try {
      setMercadoPagoStatus(await api.mercadoLivre.statusMercadoPago());
    } catch (error: any) {
      setMercadoPagoStatus({ ok: false, error: error.message || 'Sem resposta' });
    }
  }

  async function desconectarMercadoPago() {
    if (!confirm('Desconectar o Mercado Pago?')) return;
    await api.mercadoLivre.disconnectMercadoPago();
    setMercadoPagoStatus(null);
    await load();
  }

  async function atualizarRelatoriosMercadoPago() {
    setSyncingMercadoPagoReports(true);
    setMercadoPagoStatus({ loading: true });
    try {
      const result = await api.mercadoLivre.syncReportsMercadoPago();
      setMercadoPagoStatus({
        ok: true,
        nickname: mercadoLivreConfig?.mercadoPagoUserId || '',
        detail: result?.saldo?.source === 'mercado_pago_balance_api'
          ? 'Saldo atualizado pela API direta do Mercado Pago.'
          : 'Saldo atualizado. O sistema usou fallback pelos relatórios do Mercado Pago.',
      });
      alert(
        result?.saldo?.source === 'mercado_pago_balance_api'
          ? 'Saldo do Mercado Pago atualizado.'
          : 'Saldo atualizado com fallback pelos relatorios do Mercado Pago.',
      );
    } catch (error: any) {
      setMercadoPagoStatus({ ok: false, error: error.message || 'Falha ao atualizar saldo do Mercado Pago' });
    } finally {
      setSyncingMercadoPagoReports(false);
    }
  }

  if (loading) {
    return (
      <>
        <div style={s.topbar}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Config. ML</div>
        </div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Config. ML</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Credenciais e conexoes do Mercado Livre e Mercado Pago</div>
        </div>
      </div>

      <div style={{ padding: 28, maxWidth: 980 }}>
        <div style={s.card}>
          <div style={s.h3}>Conexao Mercado Livre</div>
          <p style={s.p}>
            Configure o aplicativo OAuth do Mercado Livre para habilitar a leitura automatica das perguntas e o envio das respostas direto pelo ANB.
          </p>

          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {mercadoLivreConfig?.hasTokens ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #86efac', fontSize: 13, fontWeight: 600 }}>
                Conectado ao Mercado Livre
              </span>
            ) : mercadoLivreConfig?.clientId ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--amber-light)', color: 'var(--amber)', border: '1px solid #fcd34d', fontSize: 13, fontWeight: 600 }}>
                Credenciais salvas, aguardando autorizacao
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--gray-100)', color: 'var(--gray-400)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
                Nao configurado
              </span>
            )}
            {mercadoLivreConfig?.nickname ? (
              <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                Conta: <strong style={{ color: 'var(--gray-800)' }}>{mercadoLivreConfig.nickname}</strong> {mercadoLivreConfig?.sellerId ? `· Seller ${mercadoLivreConfig.sellerId}` : ''}
              </span>
            ) : null}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 8 }}>Client ID</div>
              <input
                style={s.input}
                value={mercadoLivreClientId}
                onChange={(e) => setMercadoLivreClientId(e.target.value)}
                placeholder={mercadoLivreConfig?.clientId || 'Cole aqui o Client ID do app'}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 8 }}>Client Secret</div>
              <input
                style={s.input}
                type="password"
                value={mercadoLivreClientSecret}
                onChange={(e) => setMercadoLivreClientSecret(e.target.value)}
                placeholder={mercadoLivreConfig?.clientSecretConfigured ? 'Ja configurado. Preencha so para trocar.' : 'Cole aqui o Client Secret'}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: mercadoLivreStatus ? 14 : 0 }}>
            <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={salvarMercadoLivre} disabled={savingMercadoLivre}>
              {savingMercadoLivre ? 'Salvando...' : 'Salvar credenciais'}
            </button>
            {!mercadoLivreConfig?.hasTokens ? (
              <button style={{ ...s.btn, background: '#ffe8cc', color: '#9a3412', borderColor: '#fdba74' }} onClick={conectarMercadoLivre}>
                Conectar com Mercado Livre
              </button>
            ) : (
              <>
                <button style={{ ...s.btn, background: 'var(--green-light)', color: 'var(--green)', borderColor: '#86efac' }} onClick={testarMercadoLivre}>
                  Testar conexao
                </button>
                <button style={{ ...s.btn, background: 'var(--red-light)', color: 'var(--red)', borderColor: '#fca5a5' }} onClick={desconectarMercadoLivre}>
                  Desconectar
                </button>
              </>
            )}
          </div>

          {mercadoLivreStatus && !mercadoLivreStatus.loading ? (
            <div style={{ padding: '12px 14px', borderRadius: 8, border: `1px solid ${mercadoLivreStatus.ok ? '#86efac' : '#fca5a5'}`, background: mercadoLivreStatus.ok ? 'var(--green-light)' : 'var(--red-light)', color: mercadoLivreStatus.ok ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>
              {mercadoLivreStatus.ok
                ? `Conexao OK com a conta ${mercadoLivreStatus.nickname || mercadoLivreConfig?.nickname || ''}`
                : `Erro: ${mercadoLivreStatus.error || 'Nao foi possivel validar a conexao'}`}
            </div>
          ) : null}

          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 12 }}>
            Callback OAuth: <code style={{ background: 'var(--gray-100)', padding: '1px 6px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace' }}>{API}/mercado-livre/callback</code>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.h3}>Conexao Mercado Pago</div>
          <p style={s.p}>
            Salve aqui o Client ID, o Client Secret e o Access Token de producao da aplicacao do Mercado Pago. O dashboard usa esse Access Token para consultar os relatórios oficiais de saldo.
          </p>

          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {mercadoLivreConfig?.mercadoPagoHasTokens ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #86efac', fontSize: 13, fontWeight: 600 }}>
                Access Token configurado
              </span>
            ) : mercadoLivreConfig?.mercadoPagoClientId ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--amber-light)', color: 'var(--amber)', border: '1px solid #fcd34d', fontSize: 13, fontWeight: 600 }}>
                Credenciais salvas, faltando Access Token
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--gray-100)', color: 'var(--gray-400)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
                Nao configurado
              </span>
            )}
            {mercadoLivreConfig?.mercadoPagoUserId ? (
              <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                Conta Mercado Pago: <strong style={{ color: 'var(--gray-800)' }}>{mercadoLivreConfig.mercadoPagoUserId}</strong>
              </span>
            ) : null}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 8 }}>Client ID</div>
              <input
                style={s.input}
                value={mercadoPagoClientId}
                onChange={(e) => setMercadoPagoClientId(e.target.value)}
                placeholder={mercadoLivreConfig?.mercadoPagoClientId || 'Cole aqui o Client ID do app Mercado Pago'}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 8 }}>Client Secret</div>
              <input
                style={s.input}
                type="password"
                value={mercadoPagoClientSecret}
                onChange={(e) => setMercadoPagoClientSecret(e.target.value)}
                placeholder={mercadoLivreConfig?.mercadoPagoClientSecretConfigured ? 'Ja configurado. Preencha so para trocar.' : 'Cole aqui o Client Secret do Mercado Pago'}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 8 }}>Access Token de producao</div>
              <input
                style={s.input}
                type="password"
                value={mercadoPagoAccessToken}
                onChange={(e) => setMercadoPagoAccessToken(e.target.value)}
                placeholder={mercadoLivreConfig?.mercadoPagoAccessTokenConfigured ? 'Ja configurado. Preencha so para trocar.' : 'Cole aqui o APP_USR-... do Mercado Pago'}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: mercadoPagoStatus ? 14 : 0 }}>
            <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={salvarMercadoPago} disabled={savingMercadoPago}>
              {savingMercadoPago ? 'Salvando...' : 'Salvar credenciais Mercado Pago'}
            </button>
            {mercadoLivreConfig?.mercadoPagoHasTokens ? (
              <>
                <button style={{ ...s.btn, background: 'var(--green-light)', color: 'var(--green)', borderColor: '#86efac' }} onClick={testarMercadoPago}>
                  Testar conexao
                </button>
                <button
                  style={{ ...s.btn, background: '#eff6ff', color: '#1d4ed8', borderColor: '#93c5fd' }}
                  onClick={atualizarRelatoriosMercadoPago}
                  disabled={syncingMercadoPagoReports}
                >
                  {syncingMercadoPagoReports ? 'Atualizando relatorios...' : 'Atualizar saldos agora'}
                </button>
                <button style={{ ...s.btn, background: 'var(--red-light)', color: 'var(--red)', borderColor: '#fca5a5' }} onClick={desconectarMercadoPago}>
                  Desconectar
                </button>
              </>
            ) : null}
          </div>

          {mercadoPagoStatus && !mercadoPagoStatus.loading ? (
            <div style={{ padding: '12px 14px', borderRadius: 8, border: `1px solid ${mercadoPagoStatus.ok ? '#86efac' : '#fca5a5'}`, background: mercadoPagoStatus.ok ? 'var(--green-light)' : 'var(--red-light)', color: mercadoPagoStatus.ok ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>
              {mercadoPagoStatus.ok
                ? (mercadoPagoStatus.detail || `Conexao OK com a conta ${mercadoPagoStatus.nickname || mercadoPagoStatus.userId || mercadoLivreConfig?.mercadoPagoUserId || ''}`)
                : `Erro: ${mercadoPagoStatus.error || 'Nao foi possivel validar a conexao'}`}
            </div>
          ) : null}

          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 12 }}>
            Callback autorizacao: <code style={{ background: 'var(--gray-100)', padding: '1px 6px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace' }}>{API}/mercado-livre/mercado-pago/callback</code>
          </div>
        </div>
      </div>
    </>
  );
}
